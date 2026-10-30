# Chess with Rulers — Plan

A single-player chess game against a bot, where each side's king is a **ruler** with a special ability. The first two rulers are the **Necromancer**, who raises the most recent dead piece, and the **Alchemist**, who converts pieces using a budget.

(The name is a placeholder.)

## Direction

- **Rulers replace the king.** A ruler moves and is captured like a king, and capturing it wins. Each ruler adds one ability, used instead of a normal move.
- **Bot only.** You play against the bot, eventually over **multiple rounds** with different rulers and armies.
- **Fun over fairness.** Rulers don't need to be balanced against each other. Since it's single-player, what matters is that each round feels beatable but tense, which is tuned with the bot's strength, its ruler and its army.
- **Asymmetric playstyles.** The Necromancer generates value over time, so it plays defensively to grow its army. The Alchemist can start with a larger budget and rush.

### Why not drops anymore
The first version let you drop captured pieces back onto the board (like shogi / Crazyhouse). Play-testing showed this reduces tactics and rewards aggression too much: every capture counts twice, so games turn into attacking races. The ruler abilities are deliberately local and limited instead. The drop code lives in the git history (commits "Add drops to the engine" through "Add a rules panel") if it's ever needed again.

## Rulers

### Necromancer
- There is **one grave** on the board: the square where the **most recent piece died**, from either side.
- The grave holds that piece. A new death anywhere replaces the grave.
- **Resurrect:** the Necromancer spends their turn to raise the piece in the grave, on the grave's square, **in the Necromancer's color**.
- **Only enemy pieces can be raised.** When one of the Necromancer's own pieces dies, the grave holds it and is useless to them until the next death.
  - Why: raising your own pieces rewarded throwing strong pieces into danger, and reviving your own bishop with check felt more annoying than interesting. The Necromancer should grow by winning the opponent's pieces.
- A raised piece counts as already moved, so a raised pawn has **no double step**.
- The grave square must be **empty**. Right after a capture, the capturing piece stands on the grave and blocks it. The grave opens only once that piece moves away. This keeps the ability tame for now.
- Range: anywhere on the board (the grave's location is the only constraint).
- **Tactics this creates:**
  - The capturer can stay on the grave to block it, or step off and allow a resurrection.
  - The grave is usually on a contested square, so a raised piece may be captured again straight away. Keeping a threat on the grave is a defence.
  - **Grave denial:** if the Necromancer just won a strong piece, the opponent can capture any Necromancer piece (even a pawn) to replace the grave with something the Necromancer can't raise.
  - **Bait:** while the opponent's queen is in the grave, a greedy capture by the Necromancer replaces it with a lesser piece. The Necromancer must weigh the material in front of them against the piece they could raise.
  - The Necromancer's own trades close the grave, so trading has a hidden cost for them.
  - With two Necromancers, only the side that did the killing can raise the piece.
- **The real value is the lock, not the material** (found in play-testing):
  - A grave holding a strong enemy piece is a standing threat. An opponent's piece on the grave is effectively **pinned** there: if it moves, the dead piece rises.
  - The Necromancer's own piece on the grave becomes a **trigger**: it can step off with a threat of its own (attack, check), leaving the opponent two problems at once, like a discovered attack.
  - Ways out exist (replace the grave with another capture, cover the square, step off when the raise wouldn't hurt), but each costs a move or a commitment.
  - So the Necromancer converts material into **time and tension**. It's stronger in slow positions than in races, which fits its defensive identity.
  - It gets **stronger later in the game**: with fewer pieces left, locking one of two major pieces stings more. A full test game was close.
  - No cheesy tactics found so far, and positions are harder to calculate for both sides, in a good way.
- Possible buff: **two graves** holding the last two deaths. Probably unnecessary, and two locked squares may tie down too much of the board; also makes removing a strong piece for good harder.
- For the bot: an evaluation that only counts material will misjudge the Necromancer. It needs to value a strong enemy piece in a grave that can open, and treat a piece standing on that grave as less free than it looks.

### Alchemist (planned, rules still open)
- Converts one of their pieces into another type, spending the turn.
- Has a **budget** of points, using standard piece values (pawn 1, knight 3, bishop 3, rook 5, queen 9).
  - **Downgrading** a piece earns the difference (rook → knight: +2).
  - **Upgrading** a piece costs the difference (pawn → bishop: −2).
- Starts with **0 points** on a full board, so the first conversion must be a downgrade (a stuck rook becoming an active knight, for example). The starting budget is the main tuning lever.
- Likely limits: the king/ruler can't be converted. Pawns can't be created on the first or last rank.
- The same point values can define **army budgets**, allowing different starting setups per round.

## Base rules

These carry over from standard chess, with a few deliberate changes.

### King capture
- The ruler can be captured, and **capturing it wins the game**. Moves that leave your ruler attacked are allowed, so mistakes are punished rather than prevented.
- Checkmate still works in practice: every move loses the ruler next turn. Stalemate becomes a loss, since you have to move into capture.
- Castling still can't start from, pass through or land on an attacked square.
- The ruler is highlighted when attacked, and a sound plays.
- Setting `kingCapture` (on by default) switches back to standard check rules.

### Pawn double step
- A pawn's double step depends on a per-piece **`hasMoved` flag**, not on its rank. This matters for pieces that come back (resurrected) or change type (converted).

### Promotion
- A pawn reaching the last rank **promotes to a rook** for now. Some promotion is needed so pushing pawns stays a goal, but a free queen is too strong.
- Rulers may get their own promotion rules later.

### No en passant
- Removed. It exists to stop a double-stepping pawn from slipping past an enemy pawn, a subtlety that matters little next to the ruler abilities, and many casual players don't know it.
- It also means every capture leaves the dead piece under the capturer, so every grave starts blocked.

### Castling
- Tracked as rights in the game state (lost when the king moves or a rook's corner is moved from or captured on), not through the rook's `hasMoved`. A rook that is resurrected or created on a1/h1 can't castle.

## Open questions (decide through play-testing)

- **Necromancer:**
  - Does a promoted piece come back as its promoted type, or as a pawn?
  - Can a resurrection capture or give check? (It can't capture, since the square must be empty; giving check is allowed for now.)
- **Alchemist:** starting budget; whether budget is also earned per turn or per capture; whether upgrading to a queen is allowed or capped; one conversion per turn.
- **Rounds:** how many, what changes between them (bot ruler, army budget, bot strength), and what the player keeps between rounds.

## Scope

### Phase 1 — Standard chess (done)
- [x] Check, checkmate and stalemate (standard rules mode)
- [x] King capture rule (setting, on by default)
- [x] Castling
- [x] Promotion (rook only for now; the UI shows a picker only when there's a choice)
- [x] Removed en passant
- [x] Per-piece `hasMoved` flag; castling rights tracking
- [x] Game-over message, restart, undo
- [ ] Draw rules: threefold repetition, 50-move rule, insufficient material (lower priority)
- [ ] Move history / simple move list

### Phase 2 — Rulers framework and the Necromancer
- [x] Remove drops (engine, hands UI, drop settings)
- [x] Each side has a ruler type (settings `whiteRuler` / `blackRuler`: plain king, Necromancer, later Alchemist)
- [x] Track the grave: square and dead piece, updated on every capture
- [x] Resurrect move, available when the grave is empty and the side's ruler is a Necromancer
- [x] Show the grave on the board (skull marker; a faded ghost of the dead piece while it's open, pulsing when you can raise it). Click the open grave to resurrect
- [x] Choose each side's ruler in the Rules panel (two players on one screen until the bot exists); ruler names shown above and below the board
- [x] Tests for grave tracking, blocking, resurrection colors

### Phase 3 — Alchemist
- [ ] Budget in the game state, conversion moves, UI to pick a piece and its new type
- [ ] Tests

### Phase 4 — Bot
- [ ] Alpha-beta search a few moves deep with a material-based evaluation, running in the browser
- [ ] Understand ruler abilities (they're just extra move types for the search; evaluation may need hints, e.g. the value of an open grave or of unspent budget)
- [ ] Run the search in a Web Worker so the page doesn't freeze while the bot thinks
- [ ] Mode choice: vs bot (pick your color and ruler) or two players on one screen (kept for testing)

### Phase 5 — Rounds and armies
- [ ] Multiple rounds against the bot with different rulers
- [ ] Army budgets and different starting setups

### Polish (done so far)
- [x] Published on GitHub Pages: https://broskoy.github.io/Chess/ (serves `main` as static files; every push updates it)
- [x] Turn indicator ("stoplight" beside the board; the winner stays lit at game end)
- [x] Sounds (synthesized in the browser, no audio files; on/off toggle remembered in the browser)
- [x] Flip board button. No auto-flip each turn: tried it, and a board that spins every move felt disorienting.
- [x] Rules panel ("Rules" under the board; changes apply to the current game and are remembered in the browser)
- [x] Resurrect sound
- [x] Last move highlighted on the board (for a resurrection, the square where the piece rose)
- Later: piece images instead of Unicode, ruler artwork

### Not planned
- **Online multiplayer.** There's no server, and the game is designed around the bot.

## Technical approach

- Plain HTML/CSS/JavaScript with ES modules, no build step and no framework for now.
- **Rules engine written from scratch** (no chess.js), so new rules and abilities are easy to add.

### Files
- [src/engine.js](src/engine.js): rules only, no DOM. Runs in the browser and in Node.
- [src/ui.js](src/ui.js): rendering and input. Keeps a list of every position, which undo uses.
- [src/sound.js](src/sound.js): sound effects generated with the Web Audio API.
- [test/engine.test.js](test/engine.test.js): engine tests, including perft (counting positions to a fixed depth, the standard check for move generation).

### Engine design
- **Game state is one plain object**: board, turn, castling rights, rulers, grave, clocks and settings. Everything the rules depend on lives there.
- **Pure functions**: `applyMove(state, move)` returns a new state and never changes the old one. Pieces are never mutated, so copies can share them cheaply.
- **Abilities are move types**, so the UI, undo and the bot handle them like any other move:
  - Board move: `{ type: 'move', from, to, castle?, promotion? }`
  - Resurrect: `{ type: 'resurrect' }` (the grave holds the square and piece)
  - Convert (Alchemist): `{ type: 'convert', at, to }`
- Legal move generation: generate all moves including abilities, then (in standard-rules mode) drop any that leave your own king in check.
- `fromFEN` loads standard FEN positions, mainly for tests.

### Running
- Game: `npm run serve`, then open http://localhost:8000. ES modules don't load from `file://`, so opening index.html directly won't work. The server ([serve.py](serve.py)) disables browser caching so edits show up on a normal reload.
- Tests: `npm test`.
