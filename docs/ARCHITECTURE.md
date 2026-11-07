# Architecture

## 1. Summary

- **Web-first.** One TypeScript code base: React 19 for screens, Canvas 2D for real-time games, and Vite for the build.
- **One rendering strategy per kind of game.** Turn-based games (Hand Cricket, Book Cricket, Pakhir Ure) use React DOM, SVG and CSS. Real-time games (Tug of War, Balloon Burst, Biscuit Race) use one shared canvas host with a fixed-timestep loop.
- **No server.** All data stays in the browser (localStorage). No account. No paid service.
- **PWA.** It has a manifest, icons and an offline service worker (vite-plugin-pwa / Workbox).
- **Isolation.** Each game is a lazy-loaded chunk inside its own error boundary. A crash in one game does not break the hub or the other games.

## 2. Folder structure

```
src/
  main.tsx, App.tsx          entry, routes
  styles/global.css          design tokens and shared UI styles
  platform/                  services shared by all games
    registry.ts              the 28 games (id, phase, titles, modes, lazy loader)
    router.ts                hash routes (#/, #/play/<id>, #/roadmap, #/settings, #/records)
    i18n.ts, strings.ts      Bangla / English text, Bangla digits
    settings.ts              language, sound, voice, haptics, reduced motion, input assist, player names
    storage.ts, store.ts     safe localStorage, a tiny external store
    scores.ts                local records, streaks and achievements
    audio.ts                 synthesized sound effects, speech, vibration
  engine/                    game-neutral helpers
    loop.ts                  fixed-timestep loop (120 Hz physics)
    GameCanvas.tsx           canvas host: fit, DPR cap, camera origin, pointer mapping, pause on hide
    physics.ts               damped pendulum, circle overlap, prediction
    timing.ts                beat judging, rate limiter, reaction thresholds, safe pointer capture
    particles.ts             particles and floating text
    rng.ts                   seeded random numbers (mulberry32)
    math.ts                  clamp, lerp, damp, easing
  shared/
    cricket.ts               innings, overs, targets, results (Hand Cricket, Book Cricket, Short-Pitch 3D)
    kid.ts                   2D school kid character (uniform, house vest)
    scenery.ts               school, flag, Shaheed Minar, krishnachura, bunting, field, crowd
  components/
    Pages.tsx                hub, roadmap, settings, records
    GameScreen.tsx           game frame: top bar, help, pause, error boundary, lazy load
    ui.tsx                   segmented choices, switches, pause menu, report card, toasts
    Doodles.tsx              hand-drawn SVG card art and icons
  games/<id>/                one folder per game
    <Game>.tsx               React screen (setup → play → result)
    logic.ts / engine.ts / model.ts / field.ts   pure rules and physics (unit-tested)
    ai.ts or inside model    computer opponent
    *Scene.ts                canvas renderer (real-time games)
    *.css                    game styles (bundled with the game chunk)
tests/                       Vitest unit tests (pure logic)
e2e/                         Playwright browser tests
docs/                        project documents
```

## 3. The game module contract

A game is a React component with one prop:

```ts
export interface GameProps { onExit: () => void }
export default function MyGame({ onExit }: GameProps) { ... }
```

A game uses these shared parts:

- `useGameBar({ onPause, help })`: tells the top bar how to pause and what help to show.
- `PauseMenu`, `ReportCard`, `ModeSeg`, `DifficultySeg`, `Seg`, `Overlay`: shared UI.
- `recordResult(gameId, { outcome, score, records }, checkAchievements)`: saves the result locally.
- `sfx(name)`, `speak(bn, en)`, `vibrate(ms)`: feedback that respects the settings.
- `useT(table)`: a per-game text table with the same keys in `bn` and `en`. TypeScript checks the key parity.

**Rule of separation.** Rules and physics live in pure modules with no DOM. Screens and scenes call those modules. This rule makes the logic unit-testable and portable to a future native app.

## 3a. GameShell and RaceScene (added in Phase 2)

Most canvas games now use two shared parts.

**`src/components/GameShell.tsx`.** A game gives the shell:
- `createScene(cfg)`: a `ShellScene`, which is a canvas `Scene` with `control(player, action, down)`, `onOver(result)`, and optional `onPause()` and `dispose()`.
- `pads(cfg)`: a list of `PadDef` items. Each item has a player, an action, a label, a screen area (`bl`, `br`, `bc`, `tl`, `tr`, `tc`), key codes and an optional `flip` (turned 180° for the second player across the table). An item can be `hidden` (a keyboard-only binding).
- `options`: extra setup choices, shown as segmented buttons.

The shell then gives every game the same setup sheet, touch pads, key bindings, pause menu, result card, local records and achievements. It can also show a "turn your phone sideways" hint (`preferLandscape`).

**`src/shared/race.ts`.** A base class for side-view races (Sack Race, Three-Legged Race, Spoon & Marble, Elonti Belonti). It owns:
- the lanes (Player 1 always at the bottom, next to the pads)
- a camera for each lane
- the countdown and whistle
- the progress bar, the finish order and the grace time
- the result rows

A race only implements `stepRacer()`, `drawRacer()`, `control()` and the extra result rows. `src/shared/raceKit.ts` gives the race texts in both languages and the lane roster.

**Matter.js (MIT).** Pen Fight (top view, zero gravity, air friction = table friction) and Rubber Band Shooting (side view, desks, constraints for the paper bird) use Matter.js 0.20. Both games step the engine at the fixed 1/120 s. The Pen Fight computer copies the world and simulates candidate flicks over several frames. The Rubber Band computer searches launch pulls with a collision-free preview world.

**Audio additions (`src/platform/audio.ts`).**
- `playMelody(notes, bpm, bass)`: an original harmonium-like loop. Notes are scheduled on the audio clock with a lookahead timer, so the rhythm does not drift.
- `createSpatialSource()`: an HRTF `PannerNode`. It is positioned relative to the listener's heading in a 2D top view.

**Portrait screens.** A scene can change its design size and camera in `onResize()`. Tug of War, Paper Airplane and Haari Bhanga use a narrower view in portrait with a camera that follows the action.

## 3b. The 3D game: Short-Pitch Cricket 3D (added in Phase 3)

The game has three layers. Only the middle layer knows Three.js.

| File | Role | Depends on |
|---|---|---|
| `src/games/short-pitch/sim.ts` | **Pure simulation** in metres and seconds: delivery types and planned paths (swing before the bounce, spin after it), timing judgement, shot launch (direction, power, elevation), the ball in play (drag, bounces, rolling), 9 fielders (chase, catch, gather, throw), runners, run outs, the circular boundary (four / six-out), computer bowler and batter. No DOM. Unit-tested in `tests/short-pitch.test.ts`. | `engine/rng.ts` |
| `src/games/short-pitch/world.ts` | **3D scene builder**: the field, pitch, stumps, rope, para houses (instanced), krishnachura trees, chalk scoreboard, flag, ball, shadow, aim arrow, length zones. Faceless low-poly players (helmet or cap) and procedural poses (stance, stroke, run, bowl, throw, keeper, celebrate). All shapes and textures are made in code; there are no image or model files. | three.js |
| `src/games/short-pitch/game.ts` | **Match controller** (`ShortPitchGame`): the ball state machine (pick → windup → delivery → play → result → next ball / innings break / done), the fixed 120 Hz step, cameras (broadcast long lens, bowling view, ball-follow view with cuts, orbit), input (keys, swipe, tap-to-aim raycast), the mini-map, the HUD snapshot, and full disposal of the WebGL context. | sim, world, `shared/cricket.ts`, audio |
| `src/games/short-pitch/ShortPitch3D.tsx` | **React screen**: the setup sheet, the HUD (score, this over, delivery type, banners, timing bar), the touch controls (direction stick, shot buttons, Run, delivery chips, Bowl), pause and the report card. It creates one `ShortPitchGame` per match and shows a message if WebGL is missing. | game |

Coordinates: physics `(x, h, y)` maps to Three.js `(x, h, −y)`. `x` is positive to the off side of a right-handed batter, `y` runs from the batter's stumps (0) to the bowler's stumps (11 m). The broadcast camera stands far behind the bowler (about 33 m from the batter) with a narrow lens, as on TV, so the off side appears on the left of the screen.

Performance: about 100 draw calls and 13,000 triangles per frame (houses, flags, trees and tanks are instanced), Lambert materials, no real-time shadows (blob shadows), pixel ratio capped at 1.75. three.js is in the game's own chunk (about 155 kB gzip) and loads only when the game opens.

## 3c. Phase 4: national teams, modes and online-ready rules

See `docs/PHASE4_SPORTS_AND_DESK_GAMES.md`, section 4. In short: `src/shared/teams.ts` (nations, flags drawn in code), `tournament.ts` (groups, standings, knockouts, simulators), `cricketModes.ts` and `daily.ts` (ladders, stars, daily seed); `src/components/sport/` holds the shared sport UI and `CricketHub`, which runs Quick Match, Target Challenge, Tournament and Daily Challenge for Hand, Book and Number Cricket through one `Match` component per game. `src/platform/online.ts` defines the contract for later online play.

## 4. How to add a new game

1. Create `src/games/<id>/` with a default-export component. For a canvas game, return a `<GameShell>` with a `createScene` and a `pads` list (see section 3a).
2. In `src/platform/registry.ts`, add the game to the `BUILT` map (`modes` and `load: () => import('../games/<id>/<Game>')`). The registry then marks it playable.
3. Add a doodle in `src/components/Doodles.tsx` (the `DOODLES` map).
4. Put the rules in a pure module and add unit tests in `tests/`.
5. Add a browser test in `e2e/` that plays to a result.
6. Add achievements in `src/platform/scores.ts` if they are meaningful.

No other file needs a change.

## 5. Real-time loop and physics

- `createLoop()` uses the accumulator method: physics steps at exactly 1/120 s. Rendering happens once per display frame, so the results do not depend on the frame rate.
- `GameCanvas` caps the device pixel ratio at 2. It caches static backgrounds in off-screen canvases, so low-end phones stay smooth.
- A scene can set a camera (`originX`, `originY`) and change it in `onResize()` for portrait screens.
- Physics choices:
  - **Tug of War:** a 1-D model, `a = K·(s_right − s_left) − c·v`. Pull "surges" decay with τ = 0.25 s. There is one judged pull per beat.
  - **Biscuit Race:** a damped pendulum with semi-implicit Euler, plus wind. The bite test uses circle overlap with a centring tolerance.
  - **Balloon Burst:** kinematic rise with sway, elliptical hit areas, and a seeded spawner.
- **Why not Phaser?** All 17 games need simple 2D drawing. A small canvas host keeps the bundle small (about 90 KB gzipped for the shell; each game is a separate chunk of 5–25 KB gzipped, except Pakhir Ure at about 50 KB because of its pictures). It also keeps one strategy for all real-time games. Matter.js is used only where rigid bodies are necessary (Pen Fight, Rubber Band Shooting). It is planned for Pillow Fight too. Phaser stays an option if a later game needs sprite atlases and tilemaps.

## 6. Fairness rules in the code

- **Hand Cricket:** the computer commits its number before it reads your number for that ball. `HandAI.choose()` gets only the history.
- **Balloon Burst split screen:** both players get the same seed, so they see identical balloons.
- **Biscuit Race:** all lanes start with the same swing and the same wind.
- **Tug of War:** the computer presses through the same `input()` and the same timing judge as a human.

## 7. Accessibility and comfort

- Every control is a real button with a label. Keyboard controls exist for every game.
- "Simple tapping" replaces rhythm timing in Tug of War. "Tap" replaces "lift finger" in Pakhir Ure.
- There is a "Reduce motion" setting (it also follows the system setting). There are sound, volume, voice and vibration switches.
- Touch targets are 48 px or larger. The layout has no horizontal scroll at 390 px (a browser test checks this).

## 8. Data and privacy

- localStorage keys use the prefix `tp.v1.` (`settings`, `scores`, `achievements`). There is no network traffic after the first load.
- If storage is blocked (for example in a private window), the app uses memory and still works.

## 9. Integration points for later phases

- **Online multiplayer (optional, later).** Add a `Transport` interface (`send(msg)`, `onMessage(fn)`) in `src/platform/`. Turn-based games (Hand Cricket, Book Cricket) can send picks or pages as messages with the same pure `playBall()` / `playPage()` functions. Free options exist: WebRTC data channels with a self-hosted or free signalling server. Local play stays the default.
- **Native apps.** Wrap the `dist/` build with Capacitor (MIT). Hash routes and relative asset paths (`base: './'`) already work inside a WebView. Android builds are free. iOS needs a paid Apple developer account.
- **Tournaments.** Sports-day games can report `{ house, place, time }` to a future tournament store next to `scores.ts`.
