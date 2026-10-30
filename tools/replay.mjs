// Replays a game copied with the copy button and shows what the bot thinks.
//
//   node tools/replay.mjs game.txt           the final position
//   node tools/replay.mjs game.txt 12        the position after 12 half-moves
//   node tools/replay.mjs - 12 < game.txt    read the game from standard input
//
// Prints the board, the rulers, grave and points, the move the bot would play
// (and how deep it searched), and every legal move with its score.

import { readFileSync } from 'node:fs';
import { rulerOf } from '../src/engine.js';
import { gameFromText, moveToText, squareName } from '../src/notation.js';
import { searchMove, scoreMoves } from '../src/bot.js';

const [file = '-', plyArgument] = process.argv.slice(2);
const text = readFileSync(file === '-' ? 0 : file, 'utf8');
const game = gameFromText(text);
const ply = plyArgument === undefined ? game.moves.length : Number(plyArgument);
if (!(ply >= 0 && ply <= game.moves.length)) {
    console.error(`The game has ${game.moves.length} half-moves; pick 0 to ${game.moves.length}.`);
    process.exit(1);
}
const state = game.states[ply];

const LETTERS = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
console.log(`After ${ply} of ${game.moves.length} half-moves` +
    (ply > 0 ? ` (last: ${moveToText(game.states[ply - 1], game.moves[ply - 1])})` : '') + '\n');
state.board.forEach((row, r) => {
    const cells = row.map(p => p === null ? '.' : p.color === 'white' ? LETTERS[p.type].toUpperCase() : LETTERS[p.type]);
    console.log(`${8 - r}  ${cells.join(' ')}`);
});
console.log('   a b c d e f g h\n');

for (const color of ['white', 'black']) {
    const ruler = rulerOf(state, color);
    const points = ruler === 'alchemist' ? `, ${state.budget[color]} points` : '';
    console.log(`${color}: ${ruler}${points}`);
}
const { grave } = state;
console.log(`grave: ${grave ? `${grave.piece.color} ${grave.piece.type} on ${squareName(grave)}` : 'none'}`);
console.log(`to move: ${state.turn}\n`);

const stats = {};
const best = searchMove(state, { timeLimitMs: 800, stats });
console.log(best
    ? `bot plays ${moveToText(state, best)} (depth ${stats.depth ?? 0}, ${stats.nodes ?? 0} positions)`
    : 'no legal moves');

console.log('\nall moves, scored 3 half-moves deep (in hundredths of a pawn, for the side to move):');
for (const { move, score } of scoreMoves(state, 3)) {
    const shown = Math.abs(score) > 900_000 ? (score > 0 ? 'wins' : 'loses') : score;
    console.log(`  ${moveToText(state, move).padEnd(7)} ${shown}`);
}
