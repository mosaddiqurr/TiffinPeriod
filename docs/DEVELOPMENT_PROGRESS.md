# Development Progress

Last update: 2026-11-04.

## Phase 1 checklist

| Step | Item | Status |
|---|---|---|
| A | Research of Phase 1 references and licences | Done (licences for all 24 games' cloned references; deep study for Phase 1) |
| A | 24-game roadmap and the seven documents | Done |
| B | Shared platform: hub, routing, language, settings, records, achievements, audio, canvas engine | Done |
| C | Hand Cricket | **Done** |
| D | Book Cricket | **Done** |
| E | Pakhir Ure | **Done** |
| F | Tug of War | **Done** |
| G | Balloon Burst | **Done** |
| H | Biscuit Race | **Done** |
| I | Integration and testing (65 unit tests, 18 browser tests) | Done |

## Per-game status

| Game | vs computer | 2 players | Solo | Touch | Keyboard | Pause | Result card | Records | Achievements |
|---|---|---|---|---|---|---|---|---|---|
| Hand Cricket | ✓ (3 levels, learning AI) | ✓ (hidden picks) | — | ✓ | ✓ | ✓ | ✓ | best innings, wins | 2 |
| Book Cricket | ✓ | ✓ | — | ✓ | ✓ (Space) | ✓ | ✓ | best total, wins | 2 |
| Pakhir Ure | ✓ (3 levels) | ✓ | ✓ (3 lives) | ✓ | ✓ | ✓ | ✓ | best score, fastest | 2 |
| Tug of War | ✓ (3 levels) | ✓ | — | ✓ | ✓ | ✓ | ✓ | perfect pulls, wins | 2 |
| Balloon Burst | ✓ (shared field) | ✓ (split screen) | ✓ | ✓ | ✓ (crosshair) | ✓ | ✓ | best score, combo | 2 |
| Biscuit Race | ✓ (3 levels) | ✓ | — | ✓ | ✓ | ✓ | ✓ | best time, wins | 2 |

## Commits (local repository; nothing was pushed)

1. Build platform shell and six Phase 1 games.
2. Add unit and browser tests; safe pointer capture.
3. Layout fixes, documents, README.

## Known gaps and not-verified items

- Real-device testing (Android, iOS) is not done. See `TEST_PLAN.md`, section 4.
- Book Cricket scoring presets need written sources (they are school conventions from general knowledge).
- Crow (কাক) is not in Pakhir Ure, because the free picture set has no crow. An original crow drawing can be added later.
- The Bangla voice for announcements depends on the device.
- "Tiffin Period" is a working title.
- No online multiplayer (by design for Phase 1).

## Recommended start for Phase 2

1. Start with **07 Pen Fight**. It is the most iconic classroom game, and it creates the rigid-body physics module (Matter.js, MIT) and the flick input helper. 08 Rubber Band Shooting, 11 Spoon & Marble and 22 Pillow Fight will reuse both.
2. Next, **16 Sack Race** and **17 Three-Legged Race**. They reuse the kid character, the race lanes from Biscuit Race and the beat timing from Tug of War.
3. Then **15 Musical Chairs** and **10 Elonti Belonti**. They reuse the audio manager and the timing helpers.
4. Before Pen Fight: confirm the licence state of both Pen Fight repositories (both have no licence today, so they are study-only), and play the official apps for feel (observation only).
