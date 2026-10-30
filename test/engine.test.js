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
    // The double step depends on the hasMoved flag: white pawn on e4 with hasMoved = false.
    const state = fromFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    state.board[4][4] = { type: 'pawn', color: 'white', hasMoved: false, promoted: false };
    const targets = getLegalMoves(state)
        .filter(m => m.from.r === 4 && m.from.c === 4)
        .map(m => m.to.r);
    assert.deepEqual(targets.sort(), [2, 3]);
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
    // A rook on h1 without the castling right (one that arrived there later) cannot castle.
    assert.deepEqual(castles(fromFEN('4k3/8/8/8/8/8/8/R3K2R w Q - 0 1')), ['queenside']);
});

test('perft depth 1 with castling ("Kiwipete" position)', () => {
    const state = fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', STANDARD);
    assert.equal(perft(state, 1), 48);
});

const findMove = (state, from, to) => getLegalMoves(state).find(m =>
    m.from && m.from.r === from[0] && m.from.c === from[1] && m.to.r === to[0] && m.to.c === to[1]);

test('a pawn reaching the last rank promotes to a rook', () => {
    const state = fromFEN('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
    const promotions = getLegalMoves(state).filter(m => m.from.r === 1 && m.from.c === 1);
    assert.deepEqual(promotions.map(m => m.promotion), ['rook']);

    const next = applyMove(state, promotions[0]);
    assert.deepEqual(next.board[0][1], { type: 'rook', color: 'white', hasMoved: true, promoted: true });
});

// Standard test positions, one move deep. Deeper known counts include
// en passant, which this game doesn't have.
test('perft depth 1 on positions with castling and promotion', () => {
    const position4 = fromFEN('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', STANDARD);
    assert.equal(perft(position4, 1), 6);

    // Standard count is 44, including 4 promotions for d7xc8. Rook-only promotion leaves 1 of them.
    const position5 = fromFEN('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', STANDARD);
    assert.equal(perft(position5, 1), 41);
});

test('there is no en passant', () => {
    // White pawn on e5, black plays d7-d5: capturing on d6 is not allowed.
    let state = fromFEN('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1');
    state = applyMove(state, findMove(state, [1, 3], [3, 3]));
    assert.equal(findMove(state, [3, 4], [2, 3]), undefined);
});

const NECRO = { whiteRuler: 'necromancer' };
const resurrect = state => getLegalMoves(state).find(m => m.type === 'resurrect');

test('a capture leaves a grave under the capturing piece', () => {
    const state = fromFEN('4k3/8/8/3n4/8/1B6/8/4K3 w - - 0 1');
    const next = applyMove(state, findMove(state, [5, 1], [3, 3]));  // Bb3xd5
    assert.deepEqual(next.grave, { r: 3, c: 3, piece: state.board[3][3] });
});

test('only the most recent death is in the grave', () => {
    let state = fromFEN('4k3/8/8/3n4/8/1B6/p7/R3K3 w - - 0 1');
    state = applyMove(state, findMove(state, [5, 1], [3, 3]));  // Bxd5
    state = applyMove(state, findMove(state, [0, 4], [0, 3]));
    state = applyMove(state, findMove(state, [7, 0], [6, 0]));  // Rxa2
    assert.deepEqual([state.grave.r, state.grave.c, state.grave.piece.type], [6, 0, 'pawn']);
});

test('the grave is blocked until the capturer moves away', () => {
    let state = fromFEN('4k3/8/8/3n4/8/1B6/8/4K3 w - - 0 1', NECRO);
    state = applyMove(state, findMove(state, [5, 1], [3, 3]));  // Bxd5, bishop stands on the grave
    state = applyMove(state, findMove(state, [0, 4], [0, 3]));
    assert.equal(resurrect(state), undefined);

    state = applyMove(state, findMove(state, [3, 3], [2, 4]));  // bishop steps off
    state = applyMove(state, findMove(state, [0, 3], [0, 2]));
    assert.deepEqual(resurrect(state), { type: 'resurrect', to: { r: 3, c: 3 } });
});

test('only a Necromancer can resurrect', () => {
    let state = fromFEN('4k3/8/8/3n4/8/1B6/8/4K3 w - - 0 1');
    state = applyMove(state, findMove(state, [5, 1], [3, 3]));
    state = applyMove(state, findMove(state, [0, 4], [0, 3]));
    state = applyMove(state, findMove(state, [3, 3], [2, 4]));
    assert.equal(resurrect(state), undefined, 'black has a plain king');
});

test('a Necromancer raises an enemy piece in their own color', () => {
    // Black's knight dies on d5 to a white piece; white raises it as white.
    let state = fromFEN('4k3/8/8/3n4/8/1B6/8/4K3 w - - 0 1', NECRO);
    state = applyMove(state, findMove(state, [5, 1], [3, 3]));  // Bxd5
    state = applyMove(state, findMove(state, [0, 4], [0, 3]));
    state = applyMove(state, findMove(state, [3, 3], [2, 4]));  // bishop steps off
    state = applyMove(state, findMove(state, [0, 3], [0, 2]));
    state = applyMove(state, resurrect(state));
    assert.deepEqual(state.board[3][3], { type: 'knight', color: 'white', hasMoved: true, promoted: false });
    assert.equal(state.grave, null);
    assert.equal(state.turn, 'black');
});

test('a Necromancer cannot raise their own dead', () => {
    // White's knight dies on d4; the grave holds it, but white can't raise it.
    let state = fromFEN('4k3/8/8/2b5/3N4/8/8/4K3 b - - 0 1', NECRO);
    state = applyMove(state, findMove(state, [3, 2], [4, 3]));  // Bxd4
    state = applyMove(state, findMove(state, [7, 4], [7, 3]));
    state = applyMove(state, findMove(state, [4, 3], [5, 4]));  // bishop steps off
    assert.equal(state.grave.piece.color, 'white');
    assert.equal(resurrect(state), undefined);
});

test('a new death replaces a grave the Necromancer wanted', () => {
    // White's Necromancer wins a knight, but black takes a white pawn before it can rise.
    let state = fromFEN('4k2r/8/8/3n4/8/1B6/7P/4K3 w - - 0 1', NECRO);
    state = applyMove(state, findMove(state, [5, 1], [3, 3]));  // Bxd5
    state = applyMove(state, findMove(state, [0, 4], [0, 3]));
    state = applyMove(state, findMove(state, [3, 3], [2, 4]));  // bishop steps off
    assert.equal(state.grave.piece.type, 'knight');
    state = applyMove(state, findMove(state, [0, 7], [6, 7]));  // ...Rxh2: the grave now holds a white pawn
    state = applyMove(state, findMove(state, [7, 4], [7, 3]));
    state = applyMove(state, findMove(state, [6, 7], [5, 7]));  // rook steps off
    assert.equal(state.grave.piece.color, 'white');
    assert.equal(resurrect(state), undefined);
});

test('a raised pawn has no double step', () => {
    // A black pawn dies on d4 and rises as a white pawn that has already moved.
    let state = fromFEN('4k3/8/8/8/3p4/2B5/8/4K3 w - - 0 1', NECRO);
    state = applyMove(state, findMove(state, [5, 2], [4, 3]));  // Bxd4
    state = applyMove(state, findMove(state, [0, 4], [0, 3]));
    state = applyMove(state, findMove(state, [4, 3], [3, 4]));  // bishop steps off to e5
    state = applyMove(state, findMove(state, [0, 3], [0, 2]));
    state = applyMove(state, resurrect(state));
    state = applyMove(state, findMove(state, [0, 2], [0, 1]));
    assert.ok(findMove(state, [4, 3], [3, 3]), 'd4-d5');
    assert.equal(findMove(state, [4, 3], [2, 3]), undefined, 'no d4-d6');
});

test('with two Necromancers, only the side that did the killing can raise', () => {
    let state = fromFEN('4k3/8/8/3n4/8/1B6/8/4K3 w - - 0 1', { whiteRuler: 'necromancer', blackRuler: 'necromancer' });
    state = applyMove(state, findMove(state, [5, 1], [3, 3]));  // Bxd5
    state = applyMove(state, findMove(state, [0, 4], [0, 3]));
    state = applyMove(state, findMove(state, [3, 3], [2, 4]));  // white steps off, black moves next
    assert.equal(resurrect(state), undefined, 'black cannot raise its own knight');
    state = applyMove(state, findMove(state, [0, 3], [0, 2]));
    state = applyMove(state, resurrect(state));
    assert.equal(state.board[3][3].color, 'white');
});

test('under standard rules, a resurrection can block check', () => {
    // White's Necromancer on e1 is checked along the first rank; the grave is on c1.
    const state = fromFEN('4k3/8/8/8/8/8/8/r3K3 w - - 0 1', { ...STANDARD, ...NECRO });
    state.grave = { r: 7, c: 2, piece: { type: 'knight', color: 'black', hasMoved: true, promoted: false } };
    assert.ok(resurrect(state));
});
