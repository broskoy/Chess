# Chess with Drops — Plan

A web chess variant where captured pieces can be brought back onto the board (like shogi), with restrictions that keep it from turning into an all-out attacking game.

## Core idea

- When you capture an enemy piece, it goes into **your hand** and switches to your color.
- On your turn you either **make a normal move** or **drop** a piece from your hand onto the board.
- Drops are limited by a **drop zone** and a **cooldown** (see below).

## Variant rules

### Drop zone
- You can only drop on **empty squares in your own 4 ranks** (white: ranks 1–4, black: ranks 5–8).
- Pawns can't be dropped on your own back rank (they could never move).
- Pawns can't be dropped on the last rank (normally impossible anyway with a 4-rank zone).

### Cooldown
- After a drop, your **next turn must be a normal board move**. You can't drop on two turns in a row.
- This stops the drop → check → drop → check chains that dominate Crazyhouse.

### Pawn double step
- A pawn's double step depends on a per-piece **`hasMoved` flag**, not on its rank.
- A dropped pawn starts with `hasMoved = false`, so its first move can be a double step from wherever it was dropped.
- En passant applies to any double step, including one by a dropped pawn.

### Castling
- A **dropped rook can never castle**. Castling is tracked as rights in the game state (lost when the king moves or a rook's corner is moved from or captured on), not through the rook's `hasMoved`, so a rook dropped on a1/h1 doesn't count.

### King capture
- The king can be captured, and **capturing it wins the game**. Moves that leave your king attacked are allowed, so mistakes are punished rather than prevented.
- Checkmate still works in practice: every move loses the king next turn. Stalemate becomes a loss, since you have to move into capture.
- Castling still can't start from, pass through or land on an attacked square.
- The king is highlighted when attacked, so players notice the danger.
- This is a setting (`kingCapture`, on by default) so it can be compared with standard check rules during play-testing.

### Open questions (decide through play-testing)
- **Drop checks / drop mates**: allowed for now. The drop zone and cooldown may be enough to tame them.
- **Promoted pawns**: when captured, does the piece go into hand as its promoted type (e.g. queen) or **revert to a pawn**? For now it keeps its promoted type. Make it a setting.

## Configurable settings (for play-testing)

| Setting | Default | Options |
|---|---|---|
| Drop zone depth | 4 ranks | 2, 3, 4 |
| Drop cooldown | 1 turn | 0, 1, 2 |
| Drop checks allowed | yes | yes / no |
| Captured promoted pieces revert to pawn | no | yes / no |
| King capture (instead of checkmate) | yes | yes / no |

## Scope

### Phase 1 — Complete standard chess
- [x] Check detection; filter out moves that leave your own king in check
- [x] Checkmate and stalemate
- [x] Per-piece `hasMoved` flag
- [x] Castling rights tracking
- [x] Game-over message and a restart button
- [x] King capture rule (setting, on by default)
- [x] Castling moves (both sides; not out of, through or into an attacked square)
- [x] En passant (also after a dropped pawn's double step)
- [ ] Pawn promotion (with a choice of piece; set `promoted: true` on the new piece)
- [ ] Draw rules: threefold repetition, 50-move rule, insufficient material (lower priority)
- [ ] Move history / simple move list (the UI already keeps every position)

### Phase 2 — Drops
- [ ] Captured pieces go to the capturer's hand (color switched)
- [ ] Hand display for each player, with counts per piece type
- [ ] Select a piece from the hand → highlight legal drop squares → click to drop
- [ ] Drop zone restriction
- [ ] Cooldown restriction (show in the UI when drops are unavailable)
- [ ] Drops count for check/checkmate: a drop that blocks a check is a legal escape, so checkmate detection must consider drops too
- [ ] Settings panel for the table above

### Phase 3 — Bot
- [ ] Mode choice at the start: **vs bot** (pick your color) or **two players on one screen**
- [ ] Bot: alpha-beta search a few moves deep with a material-based evaluation, running in the browser
- [ ] Improve evaluation over time: king safety, piece activity, value of pieces in hand
- [ ] Run the search in a Web Worker so the page doesn't freeze while the bot thinks

### Phase 4 — Release and polish
- [ ] Publish on GitHub Pages (static files, no server)
- Undo, move notation for drops (e.g. `N@e4`), sounds, piece images instead of Unicode

### Board orientation
- [x] Flip board button
- No auto-flip each turn: tried it, and a board that spins every move felt disorienting even for two players.
- When playing the bot as black, black is at the bottom.

### Not planned
- **Online multiplayer.** There's no server, and the bot covers playing alone. If it's ever wanted: peer-to-peer (WebRTC/PeerJS, game by shared link) or a free hosted backend.
- If a much stronger bot is ever needed, Fairy-Stockfish supports custom drop variants in the browser (unclear whether it can express the cooldown rule).

### Future ideas
- Piece **abilities** (special powers). Parked for now; standard chess + drops comes first.

## Technical approach

- Plain HTML/CSS/JavaScript with ES modules, no build step and no framework for now.
- **Rules engine written from scratch** (no chess.js) so the variant rules are easy to change.

### Files
- [src/engine.js](src/engine.js): rules only, no DOM. Runs in the browser and in Node.
- [src/ui.js](src/ui.js): rendering and input. Keeps a list of every position (for undo and history later).
- [test/engine.test.js](test/engine.test.js): engine tests, including perft (counting positions to a fixed depth, the standard check for move generation).

### Engine design
- **Game state is one plain object**: board, turn, castling rights, en passant square, hands, drop cooldowns, clocks and settings. Everything the rules depend on lives there.
- **Pure functions**: `applyMove(state, move)` returns a new state and never changes the old one. Pieces are never mutated, so copies can share them cheaply.
- Move representation covers both kinds of move:
  - Board move: `{ type: 'move', from, to, promotion? }`
  - Drop: `{ type: 'drop', piece, to }`
- Legal move generation: generate pseudo-legal moves (drops included, once added), then drop any that leave your own king in check. Checkmate = in check with no legal moves. Because drops go through the same filter, blocking a check with a drop works automatically.
- `fromFEN` loads standard FEN positions, mainly for tests.

### Running
- Game: `npm run serve`, then open http://localhost:8000. ES modules don't load from `file://`, so opening index.html directly won't work. The server ([serve.py](serve.py)) disables browser caching so edits show up on a normal reload.
- Tests: `npm test`.
