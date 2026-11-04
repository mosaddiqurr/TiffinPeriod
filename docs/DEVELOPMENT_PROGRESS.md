# Development Progress

Last update: 2026-11-04.

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

## Known gaps and not-verified items

- Real-device testing (Android, iOS) is not done. See `TEST_PLAN.md`, section 4.
- Spatial sound (Haari Bhanga) and the music loop (Musical Chairs) were not checked by ear.
- Notebook Drawing Battle has no online play; party mode is pass-and-play on one device.
- Rubber Band Shooting and Pen Fight are best in landscape. In portrait they show a hint.
- The computer cannot guess player drawings (that needs image recognition, which is out of scope at $0 and offline).
- "Tiffin Period" is a working title.

## Recommended start for Phase 3

1. Build the **shared cricket engine** first (batting timing, ball physics with bounce and swing, configurable boundaries and rules). Then add 18 Short-Pitch Cricket (six = OUT) as its first rule set.
2. Then 20 Rooftop Cricket and 21 Goli Cricket. They reuse the rooftop scenery from Paper Airplane and add wall colliders.
3. Then 24 Rooftop Badminton (it reuses the glider and wind ideas from Paper Airplane) and 22 Pillow Fight (it reuses the Matter.js setup from Pen Fight).
4. Kabaddi last: it needs team AI. Search again for an open-source Kabaddi reference first.
