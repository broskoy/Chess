import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, fromFEN, getLegalMoves, getStatus, applyMove } from '../src/engine.js';

// Standard chess rules, where moves into check are illegal.
const STANDARD = { kingCapture: false };

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
    const start = createInitialState(STANDARD);
    assert.equal(perft(start, 1), 20);
    assert.equal(perft(start, 2), 400);
    assert.equal(perft(start, 3), 8902);
    assert.equal(perft(start, 4), 197281);
});

test("fool's mate is checkmate", () => {
    const state = fromFEN('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', STANDARD);
    assert.deepEqual(getStatus(state), { result: 'checkmate', winner: 'black', inCheck: true });
});

test('stalemate is detected', () => {
    const state = fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', STANDARD);
    assert.deepEqual(getStatus(state), { result: 'stalemate', winner: null, inCheck: false });
});

test('pinned pieces cannot move off the pin', () => {
    // The e2 bishop is pinned to the white king by the e8 rook.
    const state = fromFEN('4r2k/8/8/8/8/8/4B3/4K3 w - - 0 1', STANDARD);
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

test('with king capture, moving into check is allowed', () => {
    // Same pin as above: the bishop may now leave e2.
    const state = fromFEN('4r2k/8/8/8/8/8/4B3/4K3 w - - 0 1');
    const bishopMoves = getLegalMoves(state).filter(m => m.from.r === 6 && m.from.c === 4);
    assert.ok(bishopMoves.length > 0);
});

test('capturing the king wins the game', () => {
    // Black has left the king attacked on the e-file.
    const exposed = fromFEN('4k3/8/8/8/8/8/8/4R1K1 w - - 0 1');
    const capture = getLegalMoves(exposed).find(m => m.to.r === 0 && m.to.c === 4);
    const next = applyMove(exposed, capture);
    assert.deepEqual(getStatus(next), { result: 'king-captured', winner: 'white', inCheck: false });
    assert.equal(getLegalMoves(next).length, 0);
    assert.equal(next.hands.white.king, undefined);
});

test('with king capture, a stalemate position is not over yet', () => {
    const state = fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    assert.equal(getStatus(state).result, 'playing');
    assert.ok(getLegalMoves(state).length > 0);
});

const castles = state => getLegalMoves(state).filter(m => m.castle).map(m => m.castle).sort();

test('castling on both sides', () => {
    const state = fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    assert.deepEqual(castles(state), ['kingside', 'queenside']);

    const kingside = getLegalMoves(state).find(m => m.castle === 'kingside');
    const next = applyMove(state, kingside);
    assert.equal(next.board[7][6].type, 'king');
    assert.equal(next.board[7][5].type, 'rook');
    assert.equal(next.board[7][7], null);
    assert.deepEqual(next.castling.white, { kingside: false, queenside: false });
});

test('no castling out of, through, or into an attacked square', () => {
    // Out of check: the e4 rook attacks e1.
    assert.deepEqual(castles(fromFEN('4k3/8/8/8/4r3/8/8/R3K2R w KQ - 0 1')), []);
    // Through: the f4 rook attacks f1, so only queenside remains.
    assert.deepEqual(castles(fromFEN('4k3/8/8/8/5r2/8/8/R3K2R w KQ - 0 1')), ['queenside']);
    // Into: the g4 rook attacks g1. Same for king capture rules and standard rules.
    assert.deepEqual(castles(fromFEN('4k3/8/8/8/6r1/8/8/R3K2R w KQ - 0 1')), ['queenside']);
    assert.deepEqual(castles(fromFEN('4k3/8/8/8/6r1/8/8/R3K2R w KQ - 0 1', STANDARD)), ['queenside']);
    // b1 may be attacked: the king never crosses it.
    assert.deepEqual(castles(fromFEN('4k3/8/8/8/1r6/8/8/R3K2R w KQ - 0 1')), ['kingside', 'queenside']);
});

test('no castling when blocked or without the right', () => {
    assert.deepEqual(castles(fromFEN('4k3/8/8/8/8/8/8/RN2K1NR w KQ - 0 1')), []);
    // A rook on h1 without the castling right (e.g. one that was dropped there) cannot castle.
    assert.deepEqual(castles(fromFEN('4k3/8/8/8/8/8/8/R3K2R w Q - 0 1')), ['queenside']);
});

test('perft depth 1 with castling ("Kiwipete" position)', () => {
    const state = fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', STANDARD);
    assert.equal(perft(state, 1), 48);
});
