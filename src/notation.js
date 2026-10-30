// Writing games down and reading them back, in a PGN-like format: header lines with
// the rulers and rules, then the numbered moves. Real PGN has no way to write a
// resurrection or a conversion, so moves use coordinates instead of standard notation:
//   e2e4, e1g1 (castling), e7e8r (promotion)   a move from one square to another
//   N@d5                                       raise a knight from the grave on d5
//   d4=B                                       the Alchemist turns the piece on d4 into a bishop
// No DOM access, so games can also be replayed in Node.

import { createInitialState, getLegalMoves, applyMove, DEFAULT_SETTINGS } from './engine.js';

const LETTERS = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' };
const TYPES = Object.fromEntries(Object.entries(LETTERS).map(([type, letter]) => [letter, type]));

export function squareName({ r, c }) {
    return 'abcdefgh'[c] + (8 - r);
}

export function moveToText(state, move) {
    if (move.type === 'resurrect') return `${LETTERS[state.grave.piece.type]}@${squareName(move.to)}`;
    if (move.type === 'convert') return `${squareName(move.at)}=${LETTERS[move.into]}`;
    const promotion = move.promotion ? LETTERS[move.promotion].toLowerCase() : '';
    return squareName(move.from) + squareName(move.to) + promotion;
}

// Header names for each setting. Values are written as text and read back by type.
const HEADERS = {
    whiteRuler: 'WhiteRuler',
    blackRuler: 'BlackRuler',
    alchemistBudget: 'AlchemistBudget',
    kingCapture: 'KingCapture',
};

export function gameToText(settings, moves, { date = new Date() } = {}) {
    const day = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    const lines = ['[Event "Chess with Rulers"]', `[Date "${day}"]`];
    for (const [key, header] of Object.entries(HEADERS)) lines.push(`[${header} "${settings[key]}"]`);

    let state = createInitialState(settings);
    const words = [];
    moves.forEach((move, i) => {
        if (i % 2 === 0) words.push(`${i / 2 + 1}.`);
        words.push(moveToText(state, move));
        state = applyMove(state, move);
    });
    return `${lines.join('\n')}\n\n${words.join(' ')}\n`;
}

// Reads a game written by gameToText and replays it. Returns the settings, the moves
// and every position (states[0] is the start, states[i + 1] follows moves[i]).
export function gameFromText(text) {
    const settings = { ...DEFAULT_SETTINGS };
    for (const [, header, value] of text.matchAll(/\[(\w+) "([^"]*)"\]/g)) {
        const key = Object.keys(HEADERS).find(k => HEADERS[k] === header);
        if (key === undefined) continue;
        const type = typeof DEFAULT_SETTINGS[key];
        settings[key] = type === 'number' ? Number(value) : type === 'boolean' ? value === 'true' : value;
    }

    const movetext = text.replace(/\[[^\]]*\]/g, ' ');
    const words = movetext.split(/\s+/).filter(word => word && !/^\d+\.$/.test(word));
    const states = [createInitialState(settings)];
    const moves = [];
    for (const word of words) {
        const state = states[states.length - 1];
        const move = getLegalMoves(state).find(m => moveToText(state, m) === word);
        if (!move) throw new Error(`Move ${moves.length + 1} (${word}) isn't legal in that position`);
        moves.push(move);
        states.push(applyMove(state, move));
    }
    return { settings, moves, states };
}
