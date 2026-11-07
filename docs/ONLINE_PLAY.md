# Online play (1v1)

Hand Cricket is the first game with online 1v1. The pieces are shared, so other games can follow without backend changes.

## How players get a game

All three ways start from **Hand Cricket → Play online · 1v1**. Players type a name and pick a country. Nobody makes an account.

| Way | What happens |
| --- | --- |
| **Quick match** | The player waits in the game's lobby. The two who have waited longest are paired (about 1–2 seconds when someone else is searching). If nobody else is searching after **10 seconds**, a stand-in opponent joins instead (see below). Quick match is 2 overs, 2 wickets. |
| **Create a room** | The host picks overs and wickets and gets a **5-character code** (for example `ZBV84`). The characters 0, O, 1, I and L are never used, so the code can't be misread. **Share link** opens the phone's share sheet (WhatsApp, Messenger and so on), or copies the link on a computer. |
| **Join a room** | The friend types the code (spaces and lower case are fine). Or they open the shared link (`…#/play/hand-cricket?room=ZBV84`), which joins the room straight away. |

In a match, the guest calls the toss (odd or even) and the toss winner chooses to bat or bowl. The two players then pick their numbers at the same time. After a match either player can ask for a **rematch**. The toss caller swaps for the rematch. If a player leaves or loses the connection for about 15 seconds, the other player sees "… left the match" and is given the win.

### Fair hidden numbers

For every pick (the toss and each ball):
1. Each device first sends a SHA-256 fingerprint of `game:step:number:salt`.
2. A device sends its real number and salt only after it has the other player's fingerprint.
3. Both devices check the other's number against its fingerprint.

So nobody can see the other number early or change their own afterwards. A changed number stops the match with "Connection problem".

### The quick-match stand-in

As the owner asked, when nobody is waiting the stand-in looks like an ordinary player:
- it has a common Bangladeshi first name, sometimes with a suffix such as `_dhk` or `99`, and a country;
- it uses the same match protocol behind a pretend connection with small delays;
- its thinking time varies;
- it plays with the computer opponent's brain at an easy or medium level.

It never leaves in the middle of a match, and it accepts rematches. Code: `src/games/hand-cricket/bot.ts`.

## Where the code is

| File | What it does |
| --- | --- |
| `src/platform/net/link.ts` | The connection: named channels with presence and messages. It uses InsForge Realtime when the two `VITE_INSFORGE_*` values are set. Otherwise it uses a BroadcastChannel stand-in, so two tabs of one browser can play each other while developing. Setting `localStorage tp.net = "local"` forces the stand-in. |
| `src/platform/net/rooms.ts` | Room codes, invite links, create, join and quick match (lobby pairing). It also gives each pair a reliable, ordered message layer (numbered messages, acknowledgements, resends, keep-alive pings, "left" detection) and holds messages that arrive before the game listens. |
| `src/games/hand-cricket/duel.ts` | The online match rules (toss, choice, balls, rematch) with fair hidden numbers. Both devices run it. |
| `src/games/hand-cricket/OnlineHC.tsx` | The lobby, room, search and match screens. |
| `tests/online.test.ts`, `e2e/phase4.spec.ts` | Two-device matches, cheat detection, rematch, quick match against the stand-in, room codes. |

Channels are `tp:<game>:lobby` and `tp:<game>:room:<CODE>`. Players connect anonymously.

## Backend (InsForge)

- Project **Tiffin Period** (region `ap-southeast`, Singapore, close to Bangladesh), in the owner's InsForge account on the free plan.
- One channel pattern, `tp:%`, is enabled by `migrations/20261107091722_online-play-channels.sql`, applied with `npx -y @insforge/cli db migrations up --all`.
- The CLI link lives in `.insforge/project.json`, and the local keys live in `.env.local`. Git ignores both. Never commit them.

## Deploying

**Live now:** https://iyj6ikag.insforge.site (InsForge hosting). Both values below are saved on the InsForge deployment, so redeploying is just `npx -y @insforge/cli deployments deploy .`. `.vercelignore` keeps test reports and notes out of the upload.

The site needs two build-time values:

```
VITE_INSFORGE_URL=https://<appkey>.ap-southeast.insforge.app
VITE_INSFORGE_ANON_KEY=<the project's anon key>
```

The anon key is a public browser key, not the admin API key. Get the values from `.env.local`, or run `npx -y @insforge/cli secrets get ANON_KEY` and read the URL from `.insforge/project.json`.

**Netlify:** Site settings → Environment variables → add both. Then build with `npm run build` and publish the `dist` folder. Routes are hash routes, so no redirect rules are needed.

**InsForge deployments** (instead of Netlify): `npx -y @insforge/cli deployments deploy .` with the same two environment variables set for the deployment.

Without the two values, the site still works offline. In that case quick match gives the stand-in, and rooms only connect between tabs of the same browser.
