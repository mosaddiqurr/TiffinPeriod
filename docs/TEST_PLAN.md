# Test Plan and Results

## 1. Automated unit tests (Vitest)

Command: `npm test`

| File | What it checks |
|---|---|
| `tests/cricket-and-hand.test.ts` | overs text, run rate, no-ball legality, innings end (wickets, balls, target), result (runs, wickets, tie), Hand Cricket out/run rule, innings switch, early chase win, overs limit, tie, odd/even toss, AI range 1–6, hard AI learns a fixed batter (> 60 % match), easy AI stays random (12–22 %), AI `choose()` takes only history |
| `tests/book-cricket.test.ts` | even pages in range, uniform last digit (each 20 % ± 1.5 % over 50,000 opens), Classic and No-ball rules, scorecard, chase win, unplayable custom rules, expected runs per ball (13/5), 200 simulated matches all finish |
| `tests/pakhir-ure.test.ts` | unique ids, both languages, a picture for every item, notes for tricky items, balance of flyers, "finger down" wait, correct lift and correct hold, < 120 ms false start, lift-before-call false start, solo game over after 3 lives, versus ends after N calls with the computer playing, response window floor |
| `tests/tug-balloon-biscuit.test.ts` | beat judging, rate limiter, one-sided pulling wins in < 20 s, equal teams stay central, double tap on one beat = slip, mashing loses, assist rate limit, hard AI beats easy AI (≥ 14 of 20), time limit ends a round, identical balloons for the same seed, pop/combo/miss penalty, two-hit tough balloon, rain cloud penalty, 10 taps/s limit, combo multipliers, AI scores on a shared field, pendulum energy never grows, biscuit reachable, no passing the frame without the biscuit, the computer finishes on easy/medium/hard (≥ 5 of 6 seeds each) |
| `tests/platform.test.ts` | Bangla digits, template filling, UI text tables have equal keys and no empty text, 24 games numbered 1–24, only the 6 Phase 1 games are playable and have loaders, achievements belong to playable games, router, local records (best, wins, streaks, lower-is-better, minimum records), seeded random repeatability |

**Result on 2026-11-04: 5 files, 65 tests, all passed.**

## 2. Automated browser tests (Playwright)

Command: `npm run build && npm run test:e2e`. The tests run against `vite preview` (the production build) on two profiles: **mobile** (390 × 844, touch) and **desktop** (1280 × 800).

| Test | What it does |
|---|---|
| hub | 6 playable cards, 18 "coming soon" items, language toggle, roadmap with 24 rows, no horizontal scroll, no console errors |
| Hand Cricket | plays a full match against the computer (toss, both innings) until the result card |
| Book Cricket | holds and releases the book until the match ends |
| Pakhir Ure | solo tap mode; no input; the game ends after three mistakes |
| Tug of War | pause and resume; the hard computer wins a one-round match (result shows "হার") |
| Balloon Burst | taps on the canvas; the 30-second round ends ("সময় শেষ") |
| Biscuit Race | touch controls run and jump; the computer catches its biscuit and wins |
| persistence | a saved best score shows on the hub after a reload and on the records page; the mute setting persists |
| English | every game opens and starts in English with no console errors |

**Result on 2026-11-04: 18 tests (9 × 2 profiles), all passed, 2.7 minutes.**

## 3. Acceptance checklist (Phase 1)

| Requirement | Status | Evidence |
|---|---|---|
| All six games load | Pass | browser tests |
| All six are playable to a win/lose/tie state | Pass | browser tests + unit tests |
| Correct scoring and rules | Pass | unit tests |
| Computer opponents behave correctly | Pass | unit tests (learning, difficulty order, finishing) |
| Same-device two-player mode | Pass (logic, layout screenshots); see limits | screenshots, manual |
| Mobile touch input | Pass (emulated touch) | mobile profile |
| Keyboard input | Pass | browser tests (Space, keys) |
| Restart resets the full state | Pass (manual) | each game rebuilds its model on restart |
| Pause where relevant | Pass | Tug of War test; canvas games also pause when the tab is hidden |
| Bangla and English text | Pass | both languages in tests |
| Audio can be muted | Pass | persistence test |
| Navigation | Pass | browser tests |
| Local scores persist after refresh | Pass | persistence test |
| No major console errors | Pass | every browser test checks this |
| No missing assets | Pass | Pakhir Ure picture test; build precaches 57 files |
| No paid services | Pass | no network calls after load; no API keys |
| Mobile-size performance | Partly verified | 390 px emulation is smooth in headless Chromium; see limits |

## 4. Limits of this testing (not claimed as passed)

1. **No real phones.** All tests ran in headless Chromium with touch emulation. Real low-end Android phones, iOS Safari, real multi-touch with two fingers on two pads, and frame rate on old devices are **not verified**.
2. **Audio and speech.** Sound synthesis runs, but no test listens to it. Spoken announcements depend on the device voices. A Bangla voice is often missing; then the game speaks English or nothing.
3. **Vibration** works only on devices that support `navigator.vibrate` (not iOS Safari).
4. **PWA install and offline mode** were built (service worker generated) but not tested in a browser install flow.
5. **Two-player modes** were checked by screenshots and logic tests, not by two humans.
6. **Game balance** (difficulty tuning) comes from simulations and short manual play. It needs feedback from real players.

## 5. Manual test checklist for real devices

1. Open the site on an ordinary Android phone in Chrome. Add it to the home screen. Open it offline.
2. For each game: play one full match in each mode. Test pause, restart and "back to all games".
3. Pakhir Ure and Tug of War with two people: two fingers on two pads at the same time.
4. Turn the phone sideways in Tug of War, Balloon Burst (2 players) and Biscuit Race.
5. Switch the language during a game; open the help; check the Bangla line breaks.
6. Mute and unmute. Set the volume. Turn the voice on.
7. Turn on "Reduce motion". Check that the effects are calmer.
