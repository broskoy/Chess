import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, fromFEN, getLegalMoves, getStatus, applyMove } from '../src/engine.js';

// Counts leaf positions at a given depth; the standard way to validate move generation.
function perft(state, depth) {
    if (depth === 0) return 1;
    let count = 0;
    for (const move of getLegalMoves(state)) count += perft(applyMove(state, move), depth - 1);
    return count;
}

// Castling, en passant and promotion can't happen in the first 4 plies,
// so these known values already hold without them.
test('perft from the starting position', () => {
    const start = createInitialState();
    assert.equal(perft(start, 1), 20);
    assert.equal(perft(start, 2), 400);
    assert.equal(perft(start, 3), 8902);
    assert.equal(perft(start, 4), 197281);
});

test("fool's mate is checkmate", () => {
    const state = fromFEN('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
    assert.deepEqual(getStatus(state), { result: 'checkmate', winner: 'black', inCheck: true });
});

test('stalemate is detected', () => {
    const state = fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    assert.deepEqual(getStatus(state), { result: 'stalemate', winner: null, inCheck: false });
});

test('pinned pieces cannot move off the pin', () => {
    // The e2 bishop is pinned to the white king by the e8 rook.
    const state = fromFEN('4r2k/8/8/8/8/8/4B3/4K3 w - - 0 1');
    const bishopMoves = getLegalMoves(state).filter(m => m.from.r === 6 && m.from.c === 4);
    assert.equal(bishopMoves.length, 0);
});

test('a pawn that has not moved can double step from any rank', () => {
    // Simulates a dropped pawn: white pawn on e4 with hasMoved = false.
    const state = fromFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    state.board[4][4] = { type: 'pawn', color: 'white', hasMoved: false, promoted: false };
    const targets = getLegalMoves(state)
        .filter(m => m.from.r === 4 && m.from.c === 4)
        .map(m => m.to.r);
    assert.deepEqual(targets.sort(), [2, 3]);
});

test('captured pieces go to the capturer\'s hand', () => {
    const state = fromFEN('4k3/8/3p4/8/4N3/8/8/4K3 w - - 0 1');
    const capture = getLegalMoves(state).find(m => m.to.r === 2 && m.to.c === 3);
    const next = applyMove(state, capture);
    assert.equal(next.hands.white.pawn, 1);
});

test('moving a rook removes that castling right', () => {
    const state = fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const rookMove = getLegalMoves(state).find(m => m.from.r === 7 && m.from.c === 7 && m.to.r === 6);
    const next = applyMove(state, rookMove);
    assert.deepEqual(next.castling.white, { kingside: false, queenside: true });
    assert.deepEqual(next.castling.black, { kingside: true, queenside: true });
});
