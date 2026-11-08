# Test Plan and Results

## Mobile and deployed-site QA — 8 November 2026

See [the full mobile QA report](MOBILE_QA_2026-11-08.md) for the 17-game matrix, 102 touch flows across three phone profiles and both languages, real backend checks for all 13 online games, offline checks, four reproduced defects and verified repairs. The release candidate passed a fresh production build, 193 logic tests and 13 focused mobile regressions. Physical Android and iOS testing remains outstanding. `PW_BASE_URL` now selects a deployed target for the existing Playwright suite; omit it to use the local production preview.

The Dots and Boxes regression now uses actual browser touch events at 360 × 800 as well as desktop mouse input. It checks a short wiggle, horizontal and vertical drags, and an ordinary tap after dragging. The last check reproduced a missed compatibility click on the first deployed candidate; touch taps now play from pointer-up while suppressing duplicate compatibility clicks.

## Phase 4 — 7 November 2026

- Unit tests: 181 pass (`npm test`), including 29 new ones in `tests/phase4.test.ts` (teams and flags, tournaments, ladders, daily seed, Number Cricket rules and computer, Dots and Boxes levels, Bangla Hangman, Flikk physics and computer (both styles, and the fixed-style guide matching real play), shootout rules, Five Stones, Eraser Flip landings and every challenge, plane challenges).
- Browser tests: the whole suite (`npm run build && npx playwright test`) gave 84 passed, 14 skipped, 0 failed on the phone and desktop profiles. `e2e/phase4.spec.ts` plays every new game and mode to a result. The old Hand and Book Cricket flows were updated for the new mode menu.
- The team-choice redesign (match poster and nation tiles) was checked by screenshots on phone and desktop, in English and Bangla, after the suite ran.
- Not tested: real phones and tablets, sound by ear, native-speaker review of the new Bangla text.

## Class-bench additions — 7 November 2026

- Production build and type checking pass.
- Unit suite: **139 tests across nine files pass**, including `tests/bench-games.test.ts`.
- Browser result: **all 24 new-game cases pass**, with no browser errors. Across the full regression scan and focused confirmation runs, all **60 non-skipped cases** passed; 14 existing profile-specific cases are intentionally skipped.
- The broad scan initially hit a service-worker load error during a concurrent preview rebuild and timed-game test failures. Holding the build stable resolved the service-worker check. Balloon Burst and Haari Bhanga now advance a controlled browser clock; software WebGL is scoped to `phase3.spec.ts` instead of slowing every 2D canvas. The affected tests and 3D smoke checks passed on rerun.
- New production-browser coverage in `e2e/bench-games.spec.ts` runs every new game's modes on mobile (390×844, touch) and desktop (1280×800), including both languages, complete matches, privacy, persistent results, pause, timeout, duplicate scoring and natural Bagh Bandi end conditions.
- UI screenshots: `node scripts/capture-bench.mjs` while a preview server runs on port 4173. Outputs go to ignored `test-results/bench-visuals/`.
- Final desktop/phone screenshots were inspected. Setup rules fold away so controls fit the phone viewport; solo score strips use the full width.
- Hub expectations are now 22 playable cards, six planned cards and 28 roadmap rows. Playwright uses its installed Chromium by default on Windows/Linux/macOS; `PW_CHROMIUM` overrides it.

See [rules, limitations and research sources](BENCH_GAMES.md). Older dated results below are retained as historical records.

## 1. Automated unit tests (Vitest)

Command: `npm test`

| File | What it checks |
|---|---|
| `tests/cricket-and-hand.test.ts` | overs text, run rate, no-ball legality, innings end (wickets, balls, target), result (runs, wickets, tie), Hand Cricket out/run rule, innings switch, early chase win, overs limit, tie, odd/even toss, AI range 1–6, hard AI learns a fixed batter (> 60 % match), easy AI stays random (12–22 %), AI `choose()` takes only history |
| `tests/book-cricket.test.ts` | even pages in range, uniform last digit (each 20 % ± 1.5 % over 50,000 opens), Classic and No-ball rules, scorecard, chase win, unplayable custom rules, expected runs per ball (13/5), 200 simulated matches all finish |
| `tests/pakhir-ure.test.ts` | unique ids, both languages, a picture for every item, notes for tricky items, balance of flyers, "finger down" wait, correct lift and correct hold, < 120 ms false start, lift-before-call false start, solo game over after 3 lives, versus ends after N calls with the computer playing, response window floor |
| `tests/tug-balloon-biscuit.test.ts` | beat judging, rate limiter, one-sided pulling wins in < 20 s, equal teams stay central, double tap on one beat = slip, mashing loses, assist rate limit, hard AI beats easy AI (≥ 14 of 20), time limit ends a round, identical balloons for the same seed, pop/combo/miss penalty, two-hit tough balloon, rain cloud penalty, 10 taps/s limit, combo multipliers, AI scores on a shared field, pendulum energy never grows, biscuit reachable, no passing the frame without the biscuit, the computer finishes on easy/medium/hard (≥ 5 of 6 seeds each) |
| `tests/platform.test.ts` | Bangla digits, template filling, UI text tables have equal keys and no empty text, 28 games numbered 1–28, playable loaders and modes, achievements belong to playable games, router, local records (best, wins, streaks, lower-is-better, minimum records), seeded random repeatability |

| `tests/phase2-a.test.ts` | Pen Fight: a still world stays still, a strong flick can push the other pen off, an off-centre flick spins, a pen off the bench is out, the computer finishes planning; Sack Race: perfect hop after landing, air taps wobble, wobble causes a fall, the computer finishes; Three-Legged: alternation, same-foot and together stumbles, the computer pair finishes; Spoon & Marble: speeding up rolls the marble back, braking rolls it forward, a drop stops the runner, the computer finishes (easy and hard); Elonti Belonti: nine-word chant, the caller turns, a moving walker is caught, a hard computer walker is rarely caught; Musical Chairs: foul during music, one kid left standing; Haari Bhanga: pot far from the start, hit and miss, honest shouts point the right way, the computer breaks the pot in ≥ 6 of 8 |
| `tests/phase2-b.test.ts` | Rubber Band: the arc, the fan pushes bands down, the computer scores on every level, a weak pull does not shoot; Paper Airplane: a good throw flies farther, holding the nose up stalls, the score formula, the computer pilot; Paper Boat: the current is fastest in the middle, steering boats finish (≥ 7 of 8) while idle boats often sink, a soaked boat sinks; Notebook Drawing word and doodle data; every Phase 2 game has achievements |

| `tests/short-pitch.test.ts` | 3D Short-Pitch Cricket simulation: a full straight ball hits the stumps and the timing points are in order; a good-length ball bounces before the bat; a ball far outside off stump is a wide; off spin turns to leg and leg spin to off; fast arrives before slow; timing grades (perfect, good, early, late, edge, miss) and the easy scale; the stick sends the ball straight / off / leg; early pulls and late pushes; loft goes up and Hit stays low; over the rope on the full = six-out; hard along the ground = four; greedy running gives run outs; lofted shots are caught and dropped; runs change ends; a held ball becomes dead; the boundary radius; computer against computer on 3 levels (1,500 balls each: runs per ball, balls per wicket, fours, six-outs and wides in realistic ranges) |

**Result on 2026-11-04 (after Phase 2): 7 files, 96 tests, all passed.**

**Result on 2026-11-04 (after Short-Pitch 3D): 8 files, 116 tests, all passed.**

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

**Result on 2026-11-04: 18 tests (9 × 2 profiles), all passed, 2.2 minutes** (the hub test now expects 17 playable cards and 7 "coming soon" items).

### Phase 2 browser tests (`e2e/phase2.spec.ts`)

| Test | Profile | What it does |
|---|---|---|
| phone smoke | mobile | opens and starts all 11 Phase 2 games; no console errors |
| Pen Fight | desktop | keyboard flicks (hold Space) until a player reaches 3 points |
| Rubber Band | desktop | mouse drags from the hand; 15 shots over 3 levels; result card |
| Notebook Drawing (computer) | desktop | answers 8 rounds of computer doodles |
| Notebook Drawing (party) | desktop | 2 players: show words, pick, draw a real stroke, tap the guesser, next |
| Elonti Belonti, Spoon & Marble, Sack Race, Three-Legged, Paper Boat, Musical Chairs | desktop | the hard computer plays; the player waits; a result appears |
| Haari Bhanga | desktop | start, three swings, result |
| Paper Airplane | desktop | throws and nose-up presses until three throws are done |

**Result on 2026-11-04: 13 tests passed (12 desktop full plays + 1 phone smoke), 5.4 minutes.** The Paper Airplane test first failed: its fixed number of key presses could end before the third throw when flights were long. A simulation of 300 random flights showed that every flight ends (the longest took 15 s), so the game was correct. The test now keeps pressing until the result appears, and it passes.

### Phase 3 browser tests (`e2e/phase3.spec.ts`)

The headless browser draws WebGL in software (SwiftShader flags in `playwright.config.ts`).

| Test | Profile | What it does |
|---|---|---|
| field and HUD | mobile + desktop | starts a match; the 3D canvas, the score, the stick and the shot buttons show; one ball goes by; pause and resume |
| bowling | mobile + desktop | the computer bats first; choose leg spin; tap the pitch moves the target; Bowl starts the delivery |
| full match | desktop | a 1-over, 2-wicket match at 3× speed with an in-page driver (shots and bowling) until the report card |

**Result on 2026-11-04: Phase 1 + Phase 3 browser tests: 23 passed, 1 skipped (the full match runs on desktop only), 3.4 minutes.** The hub test now expects 18 playable cards and 6 "coming soon" items.

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
7. **Phase 2 sound:** the HRTF direction in Haari Bhanga and the harmonium loop in Musical Chairs were not checked by ear. Haari Bhanga also gives visual shouts, so it is playable without sound.
8. **Phase 2 two-player modes** (Pen Fight turns, the Three-Legged co-op, the Notebook Drawing party) were tested by scripts, not by real groups of children.
9. **Short-Pitch Cricket 3D** was rendered only by the software WebGL renderer in headless Chromium (phone portrait 390 × 844, phone landscape 844 × 390, tablet 1024 × 768, desktop 1280 × 800). The frame rate on real phones and tablets, real two-thumb play (the stick and a shot button at the same time) and the feel of the timing windows are **not verified on real devices**.

## 5. Manual test checklist for real devices

1. Open the site on an ordinary Android phone in Chrome. Add it to the home screen. Open it offline.
2. For each game: play one full match in each mode. Test pause, restart and "back to all games".
3. Pakhir Ure and Tug of War with two people: two fingers on two pads at the same time.
4. Turn the phone sideways in Tug of War, Balloon Burst (2 players) and Biscuit Race.
5. Switch the language during a game; open the help; check the Bangla line breaks.
6. Mute and unmute. Set the volume. Turn the voice on.
7. Turn on "Reduce motion". Check that the effects are calmer.
8. Short-Pitch Cricket 3D on a mid-range Android phone and on a tablet: check the frame rate, hold the stick with the left thumb and tap Hit with the right thumb, try a swipe shot, bowl each delivery type, and run a 2 and a run out. Check portrait and landscape.
