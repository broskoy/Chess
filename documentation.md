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

### Alchemist
- **Convert:** the Alchemist spends their turn to turn one of their pieces into another type (pawn, knight, bishop, rook or queen). The ruler can't be converted, and nothing can become a ruler.
- Has a **budget** of points, using the piece values (pawn 1, knight 3, bishop 3, rook 5, queen 9):
  - **Downgrading** a piece earns the difference (rook → knight: +2).
  - **Upgrading** a piece costs the difference (pawn → bishop: −2). You can't spend more than you have.
  - **Equal-value swaps** (knight ↔ bishop) are free, but still cost the turn.
  - Points come **only from downgrading**: nothing from captures or time.
- **Queens are allowed.** Bigger isn't automatically better: two rooks that protect each other often beat a queen, and a starting budget of 0 makes a queen expensive (pawn → queen costs 8).
- **New pawns only in your own half** (ranks 1–4 for white, 5–8 for black). A pawn made by alchemy hasn't marched anywhere. This also blocks two exploits:
  - Creating a pawn next to promotion that promotes straight away.
  - A points farm: rook on the 7th → pawn (+4), promote back to a rook, repeat.
- A converted piece counts as moved, so a new pawn has no double step. Converting a rook on its corner ends that castling right.
- **Starting budget** is a setting (default 0, applies to new games). It's the main tuning lever: a bigger budget suits the Alchemist's rushing playstyle against the slower Necromancer.
- Known shortcut, accepted for now: a pawn about to promote can become a rook for free, then a queen for 4 points (queen promotion for 4 points and an extra turn). Watch it in play-testing.
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
- **Alchemist:** what the right starting budget is; whether the promote-then-upgrade shortcut is too strong.
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
- [x] Threefold repetition is a draw. A position includes the board (and which pawns can still double step), turn, castling rights, the grave and the Alchemist budgets. The UI checks it over its list of positions; the engine state doesn't keep history, to keep copying cheap for the bot.
- Skipped for now: the 50-move rule. Probably rare here; add it if play-testing shows games dragging on. If added, conversions shouldn't reset the count (free knight-bishop swaps could stall forever).
- Not a draw: lone rulers. Wandering around until someone slips up isn't fun, but abilities make "can anyone still win?" hard to decide. Idea for later: a 10-turn limit once both sides are below 5 material.
- [ ] Move history / simple move list

### Phase 2 — Rulers framework and the Necromancer
- [x] Remove drops (engine, hands UI, drop settings)
- [x] Each side has a ruler type (settings `whiteRuler` / `blackRuler`: plain king, Necromancer, later Alchemist)
- [x] Track the grave: square and dead piece, updated on every capture
- [x] Resurrect move, available when the grave is empty and the side's ruler is a Necromancer
- [x] Show the grave on the board (purple border, also while a piece stands on it; a faded ghost of the dead piece while it's open, in the color it would rise as and with a pulsing border when you can raise it). Click the open grave to resurrect
- [x] Choose each side's ruler in the Rules panel (two players on one screen until the bot exists); ruler names shown above and below the board
- [x] Tests for grave tracking, blocking, resurrection colors

### Phase 3 — Alchemist
- [x] Budget in the game state, conversion moves (`{ type: 'convert', at, into }`)
- [x] UI: conversion buttons for all five types in the player's row, always visible; greyed out without prices until a piece is selected, then priced and lit up where allowed. Blue budget squircle in the player's row; starting budget in the Rules panel; conversion sound
- [x] Tests

### Main menu
- [x] Ruler cards in playing-card proportions (5:7) with placeholder art: King, Necromancer, Alchemist, and a locked "Coming soon" card. Cards lift and light up in the ruler's color on hover
- [x] "Start as the ___": hovering a card fades in its name; clicking a card selects it; clicking the text starts. Two steps because phones have no hover, so a tap only selects
- [x] The player is white against a plain King for now. Menu button in the game to go back. The name shows "..." until a card is hovered or chosen; nothing is pre-selected
- [x] Rules panel stays hidden (rulers are chosen in the menu, not mid-game)
- [ ] Sound and navigation reachable from every screen (proposal: a corner menu button opening an overlay with Sound, Main menu, Resume; Esc opens it on desktop)
- [ ] Card artwork
- Later: Alchemist starting budget, opponent choice, rounds

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
- [x] Turn indicator ("stoplight" beside the board): one marker slides to the side to move, changing from white through gray to black. No glow (a glowing black light looked odd). At game end it stays with the winner; on a draw it parks in the middle in gray
- [x] Sounds (synthesized in the browser, no audio files; on/off toggle remembered in the browser)
- [x] Icon buttons: house (main menu), circular arrow (restart), curved arrow (undo), speaker (sound; a diagonal line through it when muted). Drawn by hand as inline SVG, so there's no icon license to track
- Removed the flip board button (not needed once you always play from your own side). The board can still be drawn with black at the bottom, for playing the bot as black later. Auto-flip each turn was tried earlier and felt disorienting.
- [x] Rules panel ("Rules" under the board; changes apply to the current game and are remembered in the browser) — now hidden, see Home screen
- [x] No status line: the turn light, the red ruler square and the grave glow already show what it said
- [x] Board scales with the window (squares 40-80px on wide screens)
- [x] Phones: below 700px wide, the board and side bar are centered together and the side bar shrinks, so the board fits; the player rows' squircles shrink to stay within the board's width. Taps go through immediately (`touch-action: manipulation` turns off the double-tap-zoom wait)
- [x] Resurrect sound
- [x] Last move highlighted on the board (for a resurrection, the square where the piece rose)
- [x] Player rows above (opponent) and below (you) the board, from the left: ruler icon (placeholder art in the ruler's color), material, ruler ability box, and for the Alchemist at the bottom the five conversion buttons
  - Material: total piece values on the board per side (pawn 1, knight 3, bishop 3, rook 5, queen 9), so players don't have to recount after raises and conversions
  - Necromancer box: the grave's enemy piece in the Necromancer's color; faded while blocked, glowing when it can be raised (click to raise); empty when there's nothing to raise
  - A plain King has no ability box
  - Alchemist box: budget in blue
- [x] Side bar beside the board, spanning its height, for general controls: home, restart, undo and mute at the top, the turn light in the middle, and an empty slot for items at the bottom
- [ ] In-game guide: a booklet icon that opens [guide.md](guide.md)
- Later: piece images instead of Unicode, ruler artwork

### Not planned
- **Online multiplayer.** There's no server, and the game is designed around the bot.

## Technical approach

- Plain HTML/CSS/JavaScript with ES modules, no build step and no framework for now.
- **Rules engine written from scratch** (no chess.js), so new rules and abilities are easy to add.

### Files
- [guide.md](guide.md): the player guide (rules and tips per ruler) for people new to the game. Keep it updated as rules change and as play-testing turns up new tips. Could later be shown in the game behind a booklet icon.
- [src/engine.js](src/engine.js): rules only, no DOM. Runs in the browser and in Node.
- [src/ui.js](src/ui.js): rendering and input. Keeps a list of every position, which undo uses.
- [src/sound.js](src/sound.js): sound effects generated with the Web Audio API.
- [src/menu.js](src/menu.js): the main menu (ruler cards and start text).
- [test/engine.test.js](test/engine.test.js): engine tests, including perft (counting positions to a fixed depth, the standard check for move generation).

### Engine design
- **Game state is one plain object**: board, turn, castling rights, grave, Alchemist budgets, clocks and settings (including each side's ruler). Everything the rules depend on lives there.
- **Pure functions**: `applyMove(state, move)` returns a new state and never changes the old one. Pieces are never mutated, so copies can share them cheaply.
- **Abilities are move types**, so the UI, undo and the bot handle them like any other move:
  - Board move: `{ type: 'move', from, to, castle?, promotion? }`
  - Resurrect: `{ type: 'resurrect' }` (the grave holds the square and piece)
  - Convert (Alchemist): `{ type: 'convert', at, into }`
- Legal move generation: generate all moves including abilities, then (in standard-rules mode) drop any that leave your own king in check.
- `fromFEN` loads standard FEN positions, mainly for tests.

### Running
- Game: `npm run serve`, then open http://localhost:8000. ES modules don't load from `file://`, so opening index.html directly won't work. The server ([serve.py](serve.py)) disables browser caching so edits show up on a normal reload.
- Tests: `npm test`.
