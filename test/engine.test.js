import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, fromFEN, getLegalMoves, getStatus, applyMove } from '../src/engine.js';

// Standard chess: no drops, and moves into check are illegal.
const STANDARD = { kingCapture: false, dropZoneDepth: 0 };
const STANDARD_WITH_DROPS = { kingCapture: false };

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

const findMove = (state, from, to) => getLegalMoves(state).find(m =>
    m.from && m.from.r === from[0] && m.from.c === from[1] && m.to.r === to[0] && m.to.c === to[1]);

test('a pawn reaching the last rank promotes to a rook', () => {
    const state = fromFEN('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
    const promotions = getLegalMoves(state).filter(m => m.from.r === 1 && m.from.c === 1);
    assert.deepEqual(promotions.map(m => m.promotion), ['rook']);

    const next = applyMove(state, promotions[0]);
    assert.deepEqual(next.board[0][1], { type: 'rook', color: 'white', hasMoved: true, promoted: true });
});

test('a captured promoted piece goes to hand as itself, or as a pawn with demotePromoted', () => {
    const fen = '4k3/8/8/8/8/8/4K3/1q4R1 w - - 0 1';
    for (const [settings, expected] of [[{}, 'queen'], [{ demotePromoted: true }, 'pawn']]) {
        const state = fromFEN(fen, settings);
        state.board[7][1] = { type: 'queen', color: 'black', hasMoved: true, promoted: true };
        const next = applyMove(state, findMove(state, [7, 6], [7, 1]));
        assert.equal(next.hands.white[expected], 1);
    }
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

const drops = state => getLegalMoves(state).filter(m => m.type === 'drop');
const dropRows = state => [...new Set(drops(state).map(m => m.to.r))].sort();

test('drops go on empty squares in your own 4 ranks', () => {
    const state = fromFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    state.hands.white.knight = 1;
    assert.deepEqual(dropRows(state), [4, 5, 6, 7]);
    assert.equal(drops(state).length, 31, '32 zone squares minus the king on e1');

    const black = fromFEN('4k3/8/8/8/8/8/8/4K3 b - - 0 1');
    black.hands.black.knight = 1;
    assert.deepEqual(dropRows(black), [0, 1, 2, 3]);
});

test('the drop zone depth is a setting', () => {
    const state = fromFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 1', { dropZoneDepth: 2 });
    state.hands.white.rook = 1;
    assert.deepEqual(dropRows(state), [6, 7]);
});

test('pawns cannot be dropped on the back rank', () => {
    const state = fromFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    state.hands.white.pawn = 1;
    assert.deepEqual(dropRows(state), [4, 5, 6]);
});

test('dropping places the piece and takes it from the hand', () => {
    const state = fromFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    state.hands.white.bishop = 2;
    const next = applyMove(state, drops(state).find(m => m.to.r === 5 && m.to.c === 2));
    assert.deepEqual(next.board[5][2], { type: 'bishop', color: 'white', hasMoved: false, promoted: false });
    assert.equal(next.hands.white.bishop, 1);
    assert.equal(next.turn, 'black');
});

test('after a drop, the next move must be a board move', () => {
    let state = fromFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    state.hands.white.knight = 2;
    state = applyMove(state, drops(state)[0]);
    state = applyMove(state, findMove(state, [0, 4], [0, 3]));  // black king moves
    assert.equal(drops(state).length, 0, 'white is on cooldown');

    state = applyMove(state, findMove(state, [7, 4], [7, 5]));  // white board move
    state = applyMove(state, findMove(state, [0, 3], [0, 4]));
    assert.ok(drops(state).length > 0, 'cooldown is over');
});

test('with no cooldown, drops can follow each other', () => {
    let state = fromFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 1', { dropCooldown: 0 });
    state.hands.white.knight = 2;
    state = applyMove(state, drops(state)[0]);
    state = applyMove(state, findMove(state, [0, 4], [0, 3]));
    assert.ok(drops(state).length > 0);
});

test('a dropped pawn can double step', () => {
    let state = fromFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    state.hands.white.pawn = 1;
    state = applyMove(state, drops(state).find(m => m.to.r === 4 && m.to.c === 0));  // a4
    state = applyMove(state, findMove(state, [0, 4], [0, 3]));
    assert.ok(findMove(state, [4, 0], [2, 0]), 'a4-a6');
});

test('drops that give check can be turned off', () => {
    // A rook dropped on the e-file would attack the black king on e8.
    const state = fromFEN('4k3/8/8/8/8/8/8/K7 w - - 0 1', { allowDropChecks: false });
    state.hands.white.rook = 1;
    assert.ok(drops(state).every(m => m.to.c !== 4));
    assert.ok(drops(state).length > 0);
});

test('under standard rules, a drop can block check', () => {
    // The black rook on a1 checks the white king on h1 along the first rank.
    const state = fromFEN('k7/8/8/8/8/8/8/r6K w - - 0 1', STANDARD_WITH_DROPS);
    state.hands.white.knight = 1;
    const blocks = drops(state).map(m => m.to.r * 8 + m.to.c).sort((a, b) => a - b);
    // Only drops on b1-g1 stop the check.
    assert.deepEqual(blocks, [57, 58, 59, 60, 61, 62]);
    assert.equal(getStatus(state).result, 'playing');
});

test('under standard rules, checkmate counts drops as escapes', () => {
    // Back-rank mate except that white holds a piece that can block.
    const state = fromFEN('k7/8/8/8/8/8/6PP/r6K w - - 0 1', STANDARD_WITH_DROPS);
    assert.equal(getStatus(state).result, 'checkmate');
    state.hands.white.bishop = 1;
    assert.equal(getStatus(state).result, 'playing');
});

test('there is no en passant', () => {
    // White pawn on e5, black plays d7-d5: capturing on d6 is not allowed.
    let state = fromFEN('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1');
    state = applyMove(state, findMove(state, [1, 3], [3, 3]));
    assert.equal(findMove(state, [3, 4], [2, 3]), undefined);
});
