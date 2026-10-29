// Rules engine. Pure functions over a plain state object, no DOM access,
// so it runs the same in the browser, in Node tests, or on a future server.
//
// Coordinates: { r, c } with r = 0 being black's back rank (rank 8)
// and c = 0 being the a-file.

export const WHITE = 'white';
export const BLACK = 'black';

export const DEFAULT_SETTINGS = {
    dropZoneDepth: 4,        // ranks from your own side where drops are allowed
    dropCooldown: 1,         // board moves required after a drop before dropping again
    allowDropChecks: true,
    demotePromoted: false,   // captured promoted pieces go to hand as pawns
    kingCapture: true,       // the king can be captured to win; moves into check are allowed
};

const VECTORS = {
    ortho: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    diag: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
    knight: [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]],
};
const ALL_DIRECTIONS = [...VECTORS.ortho, ...VECTORS.diag];

const BACK_RANK = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
const FEN_TYPES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

export function opponent(color) {
    return color === WHITE ? BLACK : WHITE;
}

function makePiece(type, color, extra = {}) {
    return { type, color, hasMoved: false, promoted: false, ...extra };
}

function emptyHand() {
    return { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 };
}

export function createInitialState(settings = {}) {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    BACK_RANK.forEach((type, c) => {
        board[0][c] = makePiece(type, BLACK);
        board[1][c] = makePiece('pawn', BLACK);
        board[6][c] = makePiece('pawn', WHITE);
        board[7][c] = makePiece(type, WHITE);
    });

    return {
        board,
        turn: WHITE,
        // Castling is tracked as rights rather than via rook.hasMoved, so a rook
        // dropped onto a1/h1 can never castle.
        castling: {
            white: { kingside: true, queenside: true },
            black: { kingside: true, queenside: true },
        },
        enPassant: null,     // square a pawn can capture onto, or null
        hands: { white: emptyHand(), black: emptyHand() },
        dropCooldown: { white: 0, black: 0 },
        halfmoveClock: 0,
        fullmoveNumber: 1,
        settings: { ...DEFAULT_SETTINGS, ...settings },
    };
}

// Parses standard FEN (board, turn, castling, en passant, clocks). Hands start empty.
export function fromFEN(fen, settings = {}) {
    const [placement, turn = 'w', castling = '-', ep = '-', half = '0', full = '1'] = fen.trim().split(/\s+/);
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
    state.enPassant = ep === '-' ? null : { r: 8 - Number(ep[1]), c: ep.charCodeAt(0) - 97 };
    state.halfmoveClock = Number(half);
    state.fullmoveNumber = Number(full);
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
//   { type: 'move', from: {r, c}, to: {r, c}, promotion? }
//   { type: 'drop', piece, to: {r, c} }            (phase 2)

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
        if (isEmpty(r + dir, c)) {
            add(r + dir, c);
            // Double step depends on the piece, not its rank, so dropped pawns get it too.
            if (!piece.hasMoved && isEmpty(r + 2 * dir, c)) add(r + 2 * dir, c);
        }
        for (const dc of [-1, 1]) {
            if (isEnemy(r + dir, c + dc)) add(r + dir, c + dc);
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
    return moves;
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

// --- Applying moves ------------------------------------------------------------

// Pieces are never mutated (applyMove replaces them), so a copy can share them.
// Settings are shared too, since they don't change during a game.
function cloneState(state) {
    return {
        ...state,
        board: state.board.map(row => row.slice()),
        castling: { white: { ...state.castling.white }, black: { ...state.castling.black } },
        hands: { white: { ...state.hands.white }, black: { ...state.hands.black } },
        dropCooldown: { ...state.dropCooldown },
    };
}

// Returns a new state with the move applied. Does not check legality:
// callers should only pass moves that came from getLegalMoves.
export function applyMove(state, move) {
    const next = cloneState(state);
    const color = state.turn;
    const { from, to } = move;
    const piece = next.board[from.r][from.c];
    const captured = next.board[to.r][to.c];

    if (captured && captured.type !== 'king') {
        const type = captured.promoted && next.settings.demotePromoted ? 'pawn' : captured.type;
        next.hands[color][type]++;
    }

    next.board[to.r][to.c] = { ...piece, hasMoved: true };
    next.board[from.r][from.c] = null;

    updateCastlingRights(next, piece, from, to);
    next.enPassant = null;
    next.halfmoveClock = piece.type === 'pawn' || captured ? 0 : next.halfmoveClock + 1;
    if (color === BLACK) next.fullmoveNumber++;
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
