# টিফিন পিরিয়ড — Tiffin Period

Bangladeshi childhood games from the class bench, the school sports day and the para rooftop. It runs as a website and as an installable app (PWA). There is no account, no ads and no server.

**29 games are playable (Phase 1, Phase 2, five Phase 3 games and the seven Phase 4 games):**
- **Phase 1:** Hand Cricket, Book Cricket, Pakhir Ure, Tug of War, Balloon Burst, Biscuit Race.
- **Phase 2:** Pen Fight, Rubber Band Shooting, Notebook Drawing Battle, Elonti Belonti, Spoon & Marble Race, Haari Bhanga, Paper Airplane, Paper Boat, Musical Chairs, Sack Race, Three-Legged Race.

- **Phase 3:** Short-Pitch Cricket 3D, Chor Police, Naam Desh Ful Fol, Jor-Bejor and Bagh Bandi.
- **Phase 4:** Number Cricket, Flikk Football, Penalty Shootout, Five Stones (পাঁচ গুটি), Dots and Boxes (ঘর কাটা), Hangman and Eraser Flip. Hand Cricket and Book Cricket now have national teams, Quick Match, Target Challenge, Tournament and a Daily Challenge; Paper Airplane has folds and Distance, Accuracy and Obstacle challenges. See [the Phase 4 notes](docs/PHASE4_SPORTS_AND_DESK_GAMES.md).

The four new class-bench games follow the existing Bangla/English notebook UI, have touch and keyboard-accessible controls, pause/resume, replay, and local results. Chor Police supports one player with three computer players or four friends passing the device. Naam Desh supports solo practice and two-player turns with the same letter and equal timers. Jor-Bejor and Bagh Bandi support a computer opponent or two local players. See [rules, regional variants and research sources](docs/BENCH_GAMES.md).

The other 6 Phase 3 games (Tape Tennis Cricket, Rooftop Cricket, Goli Cricket, Pillow Fight, Ha-du-du and Rooftop Badminton) are planned. They are shown as "Coming soon" and are not playable. See `docs/MASTER_GAME_ROADMAP.md`.

## Requirements

- Node.js 22 or newer and npm (free).
- For browser tests only: Chromium for Playwright (`npx playwright install chromium`), or a local Chrome/Chromium set with `PW_CHROMIUM=/path/to/chrome`.

## Install and run

```bash
npm install
```

```bash
npm run dev
```

Open the address that Vite shows (normally http://localhost:5173). To use a phone on the same Wi-Fi network, run `npx vite --host` and open the network address on the phone.

## Build and preview the production version

```bash
npm run build
```

```bash
npm run preview
```

The `dist/` folder is a static site. You can host it free on any static host. It uses relative paths and hash routes, so it works from a sub-folder too.

## Tests

```bash
npm test
```

```bash
npm run build && npm run test:e2e
```

- Unit tests (Vitest): 168 tests for the rules, physics, computer opponents, tournaments and platform logic.
- Browser tests (Playwright): Phase 1 has 9 flows × 2 screen profiles (phone and desktop). Phase 2 has 12 full plays on desktop and 1 phone smoke test. Each full play reaches a real result.
- The four new bench games have 12 additional flows × 2 screen profiles, including full matches, both languages, private handoffs, timers, AI and local play.
- Phase 4 adds 12 flows × 2 screen profiles (`e2e/phase4.spec.ts`): ladders, a tournament match, the daily challenge, a real drag in Flikk Football, full shootouts, Five Stones, Dots and Boxes, Bangla Hangman, Eraser Flip and the plane's accuracy challenge.
- Results and limits: `docs/TEST_PLAN.md`.

## Project structure

```
src/platform   registry of 35 games, routes, Bangla/English text, settings, records, audio, online contract
src/engine     fixed-step loop, canvas host, physics, timing, particles, random numbers
src/shared     cricket scoring, national teams and flags, tournaments, daily seeds, school kid, scenery
src/components hub pages, game frame, report card, shared UI, doodles, sport kit and cricket hub
src/games      one folder per game (screen + pure logic + AI + styles)
tests, e2e     unit and browser tests
docs           roadmap, references, licence audit, architecture, rules, progress, test plan
```

To add a game, see `docs/ARCHITECTURE.md`, section 4.

## Controls (short)

| Game | Touch | Keyboard |
|---|---|---|
| Hand Cricket | number pads | P1 `1`–`6`, P2 `U I O J K L` |
| Number Cricket | number pads | number keys (`0` = 10 in big numbers); P2 `Y U I O H J K` |
| Flikk Football | press a piece, pull back, let go; hook the pull to curl | `Tab` piece, arrows aim and power, `Space` flick, `R` regroup |
| Penalty Shootout | touch the goal to aim, tap to stop the power bar; as keeper tap where to dive | arrows aim, `Space` shoot; keeper `Q E A D` or arrows |
| Five Stones | tap to toss, tap stones to scoop, tap to catch | `Space` toss/catch, `P` scoop |
| Dots and Boxes | tap between two dots | mouse |
| Hangman | letter keys on screen | type letters (English) |
| Eraser Flip | press the eraser, pull back, let go | arrows aim and power, `Space` flick |
| Book Cricket | hold the book or the button | hold `Space` |
| Pakhir Ure | hold the pad, lift to answer | hold `Space`/`A` (P2 `L`) |
| Tug of War | tap the pad on the beat | P1 `A`/`Space`, P2 `L`/`Enter` |
| Balloon Burst | tap balloons | arrows + `Space` |
| Biscuit Race | ◀ ▶ and Jump | P1 `A` `D` `W`, P2 arrows |
| Pen Fight | touch your pen, pull back, let go | ← → aim, ↑ ↓ grab point, hold `Space` |
| Rubber Band Shooting | pull back from the hand, let go | mouse drag |
| Notebook Drawing Battle | draw with a finger; tap buttons | mouse |
| Elonti Belonti, Spoon & Marble | hold WALK / RUN | hold `Space` (P2 `L`) |
| Haari Bhanga | ◀ ▶ ▲ and HIT | arrows, `Space` |
| Paper Airplane | pull back to throw; hold ▲ for nose up | ← → angle, hold `Space` |
| Paper Boat | hold ◀ or ▶ | P1 `A` `D`, P2 ← → |
| Musical Chairs | SIT! | `Space` (P2 `L`) |
| Sack Race | HOP | `Space` (P2 `L`) |
| Three-Legged Race | Outer and Tied | `A` and `D` (co-op: `A` and `L`) |
| Short-Pitch Cricket 3D | bat: hold the stick for the direction, then Hit / Loft / Block; or swipe on the field; Run. Bowl: type chips, tap the pitch, Bowl | bat: arrows (direction), `K`/`Space` hit, `L` loft, `J` block, `R` run. Bowl: `1`–`5` type, arrows move the spot, `Space` bowl |
| Chor Police | private chit reveal, hide, choose a suspect | Tab / Enter |
| Naam Desh Ful Fol | fill the four labelled fields; submit; review answers | type Bangla or listed Roman spellings; Enter submits |
| Jor-Bejor | choose 0–5, lock, pass or reveal | `0`–`5`, Enter (or Tab / Enter) |
| Bagh Bandi | choose a piece, then a green destination | Tab / Enter |

`Esc` or `P` pauses a game.

## Settings

Language (বাংলা / English), sound, volume, spoken announcements, vibration, reduce motion, simple tapping mode and player names. Everything is saved on the device.

## Licences and credits

- The game code, the drawings, the music and the sounds are original to this project. The animal pictures in Pakhir Ure are Microsoft Fluent Emoji (MIT). Pen Fight and Rubber Band Shooting use Matter.js (MIT). The owner chooses the project licence; `package.json` says `UNLICENSED` until then.
- Third-party parts: see `THIRD_PARTY_NOTICES.md` and `docs/RESEARCH_AND_LICENSE_AUDIT.md`.

## Cost

$0. It uses only free and open-source tools. There are no paid APIs, no cloud resources and no billing.
