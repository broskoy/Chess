import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, fromFEN, getLegalMoves, applyMove, getStatus } from '../src/engine.js';
import { moveToText, gameToText, gameFromText } from '../src/notation.js';
import { randomMove } from '../src/bot.js';

const find = (state, text) => getLegalMoves(state).find(m => moveToText(state, m) === text);

test('moves are written in coordinates', () => {
    assert.ok(find(createInitialState(), 'e2e4'));
    assert.ok(find(createInitialState(), 'g1f3'));

    const castling = fromFEN('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    assert.equal(find(castling, 'e1g1').castle, 'kingside');

    const promotion = fromFEN('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
    assert.equal(find(promotion, 'b7b8r').promotion, 'rook');
});

test('resurrections and conversions have their own notation', () => {
    const grave = fromFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 1', { whiteRuler: 'necromancer' });
    grave.grave = { r: 3, c: 3, piece: { type: 'knight', color: 'black', hasMoved: true, promoted: false } };
    assert.equal(find(grave, 'N@d5').type, 'resurrect');

    const alchemy = fromFEN('4k3/8/8/8/3R4/8/8/4K3 w - - 0 1', { whiteRuler: 'alchemist' });
    assert.deepEqual(find(alchemy, 'd4=N'), { type: 'convert', at: { r: 4, c: 3 }, into: 'knight' });
});

test('a written game reads back to the same moves and positions', () => {
    // A seeded random game with both rulers; this seed's game has resurrections and conversions.
    let seed = 16;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const settings = { ...createInitialState().settings, whiteRuler: 'necromancer', blackRuler: 'alchemist', alchemistBudget: 5 };
    let state = createInitialState(settings);
    const moves = [];
    while (moves.length < 120 && getStatus(state).result === 'playing') {
        const move = randomMove(state, random);
        moves.push(move);
        state = applyMove(state, move);
    }

    assert.ok(moves.some(m => m.type === 'resurrect') && moves.some(m => m.type === 'convert'));

    const text = gameToText(settings, moves, { date: new Date(2026, 9, 31) });
    assert.match(text, / [PNBRQ]@[a-h][1-8] /);
    assert.match(text, / [a-h][1-8]=[PNBRQ] /);
    assert.match(text, /\[Date "2026\.10\.31"\]/);
    assert.match(text, /\[WhiteRuler "necromancer"\]/);
    assert.match(text, /^1\. /m);

    const game = gameFromText(text);
    assert.deepEqual(game.settings, settings);
    assert.deepEqual(game.moves, moves);
    assert.deepEqual(game.states[game.states.length - 1].board, state.board);
});

test('an illegal move is reported with its number', () => {
    assert.throws(() => gameFromText('1. e2e4 e7e5 2. e4e5'), /Move 3 \(e4e5\)/);
});
