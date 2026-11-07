# Development Progress

Last update: 2026-11-07.

## Phase 4: national teams and new desk games (done, 7 November 2026)

- Seven new games: Number Cricket, Flikk Football, Penalty Shootout, Five Stones, Dots and Boxes, Hangman, Eraser Flip.
- Hand Cricket and Book Cricket: national teams, Quick Match (bat first, chase or toss), Target Challenge (12 levels with stars), Tournament (groups, semi-finals, final, super over), Daily Challenge (shared daily seed, best score, streak, share text). The ball rules did not change.
- Paper Airplane: a folding animation, a third fold (Hawk), and Distance / Accuracy / Obstacles challenges.
- Shared parts: `src/shared/teams.ts`, `tournament.ts`, `cricketModes.ts`, `daily.ts`, `src/components/sport/`, and the online contract in `src/platform/online.ts`.
- Details, rules and limits: `docs/PHASE4_SPORTS_AND_DESK_GAMES.md`. Nothing was committed or pushed.

## Class-bench additions (done)

Chor Police, Naam Desh Ful Fol, Jor-Bejor and Bagh Bandi are implemented and reachable from the hub in Bangla and English. The platform now has 22 playable games and six planned entries. Details, references, house rules and test coverage: [BENCH_GAMES.md](BENCH_GAMES.md).

## Phase 1 checklist (done)

| Step | Item | Status |
|---|---|---|
| A | Research of Phase 1 references and licences | Done |
| A | 24-game roadmap and the seven documents | Done |
| B | Shared platform: hub, routing, language, settings, records, achievements, audio, canvas engine | Done |
| C–H | Hand Cricket, Book Cricket, Pakhir Ure, Tug of War, Balloon Burst, Biscuit Race | **Done** |
| I | Integration and testing | Done |

## Phase 2 checklist (done)

| Step | Item | Status |
|---|---|---|
| 1 | `GameShell` (setup sheet, pads, keys, pause, results, records) | Done |
| 2 | `RaceScene` base (lanes, countdown, cameras, progress bar, standings) | Done |
| 3 | Matter.js (MIT) for rigid bodies; music loop; HRTF spatial sound | Done |
| 4 | 07 Pen Fight | **Done** |
| 5 | 08 Rubber Band Shooting | **Done** |
| 6 | 09 Notebook Drawing Battle | **Done** |
| 7 | 10 Elonti Belonti | **Done** |
| 8 | 11 Spoon & Marble Race | **Done** |
| 9 | 12 Haari Bhanga | **Done** |
| 10 | 13 Paper Airplane Racing | **Done** |
| 11 | 14 Paper Boat Racing | **Done** |
| 12 | 15 Musical Chairs | **Done** |
| 13 | 16 Sack Race | **Done** |
| 14 | 17 Three-Legged Race | **Done** |
| 15 | Card doodles, 22 achievements, portrait cameras, rotate hint | Done |
| 16 | Tests: 96 unit tests, 18 + 13 browser tests | Done |

## Phase 3 checklist (in progress)

The owner set the scope on 2026-11-04: **one** cricket game only, in 3D, a short-pitch game; no other Phase 3 game yet.

| Step | Item | Status |
|---|---|---|
| 1 | Remove the 2D street-cricket prototype (4 venues) and its tests | Done |
| 2 | Controls research (observation only; REA not used on commercial games) | Done |
| 3 | three.js 0.186.1 (MIT) | Done |
| 4 | Pure simulation `sim.ts` (deliveries, timing, shots, fielding, running, para rules) | **Done** |
| 5 | 3D world: field, para houses, trees, scoreboard, faceless players with helmets and caps | **Done** |
| 6 | Match controller, cameras, input, mini-map | **Done** |
| 7 | React screen: setup, HUD, stick, shot buttons, swipe, bowling chips, tap-to-aim, pause, report card | **Done** |
| 8 | 18 Short-Pitch Cricket 3D registered as playable; achievement "Para Batter" | **Done** |
| 9 | Tests: 20 unit tests (116 in total), 5 browser tests | Done |
| 10 | 19 Tape Tennis, 20 Rooftop, 21 Goli Cricket, 22 Pillow Fight, 23 Ha-du-du, 24 Rooftop Badminton | **Not started (on hold by the owner)** |

### Short-Pitch Cricket 3D status

| vs computer | 2 players | Touch | Keyboard | Pause | Result card | Achievements |
|---|---|---|---|---|---|---|
| ✓ (3 levels: bowler accuracy, batter timing, catching, running margin) | ✓ (one device, sides take turns) | stick + buttons, swipe, tap the pitch | arrows, J K L, Space, R, 1–5 | ✓ (also when the tab is hidden) | ✓ | 1 |

Tuning with simulations:
- At first, the computer batters almost never ran: the fielders gathered and threw faster than a run. The gather wait (0.5 s), the throw speed (19 m/s) and the run time (1.3 s) now match children's cricket, and a far throw can miss the stumps. Singles went from 7 % to about 30 % of the balls.
- At first, a clean loft never reached the rope, so "six is out" never happened. A clean loft now carries to the rope; six-outs are 1–4 % of the balls.
- The camera behind the bowler was too close: the bowler blocked the batter. It is now a long lens from about 33 m, as on TV.

## Per-game status (Phase 2)

| Game | vs computer | 2 players | Solo | Touch | Keyboard | Pause | Result card | Achievements |
|---|---|---|---|---|---|---|---|---|
| Pen Fight | ✓ (simulates 75 flicks) | ✓ (turns) | — | drag | ← → ↑ ↓, Space | ✓ | ✓ | 2 |
| Rubber Band Shooting | ✓ | ✓ (turns) | ✓ | drag | — (touch or mouse) | ✓ | ✓ | 2 |
| Notebook Drawing Battle | computer draws | party 2–4 | — | ✓ | mouse | ✓ | ✓ | 2 |
| Elonti Belonti | ✓ | ✓ | — | hold | Space / A, L | ✓ | ✓ | 2 |
| Spoon & Marble | ✓ | ✓ | — | hold | Space / A, L | ✓ | ✓ | 2 |
| Haari Bhanga | ✓ (turns) | ✓ (turns) | ✓ | ✓ | arrows, Space | ✓ | ✓ | 2 |
| Paper Airplane | ✓ (turns) | ✓ (turns) | ✓ | drag + hold | ← →, Space | ✓ | ✓ | 2 |
| Paper Boat | ✓ | ✓ | — | ✓ | A D, ← → | ✓ | ✓ | 2 |
| Musical Chairs | ✓ | ✓ | — | ✓ | Space / A, L | ✓ (music stops) | ✓ | 2 |
| Sack Race | ✓ | ✓ | — | ✓ | Space / A, L | ✓ | ✓ | 2 |
| Three-Legged Race | ✓ | ✓ (co-op) | — | ✓ | A D or ← →; co-op A, L | ✓ | ✓ | 2 |

## Tuning done with simulations

The physics and computer opponents were tuned with headless simulations (Vitest). These are the results that changed the design:

- **Pen Fight:** the table friction was too high, so a perfect shot could not push a pen off. It is now lower (frictionAir 0.03), and the maximum flick speed is higher.
- **Rubber Band:** heavy targets could not be moved, and the computer's path check was too coarse. The densities are now lower, a knocked-over cup or chalk counts, and the path check runs on every physics step.
- **Paper Airplane:** the next roofs were taller than the launch roof, and the glider flew past the course. The roofs are now lower, there is more drag, and there is a finish point.
- **Paper Boat:** at first, an idle boat finished as fast as a steering one. Now obstacles favour the fast middle, bumps cost speed, the boat slides round obstacles, and the computer scores 11 lanes. Over 12 courses, the hard computer finishes 11, the easy computer 10, and an idle boat 6.
- **Elonti Belonti:** the computer's "brave" chance is now decided once per chant (it was rolled 120 times per second).

## Commits (local repository; nothing was pushed)

1. Build platform shell and six Phase 1 games.
2. Add unit and browser tests; safe pointer capture.
3. Layout fixes, project documents, README and notices.
4. Build the eleven Phase 2 games on a shared game shell.
5. Portrait cameras, rotate hint, Phase 2 documents.
6. Phase 3: shared street-cricket engine and four venues (2D prototype; removed in commit 7 at the owner's request).
7. Add 3D Short-Pitch Cricket (Three.js); remove the 2D street-cricket venues.
8. Short-Pitch 3D documents and polish.

## Known gaps and not-verified items

- Real-device testing (Android, iOS) is not done. See `TEST_PLAN.md`, section 4.
- Short-Pitch Cricket 3D needs WebGL. It shows a message if WebGL is missing. Its frame rate and two-thumb play were not checked on real devices.
- Spatial sound (Haari Bhanga) and the music loop (Musical Chairs) were not checked by ear.
- Notebook Drawing Battle has no online play; party mode is pass-and-play on one device.
- Rubber Band Shooting and Pen Fight are best in landscape. In portrait they show a hint.
- The computer cannot guess player drawings (that needs image recognition, which is out of scope at $0 and offline).
- "Tiffin Period" is a working title.

## Recommended next steps for Phase 3

1. Test Short-Pitch Cricket 3D on real phones and tablets (frame rate, two-thumb play, timing feel). Tune the timing windows and the camera if needed.
2. Optional extras for Short-Pitch: a replay of fours and wickets, a commentary line, named batters, tournaments.
3. When the owner allows more games: 19 Tape Tennis, 20 Rooftop and 21 Goli Cricket can reuse `sim.ts` with new rule options (off the roof = out, wall runs) and new 3D scenery.
3. Then 24 Rooftop Badminton (it reuses the glider and wind ideas from Paper Airplane) and 22 Pillow Fight (it reuses the Matter.js setup from Pen Fight).
4. Kabaddi last: it needs team AI. Search again for an open-source Kabaddi reference first.
