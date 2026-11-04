# Reference Catalog — all 24 games

This catalog lists every reference for the 24 games, with an accurate label.

| Label | Meaning |
|---|---|
| DIRECT | Implements the same game or its core gameplay. |
| MECHANIC | Implements a useful related mechanic. |
| ENGINE | Physics or technical library. |
| OBSERVATION | Gameplay-only commercial reference. We do not read or copy its code or assets. |
| UNVERIFIED | Needs more verification (for example, we could not read the repository). |

**How we checked.** We cloned public repositories with `git clone --depth 1` on 2026-11-04 and read the files. We did not run code from the clones. The GitHub REST API was blocked in the build environment. For this reason, we read the licence only from the files in each clone (LICENSE, package.json, README). See `RESEARCH_AND_LICENSE_AUDIT.md` for the licence decisions and the limitations.

**Code reuse summary.** This release copies **no code** from any game reference. All game code is original. The only third-party runtime parts are React (MIT), workbox-window (MIT), two fonts (OFL-1.1) and 48 Fluent Emoji pictures (MIT).

---

## Phase 1 — full research records

### 01 Hand Cricket — sbshah97/HandCricket
- URL: https://github.com/sbshah97/HandCricket
- Label: DIRECT
- Accessible: yes (cloned).
- Implements claimed mechanic: yes. `static/js/script.js` (143 lines) has an odd/even toss, user and computer innings, and the "same number = out" rule.
- Licence: MIT (LICENSE file, "Copyright (c) 2016 Salman Shah"). Reuse is allowed with the copyright notice.
- Technology stack: plain HTML, CSS and JavaScript. Image files for the background and the toss.
- Relevant files: `index.html`, `static/js/script.js` (`do_toss`, `get_cpu_inp`, `addUserScore`, `addCpuScore`).
- Gameplay observations: the computer picks with `Math.floor(Math.random() * 6 + 1)`, so the computer is uniform random. There is one wicket. There are no overs, no two-player mode and no hand animation.
- Limitations: random-only computer; no innings limits; no scoreboard history; desktop-first layout.
- Improvements in our version: pattern-learning computer (frequency + first-order Markov model, 3 levels) that commits **before** it sees your number; 1/2/3/5 wickets; overs limit or classic mode; same-device two-player mode with hidden "locked" picks and a pad that turns 180° for the player across the bench; drawn hands (thumb = 6) in school-shirt cuffs; chalkboard scoreboard with this-over balls; results on a school report card.
- Code reused: No. We studied the rules only.
- REA used: no. The source is small and readable.

### 02 Book Cricket — gitanshu-choudhary gist
- URL: https://gist.github.com/gitanshu-choudhary/5c772f26249cabe8eaa549e23a0b0fd5
- Label: MECHANIC (basic logic only)
- Accessible: yes (cloned as a gist repository).
- Implements claimed mechanic: partly. One `index.html` with "Book Size", "Total Wickets", "Player 1", "Player 2" and "New Match". It is a random page generator.
- Licence: none found. Study-only.
- Technology stack: one HTML file with inline script.
- Gameplay observations: random page number; no book visual; no scoring variants.
- Improvements in our version: a believable Bangla-medium maths textbook in a brown-paper cover with a name label; hold-to-riffle and release-to-open; red-pen circle on the last digit; data-driven scoring rule sets (Classic, No-ball, or your own); per-batter scorecard in an exercise-book style; uniform last-digit chance (pages 10–198).
- Code reused: No.
- REA used: no.

### 03 Pakhir Ure — Khaaii1/reaction-time-game
- URL: https://github.com/Khaaii1/reaction-time-game
- Label: MECHANIC (reaction timing, not the same game)
- Accessible: yes (cloned).
- Implements claimed mechanic: yes for reaction timing. `script.js` (311 lines) has the phases idle → armed → go → "too soon" → result. It uses `performance.now()` and keeps best times per difficulty in localStorage.
- Licence: none. The README says "No license has been specified for this project." Study-only.
- Technology stack: plain HTML, CSS and JavaScript.
- Gameplay observations: a false start ("too soon") ends the try. There is a single stimulus and no classification decision.
- Improvements in our version: the real Pakhir Ure decision (fly or not fly); a traditional "finger on the bench, lift to answer" input with a simple tap mode for accessibility; a 120 ms anticipation threshold; a shrinking response window; levels that add tricky items (bat, penguin, peacock, spider) with explanations, then things (kite, aeroplane, CNG); solo survival with three lives; vs computer and two-player modes.
- Code reused: No.
- REA used: no.

### 04 Tug of War — zubairahmed-sketch/Battle_Brains
- URL: https://github.com/zubairahmed-sketch/Battle_Brains
- Label: MECHANIC (rope pulling inside a quiz game)
- Accessible: yes (cloned).
- Implements claimed mechanic: partly. `server/game/GameRoom.js` keeps `ropePosition` from −100 to +100. Each correct quiz answer moves the rope by `pullStrength: 8`. A team wins at `mudThreshold: 100`. `client/src/scenes/TugOfWarScene.js` (Phaser) draws rope segments, a knot and two team containers.
- Licence: MIT is stated in the README and in package.json. We did **not** find a LICENSE file in the clone. Treat it as MIT, but keep the attribution if code is ever reused.
- Technology stack: Phaser client, Node.js server with rooms (Socket-style messages).
- Gameplay observations: the rope moves in fixed steps; there is no velocity or force; the pull depends on the quiz.
- Improvements in our version: no quiz; continuous 1-D physics (surge forces, damping); a rhythm "heave" beat that gets faster; one judged pull per beat; off-beat or double taps make your team slip (anti-spam); a big pull for four good pulls in a row; an accessible simple-tap mode with a rate limit; kids that lean, slide and fall; win when the front puller crosses the centre line.
- Code reused: No.
- REA used: no.

### 05 Balloon Burst — mashukui/web-games (`balloon-pop`)
- URL: https://github.com/mashukui/web-games (folder `balloon-pop`)
- Label: DIRECT
- Accessible: yes (cloned).
- Implements claimed mechanic: yes. `balloon-pop/index.html` (716 lines): a 60-second round, bombs, three lives, a combo, keyboard crosshair.
- Licence: MIT ("Copyright (c) 2026 mashukui").
- Technology stack: one HTML file with Canvas and inline JavaScript.
- Gameplay observations: spawn interval `max(260, 620 − elapsed × 6)` ms; combo gain `10 + min(combo − 1, 9) × 5`; bombs end the run after three hits.
- Improvements in our version: a called target colour (×2); gold, tough (two-hit), family (splits into three), clock (+3 s) and rain-cloud balloons; a miss penalty and a tap rate limit, so random tapping does not pay; a computer opponent with its own pin on the same field; a fair split-screen mode with identical balloons (same seed); a village fair (mela) scene with a Ferris wheel (nagordola) and stalls.
- Code reused: No. We studied the spawn-rate and combo ideas only.
- REA used: no.

### 06 Biscuit Race — liabru/matter-js
- URL: https://github.com/liabru/matter-js and https://brm.io/matter-js/
- Label: ENGINE (no direct Biscuit Race implementation was found)
- Accessible: yes (cloned).
- Licence: MIT.
- Technology stack: JavaScript 2D rigid-body engine.
- Relevant files: `examples/chains.js`, `examples/newtonsCradle.js`, `src/constraint/Constraint.js`.
- Observations: constraints model strings and chains well. A full rigid-body engine is more than one swinging biscuit needs.
- Decision: we use a small deterministic damped pendulum (semi-implicit Euler at 120 Hz) in `src/engine/physics.ts`. It is stable, testable and cheap on low-end phones. Matter.js is planned for Phase 2.
- Improvements in our version: wind gusts; bump impulses; a forgiving but fair bite test (mouth centred within a tolerance); the rule "no passing the frame without the biscuit"; a computer that predicts the swing by forward simulation.
- Code reused: No.
- REA used: no.

---

## Phase 2 — references (games now built)

All 11 Phase 2 games are built. No code from these references was copied. See `RESEARCH_AND_LICENSE_AUDIT.md`, "Phase 2 decision".

| Game | Reference | Label | Licence (from files) | Stack | Notes |
|---|---|---|---|---|---|
| 07 Pen Fight | https://github.com/niketmishra/penfight | DIRECT | None found → study-only | JavaScript, mp3 sounds | Closest gameplay reference. Study flick input and edge-fall detection. |
| 07 Pen Fight | https://github.com/VARUNMUTHALS/pen-fight | DIRECT | None found → study-only | TypeScript (+ XML files) | Second implementation. Compare physics tuning. |
| 07 Pen Fight | Official Pen Fight mobile apps (app stores) | OBSERVATION | Commercial | — | Gameplay feel only. No asset or code reuse. |
| 07, 08, 11, 16, 17, 22 | https://github.com/liabru/matter-js | ENGINE | MIT | JavaScript | Slingshot, constraints, friction, restitution. |
| 07 | https://github.com/shakiba/planck.js | ENGINE | MIT (from project knowledge; not cloned) — UNVERIFIED | JavaScript (Box2D port) | Better for spin and friction on a table. Verify licence before use. |
| 09 Drawing | https://github.com/scribble-rs/scribble.rs | DIRECT | BSD-3-Clause; README says some resources need attribution | Go server + JS | Check each asset licence separately. |
| 09 Drawing | https://github.com/kalotrapezis/classGame | MECHANIC | GPL-3.0 → do not copy code | JavaScript | Ideas only. |
| 10 Elonti Belonti | https://github.com/showman-sharma/red-light-green-light | MECHANIC | MIT | Python, computer vision, mp3 | We use touch/keyboard instead of a camera. No Squid Game visuals. |
| 12 Haari Bhanga | https://store.steampowered.com/app/1300600/Blind_Drive | OBSERVATION | Commercial | — | Audio-only navigation idea. Store page not visited in this run. |
| 12 Haari Bhanga | Web Audio API (MDN: PannerNode, HRTF) | ENGINE | Browser standard | — | Directional sound cues. |
| 13 Paper Airplane | https://github.com/bartbasi/Updraft | MECHANIC | GPL-3.0 → do not copy code | Godot (GDScript) | Study the lift, drag and stall model; write our own. |
| 14 Paper Boat | https://github.com/yuvnaaz/Drift | MECHANIC | None found → study-only | JavaScript + Python | Paper-boat motion and force fields. |
| 14 Paper Boat | https://github.com/QusaiAlbonni/three-sails | MECHANIC | MIT | Three.js, GLB models, shaders | Water and sailing ideas. 3D is heavy for low-end phones. |
| 15 Musical Chairs | https://github.com/rakeshid03/Musical-Chairs-3D | DIRECT | README says MIT, but no LICENSE file → study-only until confirmed | One HTML file | Verify before reuse. |
| 15, 16 | https://store.steampowered.com/app/880940/Pummel_Party/ | OBSERVATION | Commercial | — | Party mini-game pacing. |
| 16 Sack Race | Phaser examples (https://phaser.io/examples) | MECHANIC | MIT (Phaser) | JavaScript | Jump impulse and landing examples. |
| 17 Three-Legged | https://store.steampowered.com/app/2567870/Chained_Together/ | OBSERVATION | Commercial | — | Connected-character idea only. |
| 11, 16, 17 | Matter.js constraints | ENGINE | MIT | JavaScript | Coupled bodies. |

## Phase 3 — references

| Game | Reference | Label | Licence (from files) | Stack | Notes |
|---|---|---|---|---|---|
| 18–21 Cricket | https://github.com/Vimal9RAM-NAP/pixel-cricket | DIRECT | MIT | One HTML file + PNG | Common starting point for the cricket engine. |
| 18–21 Cricket | Real Cricket series — https://www.nautilusmobile.com/ | OBSERVATION | Commercial | — | Batting timing feel, camera. |
| 18–21 Cricket | World Cricket Championship — https://www.nextwavemultimedia.com/ | OBSERVATION | Commercial | — | Shot selection UI, bowling variety. |
| 18–21 Cricket | Don Bradman Cricket, Cricket 26 (Big Ant Studios) | OBSERVATION | Commercial | — | Ball physics feel, timing windows. Observe public gameplay only. |
| 18 Short-Pitch 3D (built) | Real Cricket, Cricket 26 / Don Bradman Cricket control schemes (public forum posts and reviews, see `RESEARCH_AND_LICENSE_AUDIT.md` 4a) | OBSERVATION | Commercial | — | Used for the control pattern only: direction stick + ground / loft / defend, swipe shots, timing feedback. No code, models or art. REA not used (not authorised). |
| 18 Short-Pitch 3D (built) | three.js r186 | ENGINE (used) | MIT | JavaScript | The 3D renderer. |
| 18 Short-Pitch | para cricket rules (general knowledge) | — | — | — | Round field; four along the ground; **six = OUT**. |
| 22 Pillow Fight | https://store.steampowered.com/app/285900/Gang_Beasts/ | OBSERVATION | Commercial | — | Wobbly balance feel. |
| 22 Pillow Fight | Matter.js | ENGINE | MIT | JavaScript | Controlled ragdoll-like balance. |
| 23 Kabaddi | https://github.com/assishmoncs/battlebox | MECHANIC (multiplayer architecture only) | MIT | JavaScript | Not a Kabaddi game. A closer open-source Kabaddi game was not found in this run → search again at the start of Phase 3. |
| 24 Badminton | https://github.com/mahjerion/Capsule-Badminton | MECHANIC | UNVERIFIED (the clone did not finish; the user reports MIT) | Unity (C#) | Verify licence and files before study. |
| All 3D | Three.js (https://threejs.org) | ENGINE | MIT | JavaScript | Used by Short-Pitch Cricket 3D. Other games stay 2D for low-end phones. |
| All 2D | Phaser (https://phaser.io) | ENGINE | MIT | JavaScript | Alternative to our canvas host. See `ARCHITECTURE.md`. |

## References that we must research again

- Book cricket scoring conventions: the presets in the game are common school conventions from general knowledge. We did not confirm them with written sources in this run.
- Planck.js licence (not cloned).
- Capsule-Badminton (clone did not finish).
- All Steam and app-store pages (not visited; OBSERVATION only).
- A real open-source Kabaddi game (none found yet).
