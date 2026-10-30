import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, fromFEN, getLegalMoves, applyMove, getStatus } from '../src/engine.js';
import { randomMove, greedyMove, searchMove } from '../src/bot.js';

test('the bot picks one of the legal moves', () => {
    const state = createInitialState();
    const legal = getLegalMoves(state).map(move => JSON.stringify(move));
    for (const value of [0, 0.5, 0.999]) {
        assert.ok(legal.includes(JSON.stringify(randomMove(state, () => value))));
    }
});

test('the bot has no move when the game is over', () => {
    // White's king has been captured.
    const state = fromFEN('4k3/8/8/8/8/8/8/8 w - - 0 1');
    assert.equal(searchMove(state), null);
});

test('two bots can play a whole game without errors', () => {
    // A seeded random sequence keeps the game the same on every run.
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let state = createInitialState({ whiteRuler: 'necromancer', blackRuler: 'alchemist' });
    let plies = 0;
    while (plies < 300 && getStatus(state).result === 'playing') {
        state = applyMove(state, randomMove(state, random));
        plies++;
    }
    assert.ok(plies > 2);
});

test('the greedy bot takes the most valuable piece, and the ruler above all', () => {
    // Black can take a knight (d4) or a rook (f4) with the e5 pawn... and the queen can take the king.
    const state = fromFEN('4k3/8/8/4p3/3N1R2/8/8/q3K3 b - - 0 1');
    const move = greedyMove(state, () => 0);
    assert.deepEqual([move.to.r, move.to.c], [7, 4], 'takes the king on e1');

    const noKing = fromFEN('4k3/8/8/4p3/3N1R2/8/8/4K3 b - - 0 1');
    const capture = greedyMove(noKing, () => 0);
    assert.deepEqual([capture.to.r, capture.to.c], [4, 5], 'takes the rook, not the knight');
});

const at = move => [move.to.r, move.to.c];
const FAST = { timeLimitMs: 300 };

test('the search captures the ruler when it can', () => {
    const state = fromFEN('4k3/8/8/8/8/8/8/q3K3 b - - 0 1');
    assert.deepEqual(at(searchMove(state, FAST)), [7, 4]);
});

test('the search takes a free piece', () => {
    // The white queen on d4 is unprotected; the black knight on f5 can take it.
    const state = fromFEN('4k3/8/8/5n2/3Q4/8/8/4K3 b - - 0 1');
    assert.deepEqual(at(searchMove(state, FAST)), [4, 3]);
});

test("the search doesn't take a protected piece with its queen", () => {
    // Qxd4 would win a pawn but lose the queen to the c3 pawn.
    const state = fromFEN('4k3/8/8/3q4/3P4/2P5/8/4K3 b - - 0 1');
    const move = searchMove(state, FAST);
    assert.notDeepEqual([move.from.r, move.from.c, ...at(move)], [3, 3, 4, 3]);
});

test('the search moves an attacked queen to safety', () => {
    // The e4 pawn attacks the black queen on d5.
    const state = fromFEN('4k3/8/8/3q4/4P3/8/8/4K3 b - - 0 1');
    const move = searchMove(state, FAST);
    const next = applyMove(state, move);
    const queen = next.board.flat().some(p => p && p.type === 'queen' && p.color === 'black');
    assert.ok(queen);
    const whiteCanTakeQueen = getLegalMoves(next).some(m => {
        const target = next.board[m.to.r][m.to.c];
        return target && target.type === 'queen';
    });
    assert.ok(!whiteCanTakeQueen, `queen left en prise after ${JSON.stringify(move)}`);
});

test("the search doesn't leave its ruler to be captured", () => {
    // The black king on e8 is attacked by the e1 rook along the e-file.
    const state = fromFEN('4k3/8/8/8/8/8/8/K3R3 b - - 0 1');
    const next = applyMove(state, searchMove(state, FAST));
    assert.ok(!getLegalMoves(next).some(m => next.board[m.to.r][m.to.c]?.type === 'king'));
});

test('the search finds a checkmate under standard rules', () => {
    // After 1.f3 e5 2.g4, black mates with Qh4.
    const state = fromFEN('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', { kingCapture: false });
    const move = searchMove(state, FAST);
    assert.deepEqual([move.from.r, move.from.c, ...at(move)], [0, 3, 4, 7]);
});

test('the search raises a valuable piece from the grave when it can', () => {
    const state = fromFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 1', { whiteRuler: 'necromancer' });
    state.grave = { r: 4, c: 3, piece: { type: 'queen', color: 'black', hasMoved: true } };
    assert.equal(searchMove(state, FAST).type, 'resurrect');
});

test("the bot counts an Alchemist's points, so a downgrade doesn't fool it", () => {
    // White just turned the d4 queen into a rook, banking 4 points. The rook attacks
    // the black queen on d6. Unvalued points made "rook takes queen, pawn takes rook"
    // look as good as retreating, so the bot let its queen go.
    const state = fromFEN('rnb1kbnr/ppp2ppp/3q4/8/3R4/4P3/PPP2PPP/RNB1KBNR b KQkq - 0 6', { whiteRuler: 'alchemist' });
    state.budget.white = 4;
    for (let i = 0; i < 5; i++) {
        const move = searchMove(state, FAST);
        assert.deepEqual([move.from.r, move.from.c], [2, 3], `the queen should move, not ${JSON.stringify(move)}`);
    }
});
