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
    registry.ts              the 24 games (id, phase, titles, modes, lazy loader)
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
    cricket.ts               innings, overs, targets, results (Hand + Book Cricket, later Phase 3)
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

## 4. How to add a new game (for Phase 2)

1. Create `src/games/<id>/` with a default-export component.
2. In `src/platform/registry.ts`, set `playable: true`, `modes`, and `load: () => import('../games/<id>/<Game>')`.
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
- **Why not Phaser or Matter.js now?** Phase 1 needs simple 2D drawing and tiny physics. A small canvas host keeps the bundle small (about 86 KB gzipped for the shell, and each game is a separate chunk). It also keeps one strategy for all real-time games. Matter.js (MIT) will come in Phase 2 for rigid bodies (Pen Fight, Rubber Band Shooting, Pillow Fight), behind `src/engine/physics.ts`. Phaser stays an option if a later game needs sprite atlases and tilemaps.

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
