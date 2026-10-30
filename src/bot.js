// The computer opponent. It only uses the engine (no DOM), so it also runs in
// Node, e.g. for bot-against-bot games to tune it later.

import { getLegalMoves } from './engine.js';

// For now: any legal move, chosen at random. `random` returns a number in [0, 1),
// and can be replaced to make the choice repeatable in tests.
export function chooseMove(state, random = Math.random) {
    const moves = getLegalMoves(state);
    if (moves.length === 0) return null;
    return moves[Math.floor(random() * moves.length)];
}
