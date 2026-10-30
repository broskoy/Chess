// Main menu: choose a ruler from a row of cards, then start a game.
// The card art is a placeholder symbol for now.

const RULER_CARDS = [
    { ruler: 'king', name: 'King', art: '♔', accent: '#d9b44a' },
    { ruler: 'necromancer', name: 'Necromancer', art: '☠', accent: '#9677cf' },
    { ruler: 'alchemist', name: 'Alchemist', art: '⚗', accent: '#3f7bd1' },
    { ruler: null, name: 'Coming soon', art: '?', accent: '#666' },
];

const FADE_MS = 150;

// Hovering a card previews its name in "Start as the ___"; clicking selects it, and the
// start text starts the game. Phones have no hover, so a tap selects without starting.
export function setupMenu({ cardsElement, startButton, startName, initialRuler, onStart }) {
    let selected = RULER_CARDS.find(card => card.ruler === initialRuler && card.ruler !== null) ?? null;
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
            startName.textContent = card ? card.name : '___';
            startButton.style.setProperty('--accent', card ? card.accent : '');
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
            button.onmouseenter = () => showName(card);
            button.onmouseleave = () => showName(selected);
            button.onclick = () => {
                selected = card;
                for (const other of cardsElement.children) other.classList.remove('selected');
                button.classList.add('selected');
                startButton.disabled = false;
                showName(card);
            };
            if (card === selected) button.classList.add('selected');
        }
        cardsElement.appendChild(button);
    }

    startButton.disabled = selected === null;
    startButton.onclick = () => {
        if (selected) onStart(selected.ruler);
    };
    // Show the initial name without a fade.
    shown = selected;
    startName.textContent = selected ? selected.name : '___';
    startButton.style.setProperty('--accent', selected ? selected.accent : '');
}
