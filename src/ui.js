import { WHITE, createInitialState, getLegalMoves, getStatus, applyMove, getPiece, findKing, opponent } from './engine.js';

const SYMBOLS = {
    'white-king': '♔', 'white-queen': '♕', 'white-rook': '♖', 'white-bishop': '♗', 'white-knight': '♘', 'white-pawn': '♙',
    'black-king': '♚', 'black-queen': '♛', 'black-rook': '♜', 'black-bishop': '♝', 'black-knight': '♞', 'black-pawn': '♟',
};

const sameSquare = (a, b) => a !== null && b !== null && a.r === b.r && a.c === b.c;

class ChessUI {
    constructor(elements) {
        this.elements = elements;
        this.bottomColor = WHITE;   // which side is drawn at the bottom of the screen
        this.newGame();
    }

    newGame() {
        // Every position is kept, which makes undo and move history straightforward later.
        this.history = [createInitialState()];
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
        this.history.push(applyMove(this.state, move));
        this.clearSelection();
        this.update();
    }

    clearSelection() {
        this.selected = null;           // board square of the selected piece
        this.selectedDrop = null;       // piece type selected in the hand
        this.promotionChoices = null;   // promotion moves waiting for the player to pick a piece
    }

    // Moves available for whatever is selected: a piece on the board or a piece in hand.
    selectedMoves() {
        if (this.selectedDrop) {
            return this.legalMoves.filter(m => m.type === 'drop' && m.piece === this.selectedDrop);
        }
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

        const piece = getPiece(this.state, r, c);
        this.clearSelection();
        if (piece && piece.color === this.state.turn) this.selected = square;
        this.render();
    }

    handleHandClick(color, type) {
        if (this.status.result !== 'playing' || color !== this.state.turn) return;
        const wasSelected = this.selectedDrop === type;
        this.clearSelection();
        if (!wasSelected) this.selectedDrop = type;
        this.render();
    }

    render() {
        this.renderBoard();
        this.renderHand(this.elements.handTop, opponent(this.bottomColor));
        this.renderHand(this.elements.handBottom, this.bottomColor);
        this.elements.status.textContent = this.statusText();
        this.renderPromotionChoices();
    }

    renderBoard() {
        const board = this.elements.board;
        board.innerHTML = '';
        const targets = this.selectedMoves().map(m => m.to);
        const checkedKing = this.status.inCheck ? findKing(this.state, this.state.turn) : null;

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
                if (sameSquare(this.selected, square)) tile.classList.add('selected');
                if (sameSquare(checkedKing, square)) tile.classList.add('in-check');
                if (targets.some(t => sameSquare(t, square))) tile.classList.add('highlight');

                tile.onclick = () => this.handleTileClick(r, c);
                board.appendChild(tile);
            }
        }
    }

    renderHand(element, color) {
        element.innerHTML = '';
        const isTurn = color === this.state.turn && this.status.result === 'playing';
        const counts = Object.entries(this.state.hands[color]).filter(([, count]) => count > 0);

        for (const [type, count] of counts) {
            const button = document.createElement('button');
            button.className = `hand-piece ${color}-piece`;
            button.title = type;
            button.textContent = SYMBOLS[`${color}-${type}`];
            if (count > 1) {
                const badge = document.createElement('span');
                badge.className = 'count';
                badge.textContent = count;
                button.appendChild(badge);
            }
            if (isTurn && this.selectedDrop === type) button.classList.add('selected');
            const canDrop = isTurn && this.legalMoves.some(m => m.type === 'drop' && m.piece === type);
            button.disabled = !canDrop;
            button.onclick = () => this.handleHandClick(color, type);
            element.appendChild(button);
        }

        if (isTurn && counts.length > 0 && this.state.dropCooldown[color] > 0) {
            const note = document.createElement('span');
            note.className = 'hand-note';
            note.textContent = 'You dropped last turn: make a board move first.';
            element.appendChild(note);
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
        const capitalize = s => s[0].toUpperCase() + s.slice(1);
        if (this.promotionChoices) return 'Promote to:';
        if (result === 'king-captured') return `${capitalize(winner)} captured the king and wins.`;
        if (result === 'no-moves') return `${capitalize(opponent(winner))} has no moves. ${capitalize(winner)} wins.`;
        if (result === 'checkmate') return `Checkmate. ${capitalize(winner)} wins.`;
        if (result === 'stalemate') return 'Stalemate. Draw.';
        return `${capitalize(this.state.turn)} to move${inCheck ? ' (check)' : ''}.`;
    }
}

const ui = new ChessUI({
    board: document.getElementById('board'),
    handTop: document.getElementById('hand-top'),
    handBottom: document.getElementById('hand-bottom'),
    status: document.getElementById('status'),
    promotion: document.getElementById('promotion'),
});
document.getElementById('restart').onclick = () => ui.newGame();
document.getElementById('flip').onclick = () => ui.flip();
