# Four more games from the class bench

Implemented 7 November 2026 in the latest `final cloud tiffin-period-shortpitch3d/tiffin-period` checkout. There are now 28 entries: 22 playable games and six planned games. Existing game numbers and routes stay stable; the new games are 25–28.

## Research and regional variants

These are household games, with regional differences. The implementation states its exact rules in both languages before play. Research informed the mechanics; all new code, instructions and card art are original. The animal SVGs reuse the project's existing MIT-licensed Microsoft Fluent Emoji assets.

- [The Financial Express: Childhood games of millennial kids](https://today.thefinancialexpress.com.bd/lifestyle/childhood-games-of-millennial-kids-1722350242?amp=true) describes Bangladeshi Chor Police using Chor, Dakat, Police and Babu chits, and Naam Desh Ful Fol using one selected letter and four categories.
- [Dhaka Mail: হারিয়ে যাওয়া কয়েকটি ঘরোয়া খেলা](https://alpha.dhakamail.com/sports/953) gives additional local background on the folded-paper game and Babu's 1000-point role.
- [Bagh bandi rules and bibliography](https://en.wikipedia.org/wiki/Bagh_bandi) describes the Bengal game with two tigers, twenty goats, four starting stacks, the alquerque board and capture of only one goat from a stack. This differs from Nepal's four-tiger Bagh-chal. Sources disagree about multiple captures, so this implementation uses one optional capture per turn.
- [Odds and Evens rules](https://handgames.app/en/blog/odds-and-evens-rules/) documents the 0–5 finger-sum game. This is the finger version selected for Jor-Bejor; this reference does not establish one universal Bangladeshi rule set.

## Chor Police — `#/play/chor-police`

Four roles are shuffled without replacement each round. In local play, four players read and hide their own chit with a handoff screen between them. Babu and Police become public; the two suspects remain hidden until Police commits a guess. In computer mode, the human sees only their own chit and any public roles. Computer police selects between the hidden suspects without consulting their roles.

House scoring: Babu gets 1000, Dakat gets 500. If Police identifies Chor, Police gets 100 and Chor gets 0; otherwise Police gets 0 and Chor gets 100. Choose 3, 5 or 10 rounds. Highest total wins; equal highest scores share the win. These values are displayed rather than presented as universal regional rules.

## Naam Desh Ful Fol — `#/play/naam-desh`

Choose solo practice or two players, 3/5/10 rounds, and 30/60/90 seconds per turn. A Bangla letter is chosen without repeats from twelve letters that have examples in every category. Fill name, country, flower and fruit. Listed Roman spellings are accepted as alternatives to Bangla typing.

The local adaptation gives each player the same letter and an equal separate timer, with the first page hidden before the second player begins. There is no network multiplayer or simultaneous entry on separate devices.

The small offline reference list automatically ticks known answers. Unfamiliar answers beginning with the correct letter require honest human review. The review screen allows valid answers to be accepted and any answer to be rejected. Blank or wrong-initial answers cannot score. An accepted unique answer scores 10; matching accepted answers score 5 each. Listed aliases in Bangla and Roman script count as the same word. Results show each category's awarded points before totals are committed. This is not an exhaustive dictionary or an AI judge.

The timer uses elapsed time and stops during pause or tab hiding. Timeout closes the page once. Typing P in a field does not invoke the platform's pause shortcut.

## Jor-Bejor — `#/play/jor-bejor`

Player 1 picks even (Jor) or odd (Bejor) for the match; the other player gets the opposite parity. Both choose 0–5 fingers. The sum decides the point, including 0+0=0 as even. First to 3/5/7 points wins.

The computer's random hand is set before the human makes a choice. Local play clears and hides Player 1's selection, then hands the device to Player 2. Both hands are revealed together after the second choice is locked.

## Bagh Bandi — `#/play/bagh-bandi`

The 5×5 board uses horizontal, vertical, and alternating diagonal connections. Tigers start at C2 and C4. Five goats start at each of B1, D1, B3 and D3. Goats go first. Move one piece to an adjacent empty point along a drawn line; moving a stack removes only its top goat. Goats cannot capture or create stacks.

A tiger may make one optional short jump over an adjacent goat to the empty point directly beyond, along connected lines. Capture removes one goat, even if the jumped point contains a stack. Both tigers immobilized means goats win.

For a finite digital match, a clearly labelled house rule awards tigers the win at 10 captures in a short match or 18 in a long match. Goats with no legal move also lose. Three occurrences of the same position and side to move, 100 plies without a capture, or 300 total plies is a draw. Capture targets are a product choice, not a claim about a universal traditional winning threshold.

Computer difficulty searches 1/2/3 plies using alpha-beta pruning. The human may play either side. Local Player 1 plays goats and Player 2 plays tigers. Green points show legal destinations. Take-back cancels the pending computer move or restores both moves after the computer has replied. Concede ends the match honestly.

## Integration and validation

Each game loads lazily in the existing game error boundary. `bench-kit` shares layout, private handoff, local result recording, pause, replay and the existing report card. The hub includes original doodles, correct player-count labels and updated 28-game roadmap copy. No new packages, APIs or paid services were added.

`tests/bench-games.test.ts` checks deals, all 72 hand/call combinations, word normalization and aliases, category scoring, all board links, stack movement, optional captures, wins/draws, legal computer decisions and full-game piece conservation.

`e2e/bench-games.spec.ts` runs production-build browser checks on desktop and touch-phone profiles: both languages, all play modes, private handoffs, pause/resume, timeout, no horizontal overflow, persistent results, replay, AI replies, take-back and a full Bagh Bandi game to a natural result. Playwright uses its installed Chromium by default, with `PW_CHROMIUM` available for an explicit browser binary.

Final verification: the production build and 139 unit tests pass. All 24 new-game browser cases pass. The existing-game scan and focused confirmations cover all 60 non-skipped cases across runs; 14 established profile-specific skips remain. The old timed canvas checks now use a controlled clock, and software WebGL is limited to the 3D test file. Final phone and desktop screenshots were inspected.
