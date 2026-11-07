# Master Game Roadmap — Tiffin Period (টিফিন পিরিয়ড)

"Tiffin Period" is the working title of the platform. You can change it in one place: `src/platform/strings.ts` (`brand`).

The platform has **28 confirmed games and modes** in three phases: **22 playable** and six planned.

- **Phase 1** (done): 6 games. They are built, tested and playable.
- **Phase 2** (done): 11 games. They are built, tested and playable.
- **Phase 3** (in progress): 11 games. **Five are playable:** Short-Pitch Cricket 3D and the four class-bench additions below. Six are researched and planned; the hub shows those as "Coming soon" (শীঘ্রই).

## Additional class-bench games (PLAYABLE, 7 November 2026)

| No. | Game | Bangla | Modes | Core mechanic |
|---|---|---|---|---|
| 25 | Chor Police | চোর-পুলিশ | vs computer, 4 friends | Private role chits, police accusation, round scoring |
| 26 | Naam Desh Ful Fol | নাম দেশ ফুল ফল | solo, 2 players | Random Bangla letter, four timed categories, reviewed answers |
| 27 | Jor-Bejor | জোড়-বিজোড় | vs computer, 2 players | Locked 0–5 finger picks, sum parity, first to target |
| 28 | Bagh Bandi | বাঘবন্দী | vs computer, 2 players | Two tigers against twenty stacked goats on the Bengal board |

See [implemented rules, research and house-rule choices](BENCH_GAMES.md). Existing game numbers remain unchanged.

The owner changed the Phase 3 scope on 2026-11-04: build **one** cricket game only, a 3D short-pitch game, and do not build the other Phase 3 games yet. The 2D street-cricket prototype (four venues on one engine) was removed before release.

## Phase 4 — national teams and new desk games (PLAYABLE, 7 November 2026)

| No. | Game | Status |
|---|---|---|
| 29 | Number Cricket | PLAYABLE |
| 30 | Flikk Football (one game for Paper Football and Flikk Football) | PLAYABLE |
| 31 | Penalty Shootout | PLAYABLE |
| 32 | Five Stones (পাঁচ গুটি) | PLAYABLE |
| 33 | Dots and Boxes (ঘর কাটা) | PLAYABLE |
| 34 | Hangman | PLAYABLE |
| 35 | Eraser Flip | PLAYABLE |

Upgrades: Hand Cricket and Book Cricket (national teams and four modes), Paper Airplane (folds, Distance/Accuracy/Obstacles). Next: online play behind `src/platform/online.ts` (random 1v1, invite links, friend challenges, leaderboards).

## Status legend

| Status | Meaning |
|---|---|
| PLAYABLE | Built, tested, reachable from the hub. |
| PLANNED | Rules and references are documented. There is no code. |

## Phase 1 — easy games (PLAYABLE)

| No. | Game | Bangla | Where | Modes | Core mechanic | Tech |
|---|---|---|---|---|---|---|
| 01 | Hand Cricket | হ্যান্ড ক্রিকেট | Class bench | vs computer, 2 players | Simultaneous hidden pick 1–6; same number = OUT | React DOM + SVG hands |
| 02 | Book Cricket | বই ক্রিকেট | Class bench | vs computer, 2 players | Riffle a textbook; last digit of the left page decides the ball | React DOM + CSS 3D page riffle |
| 03 | Pakhir Ure | পাখি উড়ে | Class bench | solo, vs computer, 2 players | Keep finger down; lift only for things that fly; reaction time scoring | React DOM + timing engine |
| 04 | Tug of War | দড়ি টানাটানি | Sports day | vs computer, 2 players | Rhythm pulls on the chant beat; slips for off-beat taps | Canvas 2D + 1-D rope physics |
| 05 | Balloon Burst | বেলুন ফাটানো | Sports day / mela | solo, vs computer, 2 players (split screen) | Aimed pops, target colour, combos, avoid the rain cloud | Canvas 2D + seeded spawner |
| 06 | Biscuit Race | বিস্কুট দৌড় | Sports day | vs computer, 2 players | Swinging biscuit (damped pendulum + wind), timed jump, mouth bite | Canvas 2D + pendulum physics |

## Phase 2 — medium games (PLAYABLE)

| No. | Game | Bangla | Where | Modes | Core mechanic (as built) | Tech |
|---|---|---|---|---|---|---|
| 07 | Pen Fight | কলম যুদ্ধ | Class bench | vs computer, 2 players | Pull back and flick your pen; an off-centre flick spins it; push the other pen off the bench; first to 3 or 5 points | Matter.js rigid bodies; the computer simulates 75 candidate flicks |
| 08 | Rubber Band Shooting | রাবার ব্যান্ড শুটিং | Class bench | solo, vs computer, 2 players | Stretch and release; knock cups, chalk, books, a pencil box and a swinging paper bird off the desks; ceiling fan wind in level 3 | Matter.js bodies and constraints |
| 09 | Notebook Drawing Battle | খাতায় আঁকাআঁকি | Class bench | party (2–4, pass the phone), computer draws | Secret word, 60-second drawing on a khata page, tap the friend who guessed; or guess the computer's doodle | Canvas strokes, SVG path sampling |
| 10 | Elonti Belonti | এলন্টি বেলন্টি | Para | vs computer, 2 players | Walk while the caller chants (speed changes, trick pauses); stop before "tin!"; moving when watched = back to the start | Race base + caller state machine |
| 11 | Spoon & Marble Race | চামচ-মার্বেল দৌড় | Sports day | vs computer, 2 players | One button: your speed changes move the marble; bumps grow with speed; a drop costs time | Race base + spring-damper marble model |
| 12 | Haari Bhanga | হাঁড়িভাঙা | Sports day / fair | solo, vs computer, 2 players | Blindfolded and spun; find the pot by HRTF sound and friends' shouts (one may lie); three swings | Web Audio PannerNode (HRTF), top view |
| 13 | Paper Airplane Racing | কাগজের উড়োজাহাজ | Rooftop | solo, vs computer, 2 players | Throw from the roof; lift, drag, stall; thermals over hot roofs; rings, wires, water tanks, kites; three throws, best counts | Custom glider model (no GPL code) |
| 14 | Paper Boat Racing | কাগজের নৌকা | Monsoon street | vs computer, 2 players | Steer in a meandering current; bricks, sandals, leaves, drain whirlpools; soak meter; first under the bamboo bridge wins | Flow field + circle collisions |
| 15 | Musical Chairs | মিউজিক্যাল চেয়ার | Sports day | vs computer, 2 players | Harmonium tune; press SIT when it stops; fake dips; early press = trip; one chair fewer each round | Lookahead-scheduled Web Audio music |
| 16 | Sack Race | বস্তা দৌড় | Sports day | vs computer, 2 players | Tap to hop; best just after landing; too soon or in the air = wobble; too much = fall | Race base + hop model |
| 17 | Three-Legged Race | তিন পায়ে দৌড় | Sports day | vs computer, 2 players (co-op) | Alternate the outer and the tied legs at a steady pace; in co-op, one player per leg | Race base + step model |

## Original Phase 3 — hard games (1 PLAYABLE, 6 PLANNED)

| No. | Game | Bangla | Where | Planned core mechanic | Planned tech | Reuses |
|---|---|---|---|---|---|---|
| 18 | **Short-Pitch Cricket 3D — PLAYABLE** | শর্ট-পিচ ক্রিকেট ৩ডি | Para | Round field. Four along the ground; **over the rope on the full is OUT**. Standing bowler (no run-up), 5 delivery types, a direction stick + Hit / Loft / Block, swipe shots, running between the wickets. vs computer (3 levels) and 2 players on one device. | Three.js 3D (low-poly, no image files), pure TypeScript simulation | `src/shared/cricket.ts` scoring |
| 19 | Tape Tennis Cricket | টেপ-টেনিস ক্রিকেট | Street | Fast, bouncy taped ball; swing | Shared cricket engine | same |
| 20 | Rooftop Cricket | ছাদ ক্রিকেট | Rooftop | Roof edges, water tanks; ball off the roof = OUT (option) | Shared cricket engine + boundary rules | same, plus Paper Airplane rooftop scenery |
| 21 | Goli Cricket | গলি ক্রিকেট | Alley | Narrow alley, wall rebounds, brick stumps | Shared cricket engine + wall colliders | same |
| 22 | Pillow Fight | বালিশ যুদ্ধ | Sports day / home | Knock the other player off a bamboo beam | Matter.js constraints, controlled balance | Matter.js setup from Pen Fight |
| 23 | Kabaddi / Ha-du-du | হা-ডু-ডু | Village / para | Raider tags defenders on one breath and returns | Canvas 2D top view, team AI | GameShell, top-view kids from Musical Chairs |
| 24 | Rooftop Badminton | ছাদে ব্যাডমিন্টন | Rooftop | Shuttle with high drag; clears, drops, smashes; wind | 2D side view, quadratic drag model | glider and wind code ideas from Paper Airplane |

## Shared systems

1. **Phase 1 (done):** hub, registry, routing, language, settings, local records, achievements, audio, canvas host, fixed-step loop, particles, pendulum physics, beat and reaction timing, kid character, sports-day scenery, cricket scoring.
2. **Phase 2 (done):** `GameShell` (setup, pads, keys, pause, results, records for any canvas game), `RaceScene` (lanes, countdown, cameras, standings), Matter.js integration, music loop, HRTF spatial sound, portrait cameras, the "turn your phone" hint.
3. **Phase 3 (so far):** a pure 3D cricket simulation (`src/games/short-pitch/sim.ts`: delivery paths, timing, shot launch, fielders, running, catches, run outs, the circular boundary) and a Three.js view (`world.ts`, `game.ts`). Tape Tennis, Rooftop and Goli Cricket can later reuse the simulation with new rule options and new scenery.
4. **Later (optional):** a tournament and house-points system for sports-day games; online multiplayer behind an interface (see `ARCHITECTURE.md`).

## Release path

1. Website (static files, any free host, for example GitHub Pages or Cloudflare Pages free tier).
2. Installable PWA (already in this build: manifest, icons, offline service worker).
3. Android app: wrap the same build with Capacitor (MIT, free). See `ARCHITECTURE.md`.
4. iOS app: the same Capacitor project, only if there is demand. An Apple developer account costs money, so this step is outside the $0 budget.
