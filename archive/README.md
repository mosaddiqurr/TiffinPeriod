# Archived games

These games were taken off the website on 7 November 2026 at the owner's request. The code is kept here so it can come back. Nothing in `archive/` is built, tested or deployed.

**Archived built games** (folders in `archive/games/`):
- Tug of War (`tug-of-war`)
- Biscuit Race (`biscuit-race`)
- Spoon & Marble Race (`spoon-marble`)
- Haari Bhanga (`haari-bhanga`)
- Musical Chairs (`musical-chairs`)
- Sack Race (`sack-race`)
- Three-Legged Race (`three-legged`)
- Short-Pitch Cricket 3D (`short-pitch`)
- Jor-Bejor (`jor-bejor`)
- Bagh Bandi (`bagh-bandi`)
- Five Stones (`five-stones`)
- Eraser Flip (`eraser-flip`)

**Coming-soon entries removed from the list:**
- Tape Tennis Cricket
- Rooftop Cricket
- Goli Cricket
- Pillow Fight
- Kabaddi / Ha-du-du
- Rooftop Badminton

They were only planned, so there was no code for them.

**Other files here:**
- `registry-before-archive.ts.txt` is the game list (`src/platform/registry.ts`) as it was before the archive. It has every entry with its number, colour, titles and loader.
- `tests/` and `e2e/` are the test files as they were. `short-pitch.test.ts` and `phase3.spec.ts` were only about archived games. The others are full copies; the live copies in `tests/` and `e2e/` had the archived games' parts removed.
- The archived games' achievements were removed from `src/platform/scores.ts`. They are still in git history, in the commit before the archive.

**To bring a game back:**
1. Move its folder back to `src/games/<id>`.
2. Copy its entry back into `src/platform/registry.ts` from `registry-before-archive.ts.txt`.
3. Restore its tests and achievements from the copies here, or from git history.
4. Run `npm run build` and `npm test`.

The card drawings (`src/components/Doodles.tsx`) and shared helpers they used (`src/shared/raceKit.ts`, `scenery.ts` and so on) were left in place.
