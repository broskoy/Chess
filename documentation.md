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
- The **grave** is the square where the **last piece the Necromancer captured** died. It holds that piece, and the Necromancer's next capture replaces it.
- **Resurrect:** the Necromancer spends their turn to raise the piece in the grave, on the grave's square, **in the Necromancer's color**.
- **Only enemy pieces can be raised, and the Necromancer's own deaths don't touch the grave.** The opponent's captures can't change it.
  - Why only enemy pieces: raising your own rewarded throwing strong pieces into danger, and reviving your own bishop with check felt more annoying than interesting.
  - Why own deaths don't count: originally the grave held the last death from either side, but in play the ability was rarely usable. The opponent could replace the grave with any capture, and an ordinary exchange replaced it straight away. Now a recapture leaves the enemy piece standing on the grave, tied down.
- A raised piece counts as already moved, so a raised pawn has **no double step**.
- The grave square must be **empty**. Right after a capture, the capturing piece stands on the grave and blocks it. The grave opens only once that piece moves away. This keeps the ability tame for now.
- Range: anywhere on the board (the grave's location is the only constraint).
- **Tactics this creates:**
  - The capturer can stay on the grave to block it, or step off and allow a resurrection.
  - The grave is usually on a contested square, so a raised piece may be captured again straight away. Keeping a threat on the grave is a defence.
  - **Bait:** while the opponent's queen is in the grave, a greedy capture by the Necromancer replaces it with a lesser piece. The Necromancer must weigh the material in front of them against the piece they could raise.
  - With two Necromancers, each has their own grave. After an exchange they can share a square, and whoever gets a turn first once it's empty raises their piece.
- **The real value is the lock, not the material** (found in play-testing):
  - A grave holding a strong enemy piece is a standing threat. An opponent's piece on the grave is effectively **pinned** there: if it moves, the dead piece rises.
  - The Necromancer's own piece on the grave becomes a **trigger**: it can step off with a threat of its own (attack, check), leaving the opponent two problems at once, like a discovered attack.
  - Ways out exist (cover the square, step off when the raise wouldn't hurt), but each costs a move or a commitment.
  - So the Necromancer converts material into **time and tension**. It's stronger in slow positions than in races, which fits its defensive identity.
  - It gets **stronger later in the game**: with fewer pieces left, locking one of two major pieces stings more. A full test game was close.
  - No cheesy tactics found so far, and positions are harder to calculate for both sides, in a good way.
- Watch in play-testing: a dead queen now stays a threat until the Necromancer captures something else, so this could turn out too strong. If it does, a possible limit is the grave expiring after some turns.
- Rejected buff: **two graves** holding the last two deaths. After an exchange both would sit on one square, which needs an extra rule for which piece rises, and denial would just take two captures.
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
- The engine setting `kingCapture` (on, not exposed in the game) switches back to standard check rules. The tests use it.

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
  - A raised piece comes back as the type that died, so a promoted rook rises as a rook. If it should rise as a pawn instead, pieces would need to remember that they were promoted (removed for now, since nothing used it).
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
- [x] Threefold repetition is a draw. A position includes the board (and which pawns can still double step), turn, castling rights, the graves and the Alchemist budgets. The UI checks it over its list of positions; the engine state doesn't keep history, to keep copying cheap for the bot.
- Skipped for now: the 50-move rule. Probably rare here; add it if play-testing shows games dragging on. If added, conversions shouldn't reset the count (free knight-bishop swaps could stall forever).
- Not a draw: lone rulers. Wandering around until someone slips up isn't fun, but abilities make "can anyone still win?" hard to decide. Idea for later: a 10-turn limit once both sides are below 5 material.
- Later: post-game review (step back and forward through a finished game, or a copied one). Every position is already stored, so it's mostly UI.

### Phase 2 — Rulers framework and the Necromancer
- [x] Remove drops (engine, hands UI, drop settings)
- [x] Each side has a ruler type (settings `whiteRuler` / `blackRuler`: plain king, Necromancer, later Alchemist)
- [x] Track the grave: square and dead piece, updated on every capture
- [x] Resurrect move, available when the grave square is empty and the side's ruler is a Necromancer
- [x] Show the grave on the board (purple border, also while a piece stands on it; a faded ghost of the dead piece while it's open, in the color it would rise as and with a pulsing border when you can raise it). Click the open grave to resurrect
- [x] Choose your ruler in the main menu; ruler icons beside the board
- [x] Tests for grave tracking, blocking, resurrection colors

### Phase 3 — Alchemist
- [x] Budget in the game state, conversion moves (`{ type: 'convert', at, into }`)
- [x] UI: conversion buttons for all five types in the player's row, always visible; greyed out without prices until a piece is selected, then priced and lit up where allowed. Blue budget squircle in the player's row; conversion sound. The starting budget is an engine setting (`alchemistBudget`, default 0), not in the game's UI yet
- [x] Tests

### Main menu
- [x] Ruler cards in playing-card proportions (5:7) with placeholder art: King, Necromancer, Alchemist, and a locked "Coming soon" card
- [x] Hovering (or keyboard-focusing) a card previews it: the card grows and glows in its ruler's color, and its name fades into "Start as the ...". Clicking a card starts the game. On phones a tap starts directly, since there's no hover
- [x] The player is white against a plain King for now. Menu button in the game to go back. The name shows "..." while no card is hovered
- [ ] Sound and navigation reachable from every screen (proposal: a corner menu button opening an overlay with Sound, Main menu, Resume; Esc opens it on desktop)
- [ ] Card artwork
- Later: Alchemist starting budget, opponent choice, rounds

### Phase 4 — Bot
Built in steps that are each playable. The bot ([src/bot.js](src/bot.js)) only uses the engine, so it also runs in Node.
- [x] Random bot: plays black (a plain King) and picks any legal move after a short pause. Undo takes back both its reply and your move
- [x] Greedy bot: takes the most valuable capture available (the ruler above all), otherwise a random move
- [x] Search (alpha-beta with iterative deepening, about 0.8s per move) in a Web Worker so the page doesn't freeze. Evaluation: material, plus small bonuses for central knights/bishops and advanced pawns; capturing the ruler is a win (faster wins preferred). Past the search depth it follows captures until quiet, and responds when its ruler is attacked. Reaches depth 4-5 in the middlegame and about 7 in endgames (200-600k positions/s). Equal moves are picked at random so games vary
  - An Alchemist's unspent points count as one pawn each, since they turn back into material one for one. Leaving them at 0 was a real bug found in play: after the player turned their queen into a rook, the bot saw itself 4 points ahead and let its queen be traded for that rook. The weight can be tuned by self-play
- [ ] Teach it the rest of the rulers' potential. Resurrecting and converting are already moves, so the search sees what they do; what it can't see yet is an open grave's threat (a strong enemy piece waiting, a piece tied to the grave). That value starts at 0
- [ ] Difficulty levels (how deep it looks)

**Tuning by self-play, not guessing.** Nobody knows yet what an open grave is worth, or whether one pawn per alchemy point is the right weight. [tools/selfplay.mjs](tools/selfplay.mjs) plays bot-against-bot games and reports win rates, so those values and ruler balance can be measured.

First results (2026-10-31): 100 games per pair, depth 3, Alchemist budget 0. With this sample each count is only good to about ±10.

| Pair (A vs B) | A wins | B wins | Draws | Unfinished | Ability uses per game (A / B) |
|---|---|---|---|---|---|
| King vs King | 32 | 39 | 21 | 8 | 0 / 0 |
| King vs Necromancer | 27 | 53 | 19 | 1 | 0 / 1.3 |
| King vs Alchemist | 13 | 64 | 19 | 4 | 0 / 12.9 |
| Necromancer vs Alchemist | 27 | 56 | 14 | 3 | 0.9 / 12.6 |

- White won 167 of the 311 decided games (54%), so any first-move edge is small.
- The Necromancer beats the King about 2 to 1 with roughly one raise per game, and the bot doesn't even value the grave yet.
- The Alchemist is the strongest ruler already at budget 0, so the earlier idea of giving it a bigger starting budget looks unnecessary.
- How it wins (10 inspected games, 107 conversions): mostly breaking big pieces into small ones. It downgrades a queen or rook to a bishop or knight, then spends the points turning pawns into minor pieces. Only 21 of the conversions were on an attacked piece. This matches the "more pieces beat bigger pieces" tip, but it could partly come from the evaluation's center bonus for minor pieces, or from shallow bots handling many minor pieces badly. Worth checking against a human.

After the grave change (it now holds the last piece the Necromancer captured), same settings and seed. Pairs without a Necromancer came out identical, as they should:

| Pair (A vs B) | A wins | B wins | Draws | Unfinished | Ability uses per game (A / B) |
|---|---|---|---|---|---|
| King vs Necromancer | 14 | 65 | 19 | 2 | 0 / 2.5 |
| Necromancer vs Alchemist | 42 | 38 | 18 | 2 | 2.3 / 11.7 |

- Raises roughly doubled per game, and the Necromancer went from losing 2 to 1 against the Alchemist to about even. With these bots it's now as strong against the King as the Alchemist is.

### Phase 5 — Rounds and armies
- [ ] Multiple rounds against the bot with different rulers
- [ ] Army budgets and different starting setups

### Polish (done so far)
- [x] Published on GitHub Pages: https://broskoy.github.io/Chess/ (serves `main` as static files; every push updates it)
- [x] Turn indicator ("stoplight" beside the board): one marker slides to the side to move, changing from white through gray to black. No glow (a glowing black light looked odd). At game end it stays with the winner; on a draw it parks in the middle in gray
- [x] Sounds (synthesized in the browser, no audio files; on/off toggle remembered in the browser)
- [x] Icon buttons: house (main menu), circular arrow (restart), curved arrow (undo), speaker (sound; a diagonal line through it when muted). Drawn by hand as inline SVG, so there's no icon license to track
- Removed the flip board button (not needed once you always play from your own side). The board can still be drawn with black at the bottom, for playing the bot as black later. Auto-flip each turn was tried earlier and felt disorienting.
- Removed the Rules panel (it changed rules mid-game; the menu picks rulers now). Rule settings aren't saved in the browser anymore, only the sound preference is.
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
- [x] Side bar beside the board, spanning its height, for general controls: home, restart, undo and mute at the top, the turn light in the middle, and 4 empty slots for items at the bottom (symmetric, so the light sits in the middle). Its squircles scale with the board so it always fits beside it
- [x] Copy game button (testing tool, in the first item slot for now): copies the game so far in the PGN-like format of [src/notation.js](src/notation.js) — headers with the rulers and rules, then coordinate moves (`e2e4`, `N@d5` for a resurrection, `d4=B` for a conversion). Paste it to share a position for debugging
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
- [src/bot.js](src/bot.js): the computer opponent (random, greedy, and the search it plays with).
- [src/bot-worker.js](src/bot-worker.js): runs the bot's search in a background thread.
- [src/notation.js](src/notation.js): writing games as text (PGN-like) and replaying them.
- [src/rulers.js](src/rulers.js): each ruler's name, placeholder art and color, shared by the menu and the game.
- [test/engine.test.js](test/engine.test.js): engine tests, including perft (counting positions to a fixed depth, the standard check for move generation).
- [test/bot.test.js](test/bot.test.js), [test/notation.test.js](test/notation.test.js): bot behavior, and writing and replaying games.
- [tools/replay.mjs](tools/replay.mjs): replays a copied game and shows what the bot thinks.
- [tools/selfplay.mjs](tools/selfplay.mjs): plays bot-against-bot games and reports win rates.

### Engine design
- **Game state is one plain object**: board, turn, castling rights, each Necromancer's grave, Alchemist budgets and settings (including each side's ruler). Everything the rules depend on lives there.
- **Pure functions**: `applyMove(state, move)` returns a new state and never changes the old one. Pieces are never mutated, so copies can share them cheaply.
- **Abilities are move types**, so the UI, undo and the bot handle them like any other move:
  - Board move: `{ type: 'move', from, to, castle?, promotion? }`
  - Resurrect: `{ type: 'resurrect', to }` (the grave holds the square and piece)
  - Convert (Alchemist): `{ type: 'convert', at, into }`
- Legal move generation: generate all moves including abilities, then (in standard-rules mode) discard any that leave your own king in check.
- `fromFEN` loads standard FEN positions, mainly for tests.

### Running
- Game: `npm run serve`, then open http://localhost:8000. ES modules don't load from `file://`, so opening index.html directly won't work. The server ([serve.py](serve.py)) disables browser caching so edits show up on a normal reload.
- Tests: `npm test`.
- Bot-against-bot games: `npm run selfplay -- --games 100 --depth 3 --budget 0 --seed 1`. Every ruler pair plays with colors swapped each game; the same seed repeats the same games.
- Replaying a copied game: save it to a file, then `npm run replay -- game.txt [half-moves]`. Shows the position (rulers, grave, points), the move the bot would play and how deep it searched, and every legal move with its score ([tools/replay.mjs](tools/replay.mjs)).
