# টিফিন পিরিয়ড — Tiffin Period

Bangladeshi childhood games from the class bench, the school sports day and the para rooftop. It runs as a website and as an installable app (PWA). There is no account, no ads and no server.

**Phase 1 is playable:** Hand Cricket, Book Cricket, Pakhir Ure, Tug of War, Balloon Burst and Biscuit Race. Phases 2 and 3 (18 more games) are planned. They are shown as "Coming soon" and are not playable. See `docs/MASTER_GAME_ROADMAP.md`.

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

- Unit tests (Vitest): 65 tests for the rules, physics, AI and platform logic.
- Browser tests (Playwright): 9 flows × 2 screen profiles (phone and desktop). Each game is played to a real result.
- Results and limits: `docs/TEST_PLAN.md`.

## Project structure

```
src/platform   registry of 24 games, routes, Bangla/English text, settings, records, audio
src/engine     fixed-step loop, canvas host, physics, timing, particles, random numbers
src/shared     cricket scoring, school kid character, sports-day scenery
src/components hub pages, game frame, report card, shared UI, doodles
src/games      one folder per game (screen + pure logic + AI + styles)
tests, e2e     unit and browser tests
docs           roadmap, references, licence audit, architecture, rules, progress, test plan
```

To add a game, see `docs/ARCHITECTURE.md`, section 4.

## Controls (short)

| Game | Touch | Keyboard |
|---|---|---|
| Hand Cricket | number pads | P1 `1`–`6`, P2 `U I O J K L` |
| Book Cricket | hold the book or the button | hold `Space` |
| Pakhir Ure | hold the pad, lift to answer | hold `Space`/`A` (P2 `L`) |
| Tug of War | tap the pad on the beat | P1 `A`/`Space`, P2 `L`/`Enter` |
| Balloon Burst | tap balloons | arrows + `Space` |
| Biscuit Race | ◀ ▶ and Jump | P1 `A` `D` `W`, P2 arrows |

`Esc` or `P` pauses a game.

## Settings

Language (বাংলা / English), sound, volume, spoken announcements, vibration, reduce motion, simple tapping mode and player names. Everything is saved on the device.

## Licences and credits

- The game code, the drawings and the sounds are original to this project. The owner chooses the project licence; `package.json` says `UNLICENSED` until then.
- Third-party parts: see `THIRD_PARTY_NOTICES.md` and `docs/RESEARCH_AND_LICENSE_AUDIT.md`.

## Cost

$0. It uses only free and open-source tools. There are no paid APIs, no cloud resources and no billing.
