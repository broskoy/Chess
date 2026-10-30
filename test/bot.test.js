import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, fromFEN, getLegalMoves, applyMove, getStatus } from '../src/engine.js';
import { chooseMove, randomMove, greedyMove } from '../src/bot.js';

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
    assert.equal(chooseMove(state), null);
});

test('two bots can play a whole game without errors', () => {
    // A seeded random sequence keeps the game the same on every run.
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let state = createInitialState({ whiteRuler: 'necromancer', blackRuler: 'alchemist' });
    for (let ply = 0; ply < 300 && getStatus(state).result === 'playing'; ply++) {
        state = applyMove(state, randomMove(state, random));
    }
    assert.ok(state.fullmoveNumber > 1);
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
