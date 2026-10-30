import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, fromFEN, getLegalMoves, applyMove, getStatus } from '../src/engine.js';
import { chooseMove } from '../src/bot.js';

test('the bot picks one of the legal moves', () => {
    const state = createInitialState();
    const legal = getLegalMoves(state).map(move => JSON.stringify(move));
    for (const value of [0, 0.5, 0.999]) {
        assert.ok(legal.includes(JSON.stringify(chooseMove(state, () => value))));
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
        state = applyMove(state, chooseMove(state, random));
    }
    assert.ok(state.fullmoveNumber > 1);
});
