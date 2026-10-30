// The computer opponent. It only uses the engine (no DOM), so it also runs in
// Node, e.g. for bot-against-bot games to tune it later.

import { getLegalMoves, getPiece, applyMove, isInCheck, PIECE_VALUES } from './engine.js';

// `random` returns a number in [0, 1); it can be replaced to make choices repeatable in tests.
function pick(moves, random) {
    return moves[Math.floor(random() * moves.length)];
}

// Any legal move, chosen at random. Kept as a baseline for bot-against-bot games.
export function randomMove(state, random = Math.random) {
    const moves = getLegalMoves(state);
    return moves.length === 0 ? null : pick(moves, random);
}

// What a move captures, in points (the ruler counts as more than everything else).
function captureValue(state, move) {
    if (move.type !== 'move') return 0;
    const target = getPiece(state, move.to.r, move.to.c);
    if (target === null) return 0;
    return target.type === 'king' ? 1000 : PIECE_VALUES[target.type];
}

// Takes the most valuable capture available (the ruler above all), otherwise
// moves at random. Ties are broken at random.
export function greedyMove(state, random = Math.random) {
    const moves = getLegalMoves(state);
    if (moves.length === 0) return null;
    const best = Math.max(...moves.map(move => captureValue(state, move)));
    return pick(moves.filter(move => captureValue(state, move) === best), random);
}

// --- Search ------------------------------------------------------------------------
//
// Alpha-beta search (negamax form) with iterative deepening: it searches 1 move
// ahead, then 2, and so on until the time runs out, and plays the best move from
// the deepest search it finished. At the end of each line it keeps following
// captures until the position is quiet, so it doesn't stop counting in the middle
// of an exchange.

const WIN = 1_000_000;           // capturing the ruler; reduced by the ply, so faster wins score higher
const MAX_CAPTURE_DEPTH = 6;     // how far the capture follow-up goes past the search depth
const TIMEOUT = Symbol('timeout');

// Scores are in hundredths of a pawn, from the point of view of the side to move.
// Material, plus small bonuses for central knights and bishops and advanced pawns.
// Ruler abilities' potential (an open grave, unspent points) isn't valued yet.
function evaluate(state) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = state.board[r][c];
            if (piece === null || piece.type === 'king') continue;
            let value = PIECE_VALUES[piece.type] * 100;
            if (piece.type === 'knight' || piece.type === 'bishop') {
                value += 4 * (7 - Math.abs(r - 3.5) - Math.abs(c - 3.5));   // up to 24 in the center
            } else if (piece.type === 'pawn') {
                value += 5 * (piece.color === 'white' ? 6 - r : r - 1);     // 5 per rank advanced
            }
            score += piece.color === state.turn ? value : -value;
        }
    }
    return score;
}

function capturesRuler(state, move) {
    if (move.type !== 'move') return false;
    const target = getPiece(state, move.to.r, move.to.c);
    return target !== null && target.type === 'king';
}

function isCapture(state, move) {
    return move.type === 'move' && getPiece(state, move.to.r, move.to.c) !== null;
}

// Likely-best moves first, so alpha-beta can skip more of the rest: the ruler,
// then captures of valuable pieces by cheap ones, then raises and promotions.
function orderMoves(state, moves) {
    const priority = move => {
        if (move.type === 'resurrect') return 10 * PIECE_VALUES[state.grave.piece.type];
        if (move.type !== 'move') return 0;
        const target = getPiece(state, move.to.r, move.to.c);
        const promotion = move.promotion ? 10 * PIECE_VALUES[move.promotion] : 0;
        if (target === null) return promotion;
        if (target.type === 'king') return Infinity;
        const attacker = getPiece(state, move.from.r, move.from.c);
        return promotion + 10 * PIECE_VALUES[target.type] - PIECE_VALUES[attacker.type];
    };
    return moves.sort((a, b) => priority(b) - priority(a));
}

// The score when the side to move has no moves: a loss under king capture rules,
// checkmate or stalemate under standard rules.
function noMovesScore(state, ply) {
    if (state.settings.kingCapture || isInCheck(state, state.turn)) return -(WIN - ply);
    return 0;
}

function tick(context) {
    context.nodes++;
    if ((context.nodes & 1023) === 0 && Date.now() > context.deadline) throw TIMEOUT;
}

function negamax(state, depth, alpha, beta, ply, context) {
    tick(context);
    if (depth === 0) return followCaptures(state, alpha, beta, ply, 0, context);

    const moves = getLegalMoves(state);
    if (moves.length === 0) return noMovesScore(state, ply);
    for (const move of orderMoves(state, moves)) {
        if (capturesRuler(state, move)) return WIN - ply;
        const score = -negamax(applyMove(state, move), depth - 1, -beta, -alpha, ply + 1, context);
        if (score >= beta) return score;
        if (score > alpha) alpha = score;
    }
    return alpha;
}

// Past the search depth, only captures are followed, and the side to move may
// "stand pat" (keep the current score) instead of capturing. Not while its ruler
// is attacked, though: then it has to respond with any move, or it would ignore
// losing the game. At the depth limit it always stands pat.
function followCaptures(state, alpha, beta, ply, captureDepth, context) {
    tick(context);
    const atLimit = captureDepth >= MAX_CAPTURE_DEPTH;
    const attacked = !atLimit && state.settings.kingCapture && isInCheck(state, state.turn);
    if (!attacked) {
        const standPat = evaluate(state);
        if (standPat >= beta || atLimit) return standPat;
        if (standPat > alpha) alpha = standPat;
    }

    const all = getLegalMoves(state);
    if (all.length === 0) return noMovesScore(state, ply);
    const moves = attacked ? all : all.filter(move => isCapture(state, move));
    for (const move of orderMoves(state, moves)) {
        if (capturesRuler(state, move)) return WIN - ply;
        const score = -followCaptures(applyMove(state, move), -beta, -alpha, ply + 1, captureDepth + 1, context);
        if (score >= beta) return score;
        if (score > alpha) alpha = score;
    }
    return alpha;
}

function shuffle(items, random) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

// Searches as deep as it can within `timeLimitMs` and returns the best move.
// Moves that score the same are picked at random, so games vary. If a `stats`
// object is passed, it receives the depth reached and the number of positions searched.
export function searchMove(state, { timeLimitMs = 800, maxDepth = 12, random = Math.random, stats = {} } = {}) {
    let moves = orderMoves(state, shuffle(getLegalMoves(state), random));
    if (moves.length === 0) return null;
    const ruler = moves.find(move => capturesRuler(state, move));
    if (ruler) return ruler;

    const context = { nodes: 0, deadline: Date.now() + timeLimitMs };
    let best = moves[0];
    for (let depth = 1; depth <= maxDepth; depth++) {
        let alpha = -Infinity;
        let bestThisDepth = null;
        try {
            for (const move of moves) {
                const score = -negamax(applyMove(state, move), depth - 1, -Infinity, -alpha, 1, context);
                if (score > alpha) {
                    alpha = score;
                    bestThisDepth = move;
                }
            }
        } catch (error) {
            if (error === TIMEOUT) break;
            throw error;
        }
        best = bestThisDepth;
        stats.depth = depth;
        // Search the best move first next time; stop early once the result is decided.
        moves = [best, ...moves.filter(move => move !== best)];
        if (Math.abs(alpha) >= WIN - 100) break;
    }
    stats.nodes = context.nodes;
    return best;
}

export function chooseMove(state, options) {
    return searchMove(state, options);
}
