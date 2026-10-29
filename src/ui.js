import { WHITE, createInitialState, getLegalMoves, getStatus, applyMove, getPiece, findKing, opponent } from './engine.js';

const SYMBOLS = {
    'white-king': '♔', 'white-queen': '♕', 'white-rook': '♖', 'white-bishop': '♗', 'white-knight': '♘', 'white-pawn': '♙',
    'black-king': '♚', 'black-queen': '♛', 'black-rook': '♜', 'black-bishop': '♝', 'black-knight': '♞', 'black-pawn': '♟',
};

const sameSquare = (a, b) => a !== null && b !== null && a.r === b.r && a.c === b.c;

class ChessUI {
    constructor(boardElement, statusElement) {
        this.boardElement = boardElement;
        this.statusElement = statusElement;
        this.bottomColor = WHITE;   // which side is drawn at the bottom of the screen
        this.newGame();
    }

    newGame() {
        // Every position is kept, which makes undo and move history straightforward later.
        this.history = [createInitialState()];
        this.selected = null;
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
        this.selected = null;
        this.update();
    }

    movesFromSelected() {
        if (!this.selected) return [];
        return this.legalMoves.filter(m => m.type === 'move' && sameSquare(m.from, this.selected));
    }

    handleTileClick(r, c) {
        if (this.status.result !== 'playing') return;
        const square = { r, c };

        if (sameSquare(this.selected, square)) {
            this.selected = null;
            this.render();
            return;
        }

        const move = this.movesFromSelected().find(m => sameSquare(m.to, square));
        if (move) {
            this.play(move);
            return;
        }

        const piece = getPiece(this.state, r, c);
        if (piece && piece.color === this.state.turn) {
            this.selected = square;
            this.render();
        }
    }

    render() {
        this.boardElement.innerHTML = '';
        const targets = this.movesFromSelected().map(m => m.to);
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
                this.boardElement.appendChild(tile);
            }
        }

        this.statusElement.textContent = this.statusText();
    }

    statusText() {
        const { result, winner, inCheck } = this.status;
        const capitalize = s => s[0].toUpperCase() + s.slice(1);
        if (result === 'checkmate') return `Checkmate. ${capitalize(winner)} wins.`;
        if (result === 'stalemate') return 'Stalemate. Draw.';
        return `${capitalize(this.state.turn)} to move${inCheck ? ' (check)' : ''}.`;
    }
}

const ui = new ChessUI(document.getElementById('board'), document.getElementById('status'));
document.getElementById('restart').onclick = () => ui.newGame();
document.getElementById('flip').onclick = () => ui.flip();