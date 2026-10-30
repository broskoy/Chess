// The computer opponent. It only uses the engine (no DOM), so it also runs in
// Node, e.g. for bot-against-bot games to tune it later.

import { getLegalMoves, getPiece, PIECE_VALUES } from './engine.js';

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

export function chooseMove(state, random = Math.random) {
    return greedyMove(state, random);
}
