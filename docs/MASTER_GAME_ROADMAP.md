# Master Game Roadmap — Tiffin Period (টিফিন পিরিয়ড)

"Tiffin Period" is the working title of the platform. You can change it in one place: `src/platform/strings.ts` (`brand`).

The platform has **24 confirmed games and modes** in three phases.

- **Phase 1** (this release): 6 games. They are built, tested and playable.
- **Phase 2** and **Phase 3**: 18 games. They are researched and planned. They are **not** playable. The hub shows them as "Coming soon" (শীঘ্রই).

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

## Phase 2 — medium games (PLANNED)

| No. | Game | Bangla | Where | Planned core mechanic | Planned tech | Reuses |
|---|---|---|---|---|---|---|
| 07 | Pen Fight | কলম যুদ্ধ | Class bench | Swipe-to-flick a pen; push the other pen off the bench | Matter.js or Planck.js rigid bodies | input/flick helper, physics helper |
| 08 | Rubber Band Shooting | রাবার ব্যান্ড শুটিং | Class bench | Pull back, release, projectile to targets | Matter.js (slingshot pattern) | flick helper, particles |
| 09 | Notebook Drawing Battle | খাতায় আঁকাআঁকি | Class bench | One draws on a khata page, others guess | Canvas strokes; local pass-and-play first, online later | multiplayer interface |
| 10 | Elonti Belonti | এলন্টি বেলন্টি | Para | Move while the caller sings "Elonti Belonti, ghori baje ting ting, 1 2 3!", freeze when the caller turns | Canvas 2D; input-hold movement; no camera | timing helpers |
| 11 | Spoon & Marble Race | চামচ-মার্বেল দৌড় | Sports day | Run while you balance a marble on a spoon | Simple tilt model or Matter.js | kid character, race system |
| 12 | Haari Bhanga | হাঁড়িভাঙা | Sports day / fair | Blindfolded; find the hanging pot by sound | Web Audio API PannerNode (HRTF) | audio manager |
| 13 | Paper Airplane Racing | কাগজের উড়োজাহাজ | Rooftop | Launch angle, lift, drag, wind, glide | Custom 2D glider model (no GPL code) | physics helper |
| 14 | Paper Boat Racing | কাগজের নৌকা | Monsoon street | Steer a paper boat on flowing rain water | Flow-field water (cheap), 2D | race system |
| 15 | Musical Chairs | মিউজিক্যাল চেয়ার | Sports day | Circle the chairs; grab one when the music stops | Canvas 2D; music timing; AI seeking | audio, kid character, elimination rounds |
| 16 | Sack Race | বস্তা দৌড় | Sports day | Timed hops; bad timing makes you fall | Canvas 2D; rhythm hop | timing helpers, kid character |
| 17 | Three-Legged Race | তিন পায়ে দৌড় | Sports day | Two players step in sync; mismatch = stumble | Canvas 2D; coupled walkers | timing helpers, race system |

## Phase 3 — hard games (PLANNED)

| No. | Game | Bangla | Where | Planned core mechanic | Planned tech | Reuses |
|---|---|---|---|---|---|---|
| 18 | Short-Pitch Cricket | শর্ট-পিচ ক্রিকেট | Para | Batting timing. Runs 1–4 only. **A six is OUT.** | Shared cricket engine (2.5D) | `src/shared/cricket.ts` scoring |
| 19 | Tape Tennis Cricket | টেপ-টেনিস ক্রিকেট | Street | Fast, bouncy taped ball; swing | Shared cricket engine | same |
| 20 | Rooftop Cricket | ছাদ ক্রিকেট | Rooftop | Roof edges, water tanks; ball off the roof = OUT (option) | Shared cricket engine + boundary rules | same |
| 21 | Goli Cricket | গলি ক্রিকেট | Alley | Narrow alley, wall rebounds, brick stumps | Shared cricket engine + wall colliders | same |
| 22 | Pillow Fight | বালিশ যুদ্ধ | Sports day / home | Knock the other player off a bamboo beam | Matter.js constraints, controlled balance | physics helper |
| 23 | Kabaddi / Ha-du-du | হা-ডু-ডু | Village / para | Raider tags defenders on one breath and returns | Canvas 2D top view, team AI | team scoring, tournament system |
| 24 | Rooftop Badminton | ছাদে ব্যাডমিন্টন | Rooftop | Shuttle with high drag; clears, drops, smashes; wind | 2D side view, quadratic drag model | physics helper |

## Shared systems and the order to build them

1. **Phase 1 (done):** hub, registry, routing, language, settings, local records, achievements, audio, canvas host, fixed-step loop, particles, pendulum physics, beat and reaction timing, kid character, sports-day scenery, cricket scoring.
2. **Start of Phase 2:** add a rigid-body physics module (Matter.js, MIT) behind `src/engine/physics.ts`. Add a flick and drag input helper. Add a generic race system (lanes, start, finish, times) from Biscuit Race.
3. **During Phase 2:** add a tournament and points system for sports-day games (houses, medals).
4. **Start of Phase 3:** build one cricket engine with configurable rule sets (`sixIsOut`, `offRoofIsOut`, `wallRuns`). Extend `src/shared/cricket.ts`.
5. **Online multiplayer (later, optional):** add it behind an interface. Each game keeps local play. See `ARCHITECTURE.md`.

## Release path

1. Website (static files, any free host, for example GitHub Pages or Cloudflare Pages free tier).
2. Installable PWA (already in this build: manifest, icons, offline service worker).
3. Android app: wrap the same build with Capacitor (MIT, free). See `ARCHITECTURE.md`.
4. iOS app: the same Capacitor project, only if there is demand. An Apple developer account costs money, so this step is outside the $0 budget.
