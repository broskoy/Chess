// Main menu: choose a ruler from a row of cards, then start a game.

import { RULER_INFO } from './rulers.js';

// One card per ruler, plus a locked placeholder for rulers to come.
const RULER_CARDS = [
    ...Object.entries(RULER_INFO).map(([ruler, info]) => ({ ruler, ...info })),
    { ruler: null, name: 'Coming soon', art: '?', accent: '#666' },
];

const FADE_MS = 150;

const BLANK = '...';

// Hovering (or focusing) a card previews it: the card lifts and glows, and its name
// fades into "Start as the ...". Clicking a card starts the game with that ruler.
export function setupMenu({ cardsElement, startName, startText, onStart }) {
    let shown = null;
    let fadeTimer = null;

    // Fades the name out, swaps it, and fades it back in. Moving quickly across
    // cards restarts the fade, so the name always ends on the latest card.
    function showName(card) {
        if (card === shown) return;
        shown = card;
        clearTimeout(fadeTimer);
        startName.classList.add('fading');
        fadeTimer = setTimeout(() => {
            startName.textContent = card ? card.name : BLANK;
            startText.style.setProperty('--accent', card ? card.accent : '');
            startName.classList.remove('fading');
        }, FADE_MS);
    }

    for (const card of RULER_CARDS) {
        const button = document.createElement('button');
        button.className = 'ruler-card';
        button.style.setProperty('--accent', card.accent);
        button.innerHTML = '<span class="card-art"></span><span class="card-name"></span>';
        button.querySelector('.card-art').textContent = card.art;
        button.querySelector('.card-name').textContent = card.name;

        if (card.ruler === null) {
            button.classList.add('locked');
            button.disabled = true;
        } else {
            button.onmouseenter = button.onfocus = () => showName(card);
            button.onmouseleave = button.onblur = () => showName(null);
            button.onclick = () => onStart(card.ruler);
        }
        cardsElement.appendChild(button);
    }
    startName.textContent = BLANK;
}
