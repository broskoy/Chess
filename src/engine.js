// Rules engine. Pure functions over a plain state object, no DOM access,
// so it runs the same in the browser, in Node tests, or on a future server.
//
// Coordinates: { r, c } with r = 0 being black's back rank (rank 8)
// and c = 0 being the a-file.

export const WHITE = 'white';
export const BLACK = 'black';

export const DEFAULT_SETTINGS = {
    kingCapture: true,       // the king can be captured to win; moves into check are allowed
    whiteRuler: 'king',      // one of RULERS
    blackRuler: 'king',
    alchemistBudget: 0,      // points an Alchemist starts a new game with
};

// Each side's king is a ruler. A plain king has no ability.
export const RULERS = ['king', 'necromancer', 'alchemist'];

export function rulerOf(state, color) {
    return state.settings[`${color}Ruler`];
}

const VECTORS = {
    ortho: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    diag: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
    knight: [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]],
};
const ALL_DIRECTIONS = [...VECTORS.ortho, ...VECTORS.diag];

const BACK_RANK = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
// Pawns only promote to a rook for now, so promotion isn't too strong.
// Rulers may get their own promotion rules later.
export const PROMOTION_TYPES = ['rook'];
const FEN_TYPES ={ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

// Standard piece values: used for material counts, the Alchemist's budget, and later the bot.
export const PIECE_VALUES = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };

// Types an Alchemist can convert from and into. The ruler is never converted.
export const CONVERTIBLE_TYPES = ['pawn', 'knight', 'bishop', 'rook', 'queen'];

export function opponent(color) {
    return color === WHITE ? BLACK : WHITE;
}

function makePiece(type, color, extra = {}) {
    return { type, color, hasMoved: false, ...extra };
}

export function createInitialState(settings = {}) {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    BACK_RANK.forEach((type, c) => {
        board[0][c] = makePiece(type, BLACK);
        board[1][c] = makePiece('pawn', BLACK);
        board[6][c] = makePiece('pawn', WHITE);
        board[7][c] = makePiece(type, WHITE);
    });

    const state = {
        board,
        turn: WHITE,
        // Castling is tracked as rights rather than via rook.hasMoved, so a rook
        // that arrives on a1/h1 some other way can never castle.
        castling: {
            white: { kingside: true, queenside: true },
            black: { kingside: true, queenside: true },
        },
        // Each Necromancer's grave: where the last piece they captured died, { r, c, piece }.
        graves: { white: null, black: null },
        settings: { ...DEFAULT_SETTINGS, ...settings },
    };
    // Alchemist points; only used by a side whose ruler is an Alchemist.
    const budget = state.settings.alchemistBudget;
    state.budget = { white: budget, black: budget };
    return state;
}

// Parses standard FEN: board, turn and castling rights. The en passant and
// move-count fields are ignored, since this game has neither.
export function fromFEN(fen, settings = {}) {
    const [placement, turn = 'w', castling = '-'] = fen.trim().split(/\s+/);
    const state = createInitialState(settings);

    state.board = placement.split('/').map((row, r) => {
        const cells = [];
        for (const ch of row) {
            if (/\d/.test(ch)) {
                for (let i = 0; i < Number(ch); i++) cells.push(null);
            } else {
                const color = ch === ch.toUpperCase() ? WHITE : BLACK;
                const type = FEN_TYPES[ch.toLowerCase()];
                const startRow = color === WHITE ? 6 : 1;
                cells.push(makePiece(type, color, { hasMoved: type === 'pawn' && r !== startRow }));
            }
        }
        return cells;
    });
    state.turn = turn === 'b' ? BLACK : WHITE;
    state.castling = {
        white: { kingside: castling.includes('K'), queenside: castling.includes('Q') },
        black: { kingside: castling.includes('k'), queenside: castling.includes('q') },
    };
    return state;
}

export function inBounds(r, c) {
    return r >= 0 && c >= 0 && r < 8 && c < 8;
}

export function getPiece(state, r, c) {
    return inBounds(r, c) ? state.board[r][c] : null;
}

// --- Move generation ---------------------------------------------------------
//
// Moves are plain objects:
//   { type: 'move', from: {r, c}, to: {r, c}, castle?, promotion? }
//   { type: 'resurrect', to: {r, c} }              Necromancer raises the piece in the grave
//   { type: 'convert', at: {r, c}, into }           Alchemist turns the piece at `at` into type `into`

function pieceMoves(state, r, c) {
    const piece = state.board[r][c];
    const moves = [];
    const from = { r, c };
    const add = (tr, tc) => moves.push({ type: 'move', from, to: { r: tr, c: tc } });
    const isEnemy = (tr, tc) => {
        const target = getPiece(state, tr, tc);
        return target !== null && target.color !== piece.color;
    };
    const isEmpty = (tr, tc) => inBounds(tr, tc) && state.board[tr][tc] === null;

    if (piece.type === 'pawn') {
        const dir = piece.color === WHITE ? -1 : 1;
        const lastRow = homeRow(opponent(piece.color));
        // A pawn reaching the last rank has one move per promotion choice.
        const addPawn = (tr, tc) => {
            if (tr !== lastRow) return add(tr, tc);
            for (const promotion of PROMOTION_TYPES) {
                moves.push({ type: 'move', from, to: { r: tr, c: tc }, promotion });
            }
        };

        if (isEmpty(r + dir, c)) {
            addPawn(r + dir, c);
            // Double step depends on the piece's hasMoved flag, not its rank.
            if (!piece.hasMoved && isEmpty(r + 2 * dir, c)) addPawn(r + 2 * dir, c);
        }
        for (const dc of [-1, 1]) {
            if (isEnemy(r + dir, c + dc)) addPawn(r + dir, c + dc);
        }
        return moves;
    }

    const sliding = piece.type === 'rook' || piece.type === 'bishop' || piece.type === 'queen';
    const vectors = {
        rook: VECTORS.ortho,
        bishop: VECTORS.diag,
        queen: ALL_DIRECTIONS,
        king: ALL_DIRECTIONS,
        knight: VECTORS.knight,
    }[piece.type];

    for (const [dr, dc] of vectors) {
        let tr = r + dr;
        let tc = c + dc;
        while (inBounds(tr, tc)) {
            const target = state.board[tr][tc];
            if (target === null) {
                add(tr, tc);
            } else {
                if (target.color !== piece.color) add(tr, tc);
                break;
            }
            if (!sliding) break;
            tr += dr;
            tc += dc;
        }
    }

    if (piece.type === 'king' && r === homeRow(piece.color) && c === 4) {
        moves.push(...castlingMoves(state, piece.color));
    }
    return moves;
}

function homeRow(color) {
    return color === WHITE ? 7 : 0;
}

// The king may not castle out of, through, or into an attacked square.
// This applies under king capture rules too.
function castlingMoves(state, color) {
    const row = homeRow(color);
    const enemy = opponent(color);
    if (isSquareAttacked(state, row, 4, enemy)) return [];

    const sides = [
        // side, rook column, columns that must be empty, columns the king crosses (last = destination)
        ['kingside', 7, [5, 6], [5, 6]],
        ['queenside', 0, [1, 2, 3], [3, 2]],
    ];
    const moves = [];
    for (const [side, rookCol, mustBeEmpty, kingPath] of sides) {
        const rook = state.board[row][rookCol];
        if (!state.castling[color][side]) continue;
        if (!rook || rook.type !== 'rook' || rook.color !== color) continue;
        if (mustBeEmpty.some(col => state.board[row][col] !== null)) continue;
        if (kingPath.some(col => isSquareAttacked(state, row, col, enemy))) continue;
        moves.push({ type: 'move', from: { r: row, c: 4 }, to: { r: row, c: kingPath[kingPath.length - 1] }, castle: side });
    }
    return moves;
}

// A Necromancer can raise the last piece they captured, on the square where it
// died, once nothing stands there. Right after the capture their own piece is on
// the grave, so it starts blocked. Losing their own pieces doesn't change the grave:
// a recapture leaves the enemy piece standing on it, tied down.
function resurrectMoves(state) {
    const grave = state.graves[state.turn];
    if (rulerOf(state, state.turn) !== 'necromancer' || grave === null) return [];
    if (state.board[grave.r][grave.c] !== null) return [];
    return [{ type: 'resurrect', to: { r: grave.r, c: grave.c } }];
}

// Rows of a side's own half of the board, where an Alchemist may create pawns.
function inOwnHalf(r, color) {
    return color === WHITE ? r >= 4 : r <= 3;
}

// An Alchemist can convert any of their pieces except the ruler into another type.
// Downgrading earns the difference in value, upgrading costs it, and swapping
// between equal values is free. New pawns must be in your own half, since a pawn
// made by alchemy hasn't marched anywhere (this also stops creating pawns that
// promote straight away, and farming points by downgrading next to promotion).
function convertMoves(state) {
    const color = state.turn;
    if (rulerOf(state, color) !== 'alchemist') return [];
    const moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = state.board[r][c];
            if (!piece || piece.color !== color || piece.type === 'king') continue;
            for (const into of CONVERTIBLE_TYPES) {
                if (into === piece.type) continue;
                if (conversionCost(piece.type, into) > state.budget[color]) continue;
                if (into === 'pawn' && !inOwnHalf(r, color)) continue;
                moves.push({ type: 'convert', at: { r, c }, into });
            }
        }
    }
    return moves;
}

// Positive: points spent. Negative: points earned.
export function conversionCost(fromType, intoType) {
    return PIECE_VALUES[intoType] - PIECE_VALUES[fromType];
}

// All moves for the side to move, ignoring whether they leave the king in check.
function pseudoLegalMoves(state) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = state.board[r][c];
            if (piece && piece.color === state.turn) moves.push(...pieceMoves(state, r, c));
        }
    }
    moves.push(...resurrectMoves(state));
    moves.push(...convertMoves(state));
    return moves;
}

export function getLegalMoves(state) {
    const color = state.turn;
    if (state.settings.kingCapture) {
        // Moves into check are allowed, but nothing moves once a king has been taken.
        return isKingCaptured(state) ? [] : pseudoLegalMoves(state);
    }
    return pseudoLegalMoves(state).filter(move => !isInCheck(applyMove(state, move), color));
}

// --- Attacks and game status ---------------------------------------------------

// Looks outward from the square for pieces of `byColor` that attack it.
export function isSquareAttacked(state, r, c, byColor) {
    const has = (tr, tc, ...types) => {
        const p = getPiece(state, tr, tc);
        return p !== null && p.color === byColor && types.includes(p.type);
    };

    // Attacking pawns sit one row "behind" the square from their own point of view.
    const pawnRow = byColor === WHITE ? r + 1 : r - 1;
    if (has(pawnRow, c - 1, 'pawn') || has(pawnRow, c + 1, 'pawn')) return true;

    if (VECTORS.knight.some(([dr, dc]) => has(r + dr, c + dc, 'knight'))) return true;
    if (ALL_DIRECTIONS.some(([dr, dc]) => has(r + dr, c + dc, 'king'))) return true;

    const rays = [[VECTORS.ortho, 'rook'], [VECTORS.diag, 'bishop']];
    for (const [vectors, slider] of rays) {
        for (const [dr, dc] of vectors) {
            let tr = r + dr;
            let tc = c + dc;
            while (inBounds(tr, tc)) {
                const p = state.board[tr][tc];
                if (p !== null) {
                    if (p.color === byColor && (p.type === slider || p.type === 'queen')) return true;
                    break;
                }
                tr += dr;
                tc += dc;
            }
        }
    }
    return false;
}

export function materialOf(state, color) {
    let total = 0;
    for (const row of state.board) {
        for (const piece of row) {
            if (piece && piece.color === color) total += PIECE_VALUES[piece.type];
        }
    }
    return total;
}

export function findKing(state, color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = state.board[r][c];
            if (p && p.type === 'king' && p.color === color) return { r, c };
        }
    }
    return null;
}

export function isInCheck(state, color) {
    const king = findKing(state, color);
    return king !== null && isSquareAttacked(state, king.r, king.c, opponent(color));
}

function isKingCaptured(state) {
    return findKing(state, WHITE) === null || findKing(state, BLACK) === null;
}

// Returns { result, winner, inCheck } where result is one of
// 'playing', 'king-captured', 'no-moves' (king capture rules),
// 'checkmate', 'stalemate' (standard rules).
export function getStatus(state, legalMoves = getLegalMoves(state)) {
    const inCheck = isInCheck(state, state.turn);

    if (state.settings.kingCapture) {
        if (findKing(state, WHITE) === null) return { result: 'king-captured', winner: BLACK, inCheck };
        if (findKing(state, BLACK) === null) return { result: 'king-captured', winner: WHITE, inCheck };
        // Being unable to move at all counts as a loss, like a stalemate does under these rules.
        if (legalMoves.length === 0) return { result: 'no-moves', winner: opponent(state.turn), inCheck };
        return { result: 'playing', winner: null, inCheck };
    }

    if (legalMoves.length > 0) return { result: 'playing', winner: null, inCheck };
    return inCheck
        ? { result: 'checkmate', winner: opponent(state.turn), inCheck }
        : { result: 'stalemate', winner: null, inCheck };
}

// --- Repetition ---------------------------------------------------------------
//
// The state doesn't keep the game's history (copying it on every move would slow
// down searching), so repetition is checked over a list of states kept by the caller.

// Everything that decides which moves are possible, as a string: the board
// (including whether each pawn may still double step), turn, castling rights,
// the grave and the Alchemist budgets. Two states with the same key are the same position.
export function positionKey(state) {
    const squares = state.board.flat().map(p => {
        if (p === null) return '.';
        const letter = p.type === 'knight' ? 'n' : p.type[0];
        const symbol = p.color === WHITE ? letter.toUpperCase() : letter;
        return p.type === 'pawn' && !p.hasMoved ? symbol + '*' : symbol;
    });
    const { castling, graves, budget } = state;
    const rights = [castling.white.kingside, castling.white.queenside, castling.black.kingside, castling.black.queenside]
        .map(Number).join('');
    const graveKey = grave => grave ? `${grave.r}${grave.c}${grave.piece.type}` : '-';
    return [squares.join(''), state.turn, rights, graveKey(graves.white), graveKey(graves.black),
        budget.white, budget.black].join(' ');
}

// True when the last state in `history` has occurred at least three times.
export function isThreefoldRepetition(history) {
    const key = positionKey(history[history.length - 1]);
    return history.filter(state => positionKey(state) === key).length >= 3;
}

// --- Applying moves ------------------------------------------------------------

// Pieces are never mutated (applyMove replaces them), so a copy can share them.
// Settings are shared too, since they don't change during a game.
function cloneState(state) {
    return {
        ...state,
        board: state.board.map(row => row.slice()),
        castling: { white: { ...state.castling.white }, black: { ...state.castling.black } },
        budget: { ...state.budget },
        graves: { ...state.graves },
    };
}

// Returns a new state with the move applied. Does not check legality:
// callers should only pass moves that came from getLegalMoves.
export function applyMove(state, move) {
    const next = cloneState(state);
    const color = state.turn;
    if (move.type === 'resurrect') return applyResurrect(next, color);
    if (move.type === 'convert') return applyConvert(next, move, color);

    const { from, to } = move;
    const piece = next.board[from.r][from.c];
    const captured = next.board[to.r][to.c];
    if (captured && captured.type !== 'king' && rulerOf(state, color) === 'necromancer') {
        next.graves[color] = { r: to.r, c: to.c, piece: captured };
    }

    next.board[to.r][to.c] = move.promotion
        ? makePiece(move.promotion, piece.color, { hasMoved: true })
        : { ...piece, hasMoved: true };
    next.board[from.r][from.c] = null;

    if (move.castle) {
        const [rookFrom, rookTo] = move.castle === 'kingside' ? [7, 5] : [0, 3];
        next.board[from.r][rookTo] = { ...next.board[from.r][rookFrom], hasMoved: true };
        next.board[from.r][rookFrom] = null;
    }

    updateCastlingRights(next, piece, from, to);
    next.turn = opponent(color);
    return next;
}

// `next` is already a copy of the state, so it can be changed in place.
function applyResurrect(next, color) {
    const { r, c, piece } = next.graves[color];
    // The raised enemy piece joins the Necromancer's side.
    // It counts as moved, so a raised pawn has no double step.
    next.board[r][c] = makePiece(piece.type, color, { hasMoved: true });
    next.graves[color] = null;
    next.turn = opponent(color);
    return next;
}

function applyConvert(next, move, color) {
    const { at, into } = move;
    const piece = next.board[at.r][at.c];
    next.budget[color] -= conversionCost(piece.type, into);
    // A converted piece counts as moved, so a new pawn has no double step.
    next.board[at.r][at.c] = makePiece(into, color, { hasMoved: true });
    // Converting a rook on its corner ends that castling right.
    updateCastlingRights(next, piece, at, at);
    next.turn = opponent(color);
    return next;
}

function updateCastlingRights(state, piece, from, to) {
    if (piece.type === 'king') {
        state.castling[piece.color] = { kingside: false, queenside: false };
    }
    // Any move from or onto a rook's starting corner ends that castling right.
    const corners = [
        [7, 0, WHITE, 'queenside'], [7, 7, WHITE, 'kingside'],
        [0, 0, BLACK, 'queenside'], [0, 7, BLACK, 'kingside'],
    ];
    for (const [r, c, color, side] of corners) {
        if ((from.r === r && from.c === c) || (to.r === r && to.c === c)) {
            state.castling[color][side] = false;
        }
    }
}
