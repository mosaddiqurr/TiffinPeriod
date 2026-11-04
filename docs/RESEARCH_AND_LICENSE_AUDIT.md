# Research and Licence Audit

Date of audit: 2026-11-04.

## 1. Method

1. We cloned each public reference repository with `git clone --depth 1` into an isolated scratch folder.
2. We read the LICENSE file, `package.json` and the README. We read the key source files of the Phase 1 references.
3. We did **not** run any code from the clones and did not install their dependencies.
4. The GitHub REST API was not available in the build environment (HTTP 403). For this reason, the licence data comes only from the files in each clone.
5. Commercial games are OBSERVATION references. We did not download, decompile or analyse their binaries. We did not copy their assets.

## 2. Licence table (from the cloned files)

| Repository | Licence found | Decision |
|---|---|---|
| sbshah97/HandCricket | MIT (LICENSE) | Reuse is allowed. We did not reuse code. |
| gitanshu-choudhary gist (Book Cricket) | None | Study-only. |
| Khaaii1/reaction-time-game | None ("No license has been specified") | Study-only. |
| zubairahmed-sketch/Battle_Brains | MIT in README and package.json; no LICENSE file found | Treat as MIT with attribution. We did not reuse code. |
| mashukui/web-games | MIT (LICENSE) | Reuse is allowed. We did not reuse code. |
| liabru/matter-js | MIT (LICENSE) | Planned engine for Phase 2. |
| niketmishra/penfight | None | Study-only. |
| VARUNMUTHALS/pen-fight | None | Study-only. |
| scribble-rs/scribble.rs | BSD-3-Clause; some resources need attribution | Code reuse allowed with notice. Check each asset. |
| kalotrapezis/classGame | GPL-3.0 | Do not copy code into this project. |
| showman-sharma/red-light-green-light | MIT | Reuse allowed. We plan no reuse (no camera input). |
| bartbasi/Updraft | GPL-3.0 | Do not copy code. Study the model; write our own. |
| yuvnaaz/Drift | None | Study-only. |
| QusaiAlbonni/three-sails | MIT | Reuse allowed with notice. |
| rakeshid03/Musical-Chairs-3D | README says MIT; no LICENSE file | Study-only until a licence file is confirmed. |
| Vimal9RAM-NAP/pixel-cricket | MIT | Reuse allowed with notice. |
| assishmoncs/battlebox | MIT | Reuse allowed with notice. |
| mahjerion/Capsule-Badminton | Not verified (clone did not finish) | UNVERIFIED. |

**Phase 2 decision.** The 11 Phase 2 games use **no code** from any reference in the table above. The study-only and GPL repositories (Pen Fight, Updraft, classGame, Drift, Musical-Chairs-3D) were used for gameplay ideas only. The glider model of Paper Airplane, the flow field of Paper Boat and the Pen Fight flick model were written from physics principles. The only new third-party part is Matter.js (MIT).

**GPL rule.** This project does not contain GPL code. If a later phase wants GPL code, the owner must first decide if the whole app can be distributed under GPL-3.0. The default is: write the mechanic again from the idea, not from the code.

## 3. Third-party parts in this build

| Part | Version | Licence | Where | Attribution |
|---|---|---|---|---|
| React, React DOM | 19.3.1 | MIT | runtime | `THIRD_PARTY_NOTICES.md` |
| Matter.js (matter-js) | 0.20.0 | MIT | runtime (Pen Fight, Rubber Band Shooting only) | `THIRD_PARTY_NOTICES.md` |
| workbox-window (via vite-plugin-pwa) | 7.4.1 | MIT | runtime (service worker) | `THIRD_PARTY_NOTICES.md` |
| Baloo Da 2 font (@fontsource) | 5.3.0 | SIL OFL 1.1 | runtime | `THIRD_PARTY_NOTICES.md` |
| Hind Siliguri font (@fontsource) | 5.3.0 | SIL OFL 1.1 | runtime | `THIRD_PARTY_NOTICES.md` |
| Microsoft Fluent Emoji (Flat), 48 SVG pictures | main branch, 2026-11-04 | MIT | Pakhir Ure pictures | `src/games/pakhir-ure/art/LICENSE-fluentui-emoji.txt` |
| Vite, Vitest, TypeScript, Playwright, vite-plugin-pwa | see package.json | MIT / Apache-2.0 | build and test only | not shipped |

A scan of `node_modules` found these licences: MIT, ISC, Apache-2.0, BSD-2/3-Clause, BlueOak-1.0.0, OFL-1.1, MPL-2.0 (build tools only) and CC-BY-4.0 (browser data used by the build only). No GPL package is in the dependency tree.

**Original work in this build:**
- All game code.
- All drawings: the hands, the book, the kids, the school, the flag, the Shaheed Minar, the krishnachura tree, the bunting, the balloons and the biscuit.
- All card doodles and icons.
- All sound effects. They are synthesized with the Web Audio API, so there are no audio files.

**Respect for national symbols.** The Bangladesh flag uses the official proportions: 10:6, with the red disc centred at 9/20 of the length and a radius of 1/5 of the length. The Shaheed Minar is a small, simple background element. It is never a game object or a target.

## 4. REA (Reverse Engineer Anything) evaluation

- Source: https://github.com/morluto/rea (cloned and read). Licence: MIT. Package: `rea-agents` 6.8.0.
- What it is: an MCP server and a CLI. It helps an agent inspect native binaries, JavaScript and Electron apps, .NET assemblies and websites. Native analysis uses Hopper, Ghidra, IDA or similar tools.
- Setup (`npx rea-agents setup`): it registers an MCP server and edits agent configuration files, with backups. An agent restart is necessary. On Linux, some features need a procps-compatible `ps`.
- Security notes: it downloads and runs a package from npm. Run it from a trusted folder outside the project. Analyse only software that you are authorised to analyse.
- **Decision for Phase 1: not installed, not used.** All six Phase 1 references are open-source projects with small, readable source files. Normal source reading gave all the information. REA would add no meaningful advantage. The brief asks us to use REA selectively, and this decision follows that instruction.
- **Plan:** consider REA in Phase 2 or 3 only for a compiled web build that we are authorised to analyse, for example a minified browser game with a permissive licence and no source.

## 5. Research limitations

1. The background research agents were stopped part-way through. We completed the licence checks for all cloned repositories ourselves. The deep source study is complete for Phase 1 only.
2. Steam and app-store pages were not visited in this run. They remain OBSERVATION references.
3. The Book Cricket presets ("0 = out, 8 = 1 run" and "8 = no-ball") are common school conventions from general knowledge. We did not confirm them with written sources. This is the reason that the game has a custom rule editor.
4. The traditional rules of Pakhir Ure come from general knowledge of the game. It is the same game as "Chidiya Udd" in India: fingers on the table, lift when a flying thing is called. Formal written sources were not collected.
5. The clone of Capsule-Badminton did not finish. Planck.js was not cloned.
6. No closer open-source Kabaddi implementation was found.
