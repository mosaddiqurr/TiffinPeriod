# Phase 4: national teams, the football pair and new desk games (7 November 2026)

This phase adds seven games, upgrades Hand Cricket and Book Cricket with four modes each, and gives Paper Airplane folding and challenges. Everything runs offline, at $0, with no new dependencies.

## 1. What was added

| No. | Game | Modes | Where |
|---|---|---|---|
| 29 | Number Cricket (নম্বর ক্রিকেট) | Quick Match, Target Challenge, Tournament, Daily Challenge, with a friend | `src/games/number-cricket/` |
| 30 | Flikk Football (ফ্লিক ফুটবল) | Quick Match, Comeback Challenges, Desk World Cup, with a friend | `src/games/flikk-football/` |
| 31 | Penalty Shootout (পেনাল্টি শুটআউট) | Quick Shootout, Challenges, Shootout Cup, with a friend | `src/games/penalty/` |
| 32 | Five Stones (পাঁচ গুটি) | solo, vs computer, two players | `src/games/five-stones/` |
| 33 | Dots and Boxes (ঘর কাটা) | vs computer (3 levels), two players; 3×3 to 6×6 boxes | `src/games/dots-boxes/` |
| 34 | Hangman (হ্যাংম্যান) | solo (5 words), two players (set words for each other); Bangla or English words | `src/games/hangman/` |
| 35 | Eraser Flip (রাবার টোকা) | 8 challenges, duel vs computer, duel with a friend | `src/games/eraser-flip/` |
| 01 | Hand Cricket (upgraded) | Quick Match, Target Challenge, Tournament, Daily Challenge, with a friend | `src/games/hand-cricket/` |
| 02 | Book Cricket (upgraded) | the same five | `src/games/book-cricket/` |
| 13 | Paper Airplane (upgraded) | Distance, Accuracy, Obstacles; a third fold (Hawk); a folding animation | `src/games/paper-plane/` |

Paper Football and Flikk Football are one game here (Flikk Football), as the owner asked.

## 2. Rules in short

**Number Cricket.** Both players secretly write a number on a chit; both open together. Same number: OUT. Different: the batter scores the batter's number. Variant "0–6 with the zero rule": if the batter writes 0 and the bowler does not, the batter steals the bowler's number, so bowling a 6 is a risk. Variant "1–10 big numbers": faster scoring. Target Challenge and Daily Challenge always use 0–6 so the ladder is fair.

**Hand Cricket and Book Cricket.** The ball-by-ball rules did not change (1–6 fingers; the last digit of the left page). The odd/even toss stays in Hand Cricket; Book Cricket and Number Cricket use a coin toss.

**Flikk Football** has two styles, chosen on its menu (the choice is remembered):

- **Fixed players (default).** Like table football: every player stays pinned to a spot on the whole pitch, in the team's formation, and only the ball moves. The side with the ball presses anywhere, pulls back and lets go to flick the ball itself from the player who has it; a hooked pull curls it. Wherever the ball stops, the nearest player (keepers too) gets it: one of yours is a pass and you flick again, one of theirs is their ball. The aim guide runs the real physics on a copy, so it shows exactly where the ball goes and who gets it (green ring: yours, red: theirs). Each flick is a step of the clock (30, 45 or 64 flicks a match). Rules: `src/games/flikk-football/fixed.ts`. This is the style to put online first: a turn is one `{ angle, power, spin }`.
- **Roaming players.** Eleven pieces a side on a desk pitch in a chosen formation (4-4-2, 4-3-3, 3-5-2, 4-2-3-1, 5-3-2) and mentality (defend deep, balanced, push up). Teams take turns. Press on a piece, pull back and let go: the dotted guide shows where the piece meets the ball and where the ball will go. A hooked drag curls the shot. If your flick moves the ball and it stops nearest to one of your pieces, that is a completed pass and you flick again (up to three flicks a turn). Goalkeepers slide along their lines by themselves. Once a half you may Regroup instead of flicking. The clock moves one step per turn; half time and goals reset the shapes. Knockout draws go to golden goal (six more turns), then penalty flicks (three each, then sudden death).

**Penalty Shootout.** Shooting: touch the goal to place the target (drag to move it), let go, and tap to stop the power bar. Green power is clean; red power is fierce but can go over. Corners are hardest to save. Keeping: watch the run-up and tap where to dive. A sharp kicker may see an early dive and go the other way. Five each, then sudden death. With a friend, the keeper hides a dive choice before each kick.

**Five Stones.** Toss one stone, scoop stones from the floor while it is in the air, and catch it inside the green window. Stage 1 one at a time, Stage 2 two, Stage 3 three then one, Stage 4 all four. Stage 5 (back of the hand): toss all five, catch on the back of the hand, toss again and catch in the palm; keep at least two. A mistake passes the turn (solo: three chances).

**Dots and Boxes.** Draw one line at a time. Closing a box claims it (your initial goes in) and you draw again. Most boxes wins. Players take turns to start.

**Hangman.** Guess letters; wrong letters add chalk lines to the drawing. The figure's head is a plain circle, with no face. In Bangla, a vowel sign counts as its vowel (কি needs ক and ই) and joined letters need each letter. A hint shows a letter and costs a chance. Easy 10, medium 8, hard 6 wrong guesses.

**Eraser Flip.** Pull back from your eraser and let go: it flies, flips over and slides. The outline shows where it first lands. Duel: land on top of the other eraser to win the round; fall off the desk and you lose it; first to three. Challenges: three flicks a level for points and stars (notebook landing, bullseye, flip it upside down, over the ruler, edge of the desk, cover the coin, between the pencils, top the teacher's eraser). A rare landing on its edge earns a bonus.

**Paper Airplane.** Distance is the original game. Accuracy puts a chalk target on one roof: a soft landing near the centre scores most. Obstacles fill the sky with wires, kites and rings; reaching the end gives +200. The Hawk fold is floaty and lands easily.

## 3. Modes and progression (cricket)

All three bench cricket games share `src/components/sport/CricketHub.tsx`:

- **Quick Match:** pick two countries (flags and strength stars), the computer level (or "by team"), overs, wickets, and Toss / Bat first / Bowl first then chase.
- **Target Challenge:** 12 levels per game, from "12 from 12 balls" to last-ball finishes. Stars: win · a quarter of the balls left · no wicket lost. A level opens when the previous one has a star.
- **Tournament:** 8 countries, two groups of four (round robin, net run rate), semi-finals and a final. The player plays up to five matches; other matches are simulated from team strength. A tied knockout goes to a one-over super over. The cup is saved and can be resumed. Winning shows a championship celebration.
- **Daily Challenge:** one chase per day from the date seed, the same for everyone. Score = runs, plus a bonus for a win with balls and wickets to spare. Best score, tries and a day streak are kept; "Share my score" copies a text line.
- **Chase display:** "Need R from B balls", target, required and current run rate, wickets left as stumps, a ball tracker, and a pressure bar that glows and pulses as the chase gets tight. "LAST BALL!" flashes on the last ball.

Countries: 17 cricket nations and 22 football nations (`src/shared/teams.ts`). Flags are drawn in code as small SVGs; there are no crests, logos or real player names. Book Cricket's scorecard uses invented names.

## 4. Architecture

```
src/shared/teams.ts        nations, strengths, kit colours, flags (SVG strings), invented names
src/shared/tournament.ts   groups + knockouts, standings, simulators (cricket and football), save/load
src/shared/cricketModes.ts target ladders, stars, daily chase, difficulty by team strength
src/shared/daily.ts        date seed, daily best and streak, share text
src/platform/online.ts     the contract for later online play (no network code yet)
src/components/sport/      SportKit (flags, team picker, match-up, cup board, chase display, coin toss,
                           championship) and CricketHub (the five cricket modes)
```

Each game keeps the rule of separation: pure rules and physics (`model.ts`, `physics.ts`, `match.ts`, `logic.ts`) with no DOM, a canvas `scene.ts` where needed, and a React screen. Flikk Football, Eraser Flip and Penalty Shootout physics run at a fixed 1/120 s step and are deterministic.

### Ready for online play later

- Every rule module is `state → move → state` with plain data, so a server or a peer can replay moves (`TurnRules` in `src/platform/online.ts`).
- Secret picks (Hand Cricket, Number Cricket, the keeper's dive) can use commit-then-reveal (`commit()` hashes a pick with a salt).
- Random things use seeds (book pages, daily challenges, tournament draws, AI); two devices given one seed get the same sequence.
- Physics games only need to send the flick (piece, angle, power, spin).
- Lobby kinds are already named: random 1v1, invite link, friend challenge. Daily scores already use a shared seed, ready for a leaderboard.
- A free transport (WebRTC data channel with a free signalling service, or a free-tier websocket) can be added behind `Transport` without changing the games.

## 5. Computer opponents

| Game | How it plays |
|---|---|
| Hand Cricket | unchanged: frequency + Markov prediction of your habits; commits before you pick |
| Number Cricket | the same learning, with expected-value choices that understand the zero rule |
| Flikk Football | simulates up to ~50 candidate flicks (shots at three goal spots, passes forward, clearances) in a copy of the world, scores where the ball ends; skill adds aim error |
| Penalty Shootout | the keeper reads the kick more often on higher levels and learns your favourite side; the kicker shows an honest or fake lean in the run-up |
| Five Stones | success chance per toss by level, with real scoop and catch animations |
| Dots and Boxes | easy: mostly random; medium: takes boxes, avoids third sides, gives away the smallest chain; hard: also solves the endgame exactly (negamax with memo), so it plays chain sacrifices and double-crosses |
| Eraser Flip | simulates angles and powers, prefers landing on top, avoids the edge |

## 6. Research notes (Last Bench references)

The reference pages (lastbench.games: Flikk Football, Dekk Cricket, School Games) are marketing and rule pages. They describe: swipe passing with a hooked swipe for curl, a timed match, an adaptive keeper and a five-round cup (Flikk); 30-ball, 3-wicket chases, a five-round cup and pass-the-phone play (Dekk). No code, art or text was copied. This project uses its own turn-based flick model with an aim guide, its own visuals, and its own tournament with groups.

## 7. Known limits

- The Bangla word lists and new Bangla strings should be read by a native speaker.
- Real phones and tablets were not tested; tests ran in Chromium with a phone profile (390 × 844, touch) and a desktop profile.
- Online play is designed for but not built.
- Flikk Football is turn-based (reliable controls were preferred over real-time physics).
