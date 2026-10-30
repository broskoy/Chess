import {
    WHITE, DEFAULT_SETTINGS, createInitialState, getLegalMoves, getStatus, applyMove, getPiece, findKing, opponent,
    rulerOf,
} from './engine.js';
import { sounds } from './sound.js';

const SYMBOLS = {
    'white-king': '♔', 'white-queen': '♕', 'white-rook': '♖', 'white-bishop': '♗', 'white-knight': '♘', 'white-pawn': '♙',
    'black-king': '♚', 'black-queen': '♛', 'black-rook': '♜', 'black-bishop': '♝', 'black-knight': '♞', 'black-pawn': '♟',
};

const RULER_NAMES = { king: 'King', necromancer: 'Necromancer' };

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

    flip() {
        this.bottomColor = opponent(this.bottomColor);
        this.render();
    }

    get state() {
        return this.history[this.history.length - 1];
    }

    // Recomputes everything derived from the current position, then redraws.
    update() {
        this.legalMoves = getLegalMoves(this.state);
        this.status = getStatus(this.state, this.legalMoves);
        this.render();
    }

    play(move) {
        const isCapture = move.type === 'move' && getPiece(this.state, move.to.r, move.to.c) !== null;
        this.history.push(applyMove(this.state, move));
        this.moves.push(move);
        this.clearSelection();
        this.update();
        this.playSound(move.type === 'resurrect' ? 'resurrect' : isCapture ? 'capture' : 'move');
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
        this.renderRulerLabel(this.elements.rulerTop, opponent(this.bottomColor));
        this.renderRulerLabel(this.elements.rulerBottom, this.bottomColor);
        this.renderTurnLight();
        this.elements.status.textContent = this.statusText();
        this.elements.undo.disabled = this.history.length === 1;
        this.renderPromotionChoices();
    }

    renderBoard() {
        const board = this.elements.board;
        board.innerHTML = '';
        const targets = this.selectedMoves().map(m => m.to);
        const checkedKing = this.status.inCheck ? findKing(this.state, this.state.turn) : null;
        const { grave } = this.state;
        const canRaise = this.resurrectMove() !== null && this.status.result === 'playing';
        const lastMove = this.moves[this.moves.length - 1] ?? null;
        // A resurrection has no starting square, only where the piece rose.
        const lastSquares = lastMove ? [lastMove.from ?? null, lastMove.to] : [];

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

    // The grave is marked with a skull. While it's open, a faded ghost shows the piece that would rise.
    decorateGrave(tile, piece, canRaise) {
        tile.classList.add('grave');
        if (piece) return;
        const dead = this.state.grave.piece;
        tile.textContent = SYMBOLS[`${dead.color}-${dead.type}`];
        tile.classList.add('ghost', `${dead.color}-piece`);
        if (canRaise) {
            tile.classList.add('can-raise');
            tile.title = `Raise the ${dead.type}`;
        }
    }

    renderRulerLabel(element, color) {
        element.textContent = `${capitalize(color)}: ${RULER_NAMES[rulerOf(this.state, color)]}`;
    }

    // Two lights matching the board orientation: the side to move is lit,
    // and once the game is over the winner stays lit.
    renderTurnLight() {
        const { result, winner } = this.status;
        const litColor = result === 'playing' ? this.state.turn : winner;
        const [top, bottom] = this.elements.turnLight.children;
        for (const [light, color] of [[top, opponent(this.bottomColor)], [bottom, this.bottomColor]]) {
            light.className = `light ${color}-light`;
            light.classList.toggle('on', color === litColor);
        }
    }

    renderPromotionChoices() {
        const element = this.elements.promotion;
        element.innerHTML = '';
        element.hidden = !this.promotionChoices;
        if (!this.promotionChoices) return;

        for (const move of this.promotionChoices) {
            const button = document.createElement('button');
            button.textContent = SYMBOLS[`${this.state.turn}-${move.promotion}`];
            button.title = move.promotion;
            button.className = `${this.state.turn}-piece`;
            button.onclick = () => this.play(move);
            element.appendChild(button);
        }
    }

    statusText() {
        const { result, winner, inCheck } = this.status;
        if (this.promotionChoices) return 'Promote to:';
        if (result === 'king-captured') return `${capitalize(winner)} captured the king and wins.`;
        if (result === 'no-moves') return `${capitalize(opponent(winner))} has no moves. ${capitalize(winner)} wins.`;
        if (result === 'checkmate') return `Checkmate. ${capitalize(winner)} wins.`;
        if (result === 'stalemate') return 'Stalemate. Draw.';
        const raise = this.resurrectMove() ? ' Click the grave to raise its piece.' : '';
        return `${capitalize(this.state.turn)} to move${inCheck ? ' (check)' : ''}.${raise}`;
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

// Form fields are named after the settings: checkboxes hold booleans, selects hold strings.
function bindSettingsForm(form, ui) {
    const fields = [...form.elements].filter(field => field.name);
    for (const field of fields) {
        if (field.type === 'checkbox') field.checked = ui.settings[field.name];
        else field.value = ui.settings[field.name];
    }
    form.onchange = () => {
        const settings = {};
        for (const field of fields) {
            settings[field.name] = field.type === 'checkbox' ? field.checked : field.value;
        }
        saveStored(SETTINGS_KEY, settings);
        ui.setSettings(settings);
    };
}

const ui = new ChessUI({
    board: document.getElementById('board'),
    turnLight: document.getElementById('turn-light'),
    rulerTop: document.getElementById('ruler-top'),
    rulerBottom: document.getElementById('ruler-bottom'),
    status: document.getElementById('status'),
    promotion: document.getElementById('promotion'),
    undo: document.getElementById('undo'),
}, loadSettings());
document.getElementById('restart').onclick = () => ui.newGame();
document.getElementById('undo').onclick = () => ui.undo();
document.getElementById('flip').onclick = () => ui.flip();
document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.preventDefault();
        ui.undo();
    }
});
bindSettingsForm(document.getElementById('settings'), ui);

const soundButton = document.getElementById('sound');
const showSound = () => { soundButton.textContent = ui.soundOn ? 'Sound on' : 'Sound off'; };
ui.soundOn = loadStored(SOUND_KEY, true);
showSound();
soundButton.onclick = () => {
    ui.soundOn = !ui.soundOn;
    saveStored(SOUND_KEY, ui.soundOn);
    showSound();
};
