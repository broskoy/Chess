import {
    WHITE, DEFAULT_SETTINGS, createInitialState, getLegalMoves, getStatus, applyMove, getPiece, findKing, opponent,
    isThreefoldRepetition,
    rulerOf, materialOf, CONVERTIBLE_TYPES, conversionCost,
} from './engine.js';
import { sounds } from './sound.js';
import { setupMenu } from './menu.js';
import { RULER_INFO } from './rulers.js';

const SYMBOLS = {
    'white-king': '♔', 'white-queen': '♕', 'white-rook': '♖', 'white-bishop': '♗', 'white-knight': '♘', 'white-pawn': '♙',
    'black-king': '♚', 'black-queen': '♛', 'black-rook': '♜', 'black-bishop': '♝', 'black-knight': '♞', 'black-pawn': '♟',
};

const sameSquare = (a, b) => a !== null && b !== null && a.r === b.r && a.c === b.c;
const capitalize = s => s[0].toUpperCase() + s.slice(1);

class ChessUI {
    constructor(elements, settings) {
        this.elements = elements;
        this.settings = settings;
        this.bottomColor = WHITE;   // which side is drawn at the bottom of the screen
        this.newGame();
    }

    newGame() {
        // Every position is kept, which makes undo and move history straightforward later.
        this.history = [createInitialState(this.settings)];
        this.moves = [];   // moves[i] leads from history[i] to history[i + 1]
        this.clearSelection();
        this.update();
    }

    // Rule changes apply to the game in progress, so variants can be compared mid-game.
    setSettings(settings) {
        this.settings = settings;
        this.history[this.history.length - 1] = { ...this.state, settings };
        this.clearSelection();
        this.update();
    }

    // A new game as white (at the bottom) against the given settings' rulers.
    startGame(settings) {
        this.settings = settings;
        this.bottomColor = WHITE;
        this.newGame();
    }

    get state() {
        return this.history[this.history.length - 1];
    }

    // Recomputes everything derived from the current position, then redraws.
    update() {
        this.legalMoves = getLegalMoves(this.state);
        this.status = getStatus(this.state, this.legalMoves);
        if (this.status.result === 'playing' && isThreefoldRepetition(this.history)) {
            this.status = { result: 'repetition', winner: null, inCheck: this.status.inCheck };
        }
        this.render();
    }

    play(move) {
        const isCapture = move.type === 'move' && getPiece(this.state, move.to.r, move.to.c) !== null;
        this.history.push(applyMove(this.state, move));
        this.moves.push(move);
        this.clearSelection();
        this.update();
        const special = { resurrect: 'resurrect', convert: 'convert' }[move.type];
        this.playSound(special ?? (isCapture ? 'capture' : 'move'));
    }

    // The move sound, followed by a check or game-end sound when relevant.
    playSound(kind) {
        if (!this.soundOn) return;
        sounds[kind]();
        if (this.status.result !== 'playing') sounds.gameEnd();
        else if (this.status.inCheck) sounds.check();
    }

    undo() {
        if (this.history.length === 1) return;
        this.history.pop();
        this.moves.pop();
        // Keep the current rules even if they changed after this position was played.
        this.history[this.history.length - 1] = { ...this.state, settings: this.settings };
        this.clearSelection();
        this.update();
    }

    clearSelection() {
        this.selected = null;           // board square of the selected piece
        this.promotionChoices = null;   // promotion moves waiting for the player to pick a piece
    }

    // Moves available for the selected piece.
    selectedMoves() {
        if (!this.selected) return [];
        return this.legalMoves.filter(m => m.type === 'move' && sameSquare(m.from, this.selected));
    }

    handleTileClick(r, c) {
        if (this.status.result !== 'playing') return;
        const square = { r, c };
        // Clicking the board while choosing a promotion cancels it.
        this.promotionChoices = null;

        if (sameSquare(this.selected, square)) {
            this.clearSelection();
            this.render();
            return;
        }

        const moves = this.selectedMoves().filter(m => sameSquare(m.to, square));
        if (moves.length > 1) {
            // Several moves to one square only happens with promotion: ask which piece.
            this.promotionChoices = moves;
            this.render();
            return;
        }
        if (moves.length === 1) {
            this.play(moves[0]);
            return;
        }

        // Clicking the open grave raises its piece (a selected piece's move there takes priority).
        const resurrect = this.resurrectMove();
        if (resurrect && sameSquare(resurrect.to, square)) {
            this.play(resurrect);
            return;
        }

        const piece = getPiece(this.state, r, c);
        this.clearSelection();
        if (piece && piece.color === this.state.turn) this.selected = square;
        this.render();
    }

    resurrectMove() {
        return this.legalMoves.find(m => m.type === 'resurrect') ?? null;
    }

    render() {
        this.renderBoard();
        this.renderPlayerRows();
        this.renderTurnLight();
        this.elements.undo.disabled = this.history.length === 1;
        this.renderPromotionChoices();
        this.renderConvertChoices();
    }

    renderBoard() {
        const board = this.elements.board;
        board.innerHTML = '';
        const targets = this.selectedMoves().map(m => m.to);
        const checkedKing = this.status.inCheck ? findKing(this.state, this.state.turn) : null;
        const { grave } = this.state;
        const canRaise = this.resurrectMove() !== null && this.status.result === 'playing';
        const lastMove = this.moves[this.moves.length - 1] ?? null;
        // A resurrection only has the square where the piece rose, a conversion only the piece's square.
        const lastSquares = lastMove ? [lastMove.from ?? null, lastMove.to ?? null, lastMove.at ?? null] : [];

        // With black at the bottom the board is rotated 180°, so both rows and columns reverse.
        const flipped = this.bottomColor !== WHITE;
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const r = flipped ? 7 - row : row;
                const c = flipped ? 7 - col : col;
                const tile = document.createElement('div');
                const square = { r, c };
                tile.className = `tile ${(r + c) % 2 === 1 ? 'dark-tile' : 'light-tile'}`;

                const piece = getPiece(this.state, r, c);
                if (piece) {
                    tile.textContent = SYMBOLS[`${piece.color}-${piece.type}`];
                    tile.classList.add(`${piece.color}-piece`);
                }
                if (lastSquares.some(s => sameSquare(s, square))) tile.classList.add('last-move');
                if (sameSquare(this.selected, square)) tile.classList.add('selected');
                if (sameSquare(checkedKing, square)) tile.classList.add('in-check');
                if (targets.some(t => sameSquare(t, square))) tile.classList.add('highlight');
                if (sameSquare(grave, square)) this.decorateGrave(tile, piece, canRaise);
                if (piece && piece.type === 'king') tile.classList.add(`ruler-${rulerOf(this.state, piece.color)}`);

                tile.onclick = () => this.handleTileClick(r, c);
                board.appendChild(tile);
            }
        }
    }

    // The grave has a purple border, even with a piece standing on it. While it's
    // open, a faded ghost shows the dead piece; when the side to move can raise it,
    // the ghost takes their color (the color it would rise as) and the border pulses.
    decorateGrave(tile, piece, canRaise) {
        tile.classList.add('grave');
        if (piece) return;
        const dead = this.state.grave.piece;
        const color = canRaise ? this.state.turn : dead.color;
        // The ghost is its own element so fading it doesn't fade the square.
        const ghost = document.createElement('span');
        ghost.className = `ghost ${color}-piece`;
        ghost.textContent = SYMBOLS[`${color}-${dead.type}`];
        tile.appendChild(ghost);
        if (canRaise) {
            tile.classList.add('can-raise');
            tile.title = `Raise the ${dead.type}`;
        }
    }

    renderRulerIcon(element, color) {
        const info = RULER_INFO[rulerOf(this.state, color)];
        element.textContent = info.art;
        element.title = info.name;
        element.style.setProperty('--accent', info.accent);
    }

    // Each player's row: ruler icon, material on the board, and ruler ability.
    renderPlayerRows() {
        for (const [position, color] of [['Top', opponent(this.bottomColor)], ['Bottom', this.bottomColor]]) {
            this.renderRulerIcon(this.elements[`icon${position}`], color);
            const material = this.elements[`material${position}`];
            material.textContent = materialOf(this.state, color);
            material.title = `${capitalize(color)}'s material on the board`;
            this.renderAbility(this.elements[`ability${position}`], color);
        }
    }

    // A Necromancer's box shows what they could raise: the grave's enemy piece,
    // faded while something blocks the grave. A plain King has no ability, so its
    // box is hidden.
    renderAbility(element, color) {
        element.className = 'slot ability';
        element.textContent = '';
        element.title = '';
        element.onclick = null;
        const ruler = rulerOf(this.state, color);
        if (ruler === 'alchemist') {
            element.classList.add('alchemist');
            element.textContent = this.state.budget[color];
            element.title = `${capitalize(color)}'s Alchemist budget`;
            return;
        }
        if (ruler !== 'necromancer') {
            element.classList.add('none');
            return;
        }

        element.classList.add('necromancer');
        const { grave } = this.state;
        if (grave === null || grave.piece.color === color) {
            element.title = 'Grave: nothing to raise';
            return;
        }
        const type = grave.piece.type;
        const blocked = this.state.board[grave.r][grave.c] !== null;
        element.textContent = SYMBOLS[`${color}-${type}`];
        element.classList.add(`${color}-piece`, blocked ? 'locked' : 'open');
        element.title = blocked ? `Grave: ${type}, blocked` : `Grave: ${type}, ready to raise`;

        const raise = this.resurrectMove();
        if (raise && color === this.state.turn && this.status.result === 'playing') {
            element.classList.add('clickable');
            element.onclick = () => this.play(raise);
        }
    }

    // The marker sits on the side to move, in that side's color. Once the game
    // is over it stays with the winner, or parks in the middle in gray on a draw.
    renderTurnLight() {
        const { result, winner } = this.status;
        const color = result === 'playing' ? this.state.turn : winner;
        const position = color === null ? 'middle' : color === this.bottomColor ? 'bottom' : 'top';
        this.elements.turnMarker.className = `${position} ${color ?? 'draw'}`;
    }

    // The Alchemist's conversion buttons, always shown in the bottom player's row.
    // They stay greyed out without prices until one of that player's pieces is
    // selected; then each shows its price and lights up if it's allowed.
    renderConvertChoices() {
        const element = this.elements.convert;
        const color = this.bottomColor;
        element.innerHTML = '';
        element.hidden = rulerOf(this.state, color) !== 'alchemist' || this.promotionChoices !== null;
        if (element.hidden) return;

        const piece = this.selected ? getPiece(this.state, this.selected.r, this.selected.c) : null;
        const active = piece !== null && piece.color === color && piece.type !== 'king'
            && this.status.result === 'playing';

        for (const into of CONVERTIBLE_TYPES) {
            const button = document.createElement('button');
            button.className = `choice ${color}-piece`;
            button.textContent = SYMBOLS[`${color}-${into}`];
            button.title = into;
            button.disabled = true;
            if (active && into !== piece.type) {
                const cost = conversionCost(piece.type, into);
                const price = document.createElement('span');
                price.className = 'price';
                price.textContent = cost < 0 ? `+${-cost}` : cost > 0 ? `−${cost}` : '0';
                button.appendChild(price);

                const move = this.legalMoves.find(m =>
                    m.type === 'convert' && sameSquare(m.at, this.selected) && m.into === into);
                if (move) {
                    button.disabled = false;
                    button.title = `Turn into a ${into}`;
                    button.onclick = () => this.play(move);
                } else {
                    button.title = into === 'pawn' && cost <= this.state.budget[color]
                        ? 'New pawns can only be made in your own half'
                        : 'Not enough points';
                }
            }
            element.appendChild(button);
        }
    }

    // Shown in the bottom row, in place of the conversion buttons, when a pawn
    // can promote to more than one piece.
    renderPromotionChoices() {
        const element = this.elements.promotion;
        element.innerHTML = '';
        element.hidden = !this.promotionChoices;
        if (!this.promotionChoices) return;

        for (const move of this.promotionChoices) {
            const button = document.createElement('button');
            button.className = `choice ${this.state.turn}-piece`;
            button.textContent = SYMBOLS[`${this.state.turn}-${move.promotion}`];
            button.title = `Promote to a ${move.promotion}`;
            button.onclick = () => this.play(move);
            element.appendChild(button);
        }
    }
}

// Preferences are remembered in this browser. Storage can be unavailable
// (private windows, blocked site data), so failures fall back to defaults.
function loadStored(key, fallback) {
    try {
        const stored = JSON.parse(localStorage.getItem(key));
        return stored ?? fallback;
    } catch {
        return fallback;
    }
}

function saveStored(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Not remembered, but the change still applies for this visit.
    }
}

const SETTINGS_KEY = 'chess-settings';
const SOUND_KEY = 'chess-sound';

// Only known settings are kept, so stale ones from older versions are ignored.
function loadSettings() {
    const stored = loadStored(SETTINGS_KEY, {});
    const settings = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (typeof stored[key] === typeof DEFAULT_SETTINGS[key]) settings[key] = stored[key];
    }
    return settings;
}

// Form fields are named after the settings: checkboxes hold booleans, selects hold
// strings, or numbers when marked with data-number.
function bindSettingsForm(form, ui) {
    const fields = [...form.elements].filter(field => field.name);
    for (const field of fields) {
        if (field.type === 'checkbox') field.checked = ui.settings[field.name];
        else field.value = ui.settings[field.name];
    }
    form.onchange = () => {
        const settings = {};
        for (const field of fields) {
            if (field.type === 'checkbox') settings[field.name] = field.checked;
            else settings[field.name] = 'number' in field.dataset ? Number(field.value) : field.value;
        }
        saveStored(SETTINGS_KEY, settings);
        ui.setSettings(settings);
    };
}

const ui = new ChessUI({
    board: document.getElementById('board'),
    turnMarker: document.getElementById('turn-marker'),
    materialTop: document.getElementById('material-top'),
    materialBottom: document.getElementById('material-bottom'),
    abilityTop: document.getElementById('ability-top'),
    abilityBottom: document.getElementById('ability-bottom'),
    iconTop: document.getElementById('icon-top'),
    iconBottom: document.getElementById('icon-bottom'),
    promotion: document.getElementById('promotion'),
    convert: document.getElementById('convert'),
    undo: document.getElementById('undo'),
}, loadSettings());
document.getElementById('restart').onclick = () => ui.newGame();
document.getElementById('undo').onclick = () => ui.undo();
document.addEventListener('keydown', event => {
    if (gameScreen.hidden) return;
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.preventDefault();
        ui.undo();
    }
});
bindSettingsForm(document.getElementById('settings'), ui);

// Screens: the main menu, and the game itself.
const menuScreen = document.getElementById('menu');
const gameScreen = document.getElementById('game');
function showScreen(screen) {
    menuScreen.hidden = screen !== menuScreen;
    gameScreen.hidden = screen !== gameScreen;
}

// For now the player is always white, against a plain King.
setupMenu({
    cardsElement: document.getElementById('ruler-cards'),
    startButton: document.getElementById('start-game'),
    startName: document.getElementById('start-name'),
    onStart(ruler) {
        const settings = { ...ui.settings, whiteRuler: ruler, blackRuler: 'king' };
        saveStored(SETTINGS_KEY, settings);
        ui.startGame(settings);
        showScreen(gameScreen);
    },
});
document.getElementById('to-menu').onclick = () => showScreen(menuScreen);
showScreen(menuScreen);

// The speaker icon gets a diagonal line through it while muted.
const soundButton = document.getElementById('sound');
const showSound = () => {
    soundButton.classList.toggle('muted', !ui.soundOn);
    const label = ui.soundOn ? 'Sound on (click to mute)' : 'Sound off (click to unmute)';
    soundButton.title = label;
    soundButton.setAttribute('aria-label', label);
};
ui.soundOn = loadStored(SOUND_KEY, true);
showSound();
soundButton.onclick = () => {
    ui.soundOn = !ui.soundOn;
    saveStored(SOUND_KEY, ui.soundOn);
    showSound();
};
