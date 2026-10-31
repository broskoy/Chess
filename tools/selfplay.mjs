// Plays bot-against-bot games and reports win rates, for checking ruler balance
// and tuning the bot.
//
//   node tools/selfplay.mjs [--games 40] [--depth 3] [--budget 0] [--seed 1] [--workers N]
//
// Uses half of the CPU cores by default, so the machine stays usable; --workers changes that.
//
// Every pair of rulers plays the given number of games, swapping colors each game.
// The bots search to a fixed depth rather than for a fixed time, so the results
// don't depend on how busy the machine is, and the same seed repeats the same games.
// A few random opening moves make the games differ. Games still going after
// MAX_PLIES half-moves are reported as unfinished.

import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import {
    RULERS, createInitialState, applyMove, getLegalMoves, getStatus, positionKey,
} from '../src/engine.js';
import { randomMove, searchMove } from '../src/bot.js';

const MAX_PLIES = 300;
const RANDOM_OPENING_PLIES = 4;

// A small seeded generator (mulberry32), so each game can be repeated.
function seededRandom(seed) {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Plays one game. `first` is white's ruler, `second` is black's.
function playGame({ first, second, depth, budget, seed }) {
    const random = seededRandom(seed);
    let state = createInitialState({ whiteRuler: first, blackRuler: second, alchemistBudget: budget });
    const seen = new Map([[positionKey(state), 1]]);
    const abilities = { white: 0, black: 0 };

    for (let ply = 0; ply < MAX_PLIES; ply++) {
        const moves = getLegalMoves(state);
        const { result, winner } = getStatus(state, moves);
        if (result !== 'playing') return { winner, result, plies: ply, abilities };

        const move = ply < RANDOM_OPENING_PLIES
            ? randomMove(state, random)
            : searchMove(state, { maxDepth: depth, timeLimitMs: Infinity, random });
        if (move.type !== 'move') abilities[state.turn]++;
        state = applyMove(state, move);

        const key = positionKey(state);
        seen.set(key, (seen.get(key) ?? 0) + 1);
        if (seen.get(key) >= 3) return { winner: null, result: 'repetition', plies: ply + 1, abilities };
    }
    return { winner: null, result: 'unfinished', plies: MAX_PLIES, abilities };
}

function parseOptions() {
    const options = { games: 40, depth: 3, budget: 0, seed: 1, workers: Math.ceil(cpus().length / 2) };
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 2) {
        const name = args[i].replace(/^--/, '');
        if (!(name in options) || !Number.isFinite(Number(args[i + 1]))) {
            console.error(`Unknown option: ${args[i]} ${args[i + 1] ?? ''}`);
            process.exit(1);
        }
        options[name] = Number(args[i + 1]);
    }
    return options;
}

// All pairs of different rulers, plus the King mirror as a baseline for white's edge.
function buildGames({ games, depth, budget, seed }) {
    const pairs = [['king', 'king']];
    RULERS.forEach((a, i) => RULERS.slice(i + 1).forEach(b => pairs.push([a, b])));

    const jobs = [];
    pairs.forEach(([a, b], pair) => {
        for (let game = 0; game < games; game++) {
            const swapped = game % 2 === 1;
            jobs.push({
                pair, a, b, swapped, depth, budget,
                first: swapped ? b : a,
                second: swapped ? a : b,
                seed: seed * 1_000_003 + pair * 10_007 + game,
            });
        }
    });
    return { pairs, jobs };
}

function report(pairs, results, options) {
    console.log(`depth ${options.depth}, Alchemist budget ${options.budget}, ${options.games} games per pair\n`);
    console.log('pair                      A wins  B wins  draws  unfinished  white wins  avg plies  A abilities  B abilities');
    pairs.forEach(([a, b], pair) => {
        const games = results.filter(r => r.pair === pair);
        const side = r => r.swapped ? ['black', 'white'] : ['white', 'black'];
        const count = test => games.filter(test).length;
        const sum = pick => games.reduce((total, r) => total + pick(r), 0);
        const row = [
            `${a} vs ${b}`.padEnd(24),
            String(count(r => r.winner === side(r)[0])).padStart(7),
            String(count(r => r.winner === side(r)[1])).padStart(7),
            String(count(r => r.result === 'repetition' || r.result === 'stalemate')).padStart(6),
            String(count(r => r.result === 'unfinished')).padStart(11),
            String(count(r => r.winner === 'white')).padStart(11),
            (sum(r => r.plies) / games.length).toFixed(0).padStart(10),
            (sum(r => r.abilities[side(r)[0]]) / games.length).toFixed(1).padStart(12),
            (sum(r => r.abilities[side(r)[1]]) / games.length).toFixed(1).padStart(12),
        ];
        console.log(row.join(' '));
    });
}

function runAll() {
    const options = parseOptions();
    const { pairs, jobs } = buildGames(options);
    const results = [];
    let next = 0;
    const started = Date.now();

    const finish = () => {
        report(pairs, results, options);
        console.log(`\n${results.length} games in ${((Date.now() - started) / 1000).toFixed(0)}s`);
    };

    const count = Math.min(options.workers, jobs.length);
    let running = count;
    for (let i = 0; i < count; i++) {
        const worker = new Worker(fileURLToPath(import.meta.url));
        const send = () => {
            if (next < jobs.length) {
                worker.postMessage(jobs[next++]);
            } else {
                worker.terminate();
                if (--running === 0) finish();
            }
        };
        worker.on('message', result => {
            results.push(result);
            send();
        });
        send();
    }
}

if (isMainThread) {
    runAll();
} else {
    parentPort.on('message', job => {
        parentPort.postMessage({ ...playGame(job), pair: job.pair, swapped: job.swapped });
    });
}
