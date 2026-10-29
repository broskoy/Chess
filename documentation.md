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

## Scope

### Phase 1 — Complete standard chess
- [x] Check detection; filter out moves that leave your own king in check
- [x] Checkmate and stalemate
- [x] Per-piece `hasMoved` flag
- [x] Castling rights tracking
- [x] Game-over message and a restart button
- [ ] Castling moves (both sides, all conditions: not through or out of check)
- [ ] En passant (state has an `enPassant` field, not yet set or used)
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

### Phase 3 — Polish (later)
- Undo, move notation for drops (e.g. `N@e4`), board flip, sounds, piece images instead of Unicode
- Online play (needs a server or peer-to-peer). Out of scope until local play feels right.

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
- Game: `npm run serve`, then open http://localhost:8000. ES modules don't load from `file://`, so opening index.html directly won't work.
- Tests: `npm test`.
