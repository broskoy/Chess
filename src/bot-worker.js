// Runs the bot's search in a background thread, so the page stays responsive
// while it thinks. Receives { id, state } and answers { id, move }.

import { chooseMove } from './bot.js';

self.onmessage = ({ data }) => {
    self.postMessage({ id: data.id, move: chooseMove(data.state) });
};
