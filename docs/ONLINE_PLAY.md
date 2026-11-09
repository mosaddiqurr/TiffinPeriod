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
| `src/platform/net/link.ts` | The connection: named channels with presence and messages. A production build talks to the Cloudflare Worker at its own address (or `VITE_RT_URL` when set). The Vite dev server uses a BroadcastChannel stand-in, so two tabs of one browser can play each other while developing. Setting `localStorage tp.net = "local"` forces the stand-in. |
| `worker/index.ts` | The server: a Cloudflare Worker that serves the site and runs one Durable Object per channel (who is here, relaying messages). Nothing is stored. |
| `src/platform/net/rooms.ts` | Room codes, invite links, create, join and quick match (lobby pairing). It also gives each pair a reliable, ordered message layer (numbered messages, acknowledgements, resends, keep-alive pings, "left" detection) and holds messages that arrive before the game listens. |
| `src/games/hand-cricket/duel.ts` | The online match rules (toss, choice, balls, rematch) with fair hidden numbers. Both devices run it. |
| `src/games/hand-cricket/OnlineHC.tsx` | The lobby, room, search and match screens. |
| `tests/online.test.ts`, `e2e/phase4.spec.ts` | Two-device matches, cheat detection, rematch, quick match against the stand-in, room codes. |

Channels are `tp:<game>:lobby` and `tp:<game>:room:<CODE>`. Players connect anonymously.

## Server and hosting (Cloudflare)

One Cloudflare Worker (`wrangler.jsonc`) does both jobs:

- **The site.** Files from `dist/` are served straight from Cloudflare's network. Bandwidth is not charged.
- **Online play.** `GET /rt?ch=<channel>` opens a WebSocket to that channel's Durable Object (`Room`). It sends `hello` (my id and who is here), then `join` / `leave` / `msg` frames. Channel names must look like `tp:<game>:…`. Messages are limited to 16 KB and channels to 200 players. `GET /rt/ping` answers `pong`, which the app checks before going online (otherwise quick match uses the stand-in). Idle rooms sleep, and keep-alive pings are answered without waking them.

**Deploying.** Cloudflare's GitHub connection (Workers Builds) builds every push to `master` with `npm run build` and deploys with `npx wrangler deploy`. By hand: `npm run deploy` (needs `npx wrangler login` once).

**Running it locally.** `npm run build` then `npm run serve:cf` serves the real Worker, rooms included, at http://127.0.0.1:8787. The browser tests (`npx playwright test`) start this Worker on port 4173 by themselves, so the online tests play through the real server.

Online play used to run on InsForge Realtime. `migrations/` is left from that time and is not used any more.

## Adding online play to a game (the online kit)

Every game uses the same pieces. Dots and Boxes (`src/games/dots-boxes/online.tsx`) is the short worked example of a turn game. Hand Cricket (`src/games/hand-cricket/OnlineHC.tsx` + `duel.ts`) is the example with secret simultaneous picks.

**Entry.** In the game's default export, call `useOnlineEntry()` from `src/components/online/OnlineButton.tsx`. When `open`, render `<div className="sport-root ruled"><Online… onBack={online.close} code={online.code} /></div>`. Otherwise render the normal game and put `<OnlineButton onClick={online.show} />` at the top of its setup options. An invite link `#/play/<game>?room=CODE` opens the online screen by itself.

**Lobby.** `OnlineLobby<S>` (`src/components/online/OnlineLobby.tsx`) takes these props: `game` (the channel name, i.e. the game id), `title`, `onBack`, `code`, `sport` (which flags), `defaultSettings` / `quickSettings`, an optional `Options` component for room settings, `describe(s)`, `makeBot(me, settings, seed)` and `Match`. It handles name and country, quick match (stand-in after 10 s), rooms, codes, links and "Player found!". Then it agrees on `{ settings, seed }` (the host sends "cfg") and renders `Match` with `{ peer, settings, seed, onLeave }`.

**Peer** (`src/platform/net/rooms.ts`). `peer.host` is true on the host side. Use `peer.me` / `peer.them` (`{ name, team }`), `peer.send(type, data)` and `peer.on(type, cb)`: messages arrive reliably and in order, and early ones are held until you listen. `peer.onGone(cb)` fires when the other player left. Call `peer.close()` when the match really closes; `useRealUnmount(() => peer.close())` does that safely in React development mode.

**Match helpers** (all in OnlineLobby.tsx):
- `useOppGone(peer)` returns a boolean.
- `<OppBar peer gone status />` is the other player's bar: flag, name, online dot and status.
- `useMoveClock(key, seconds, onExpire)` with `<MoveClock left seconds />` is a move timer: when time runs out, make a sensible move for the player.
- `useRematch(peer, onBoth)` is the rematch handshake.
- `<OnlineEnd title lines gone oppName rematch onRematch onLeave />` is the end sheet.
- Record finished games with `recordResult(gameId, { outcome })`.

**Two kinds of games:**
- *Turn games*: send each move. Both sides apply it to the same pure model, or the mover also sends the resulting state and the other side adopts it. That is a must for physics, because floating point can differ between phones. Ignore moves that are out of turn or stale (carry a game number for rematches).
- *Score races*: `RaceLink` (`src/platform/net/race.ts`). Both play the same level from the shared `seed`. Call `race.ready()` when loaded, and `race.onStart` fires on both. `race.report({ score, done, extra })` while playing, and read `race.opp` / `race.onOpp(cb)` to show the other player's progress live. The higher final score wins, or as the game defines it.

**Stand-in** (`src/platform/net/bot.ts`). `makeBotPeer(me, { settings, seed, sport, brain, speed })`. The brain gets the bot's end (`send` / `on`) and plays the host's side with the game's own computer player and human-like delays (`thinkMs`). For races, `raceBrain({ seconds, final })` raises a believable score. The stand-in is the host and must behave exactly like a real host: it answers rematches and never leaves mid-game.

**Testing.** Use a Vitest file for the protocol and the stand-in (`speed` > 1 makes it fast). For browser tests, set `localStorage tp.net = "local"`: two pages in one browser context then talk over BroadcastChannel without InsForge.

## Games with online 1v1

Every game below has **Play online · 1v1** on its setup screen (quick match, rooms and links). Each one has a stand-in for quick match, rematch, and "left the match" handling.

| Game | How it plays online | Clock |
| --- | --- | --- |
| Hand Cricket | Secret numbers with fingerprints (commit, then reveal). The guest calls the toss. | 10 s per pick, call or choice; a random choice when time runs out |
| Dots and Boxes | Turns; the same moves go into the same model on both phones. The host picks the board size. | 15 s per line |
| Pen Fight | Each player picks a pen. The mover's aim is shown live; the mover sends the flick, then both pens' final positions, and the other phone adopts them. First to 3 or 5. | 15 s per flick |
| Flikk Football | Fixed players. Both pick a formation, and the guest's pitch is turned round. The mover sends the flick, then the settled result, score and clock. | 15 s per flick; 20 s for the formation |
| Hangman | Word duel: both solve the same word at once (from the seed), best of 3. The other player's progress shows as dots, never letters. | 15 s per guess (running out counts as a miss) |
| Notebook Drawing | Take turns drawing and guessing. Strokes stream live; the guesser picks from 6 answers. | 10 s to pick a word, 70 s per drawing |
| Balloon Burst | Score race on the same seeded field (fixed size, so every screen gets the same balloons). The other player's score shows live. | The round length |
| Pakhir Ure | Score race on the same seeded calls. Score and call number show live. | 10 s to put the finger down |
| Paper Airplane | Score race: same course, fold and wind for each throw, 3 throws each, best throw wins. | 15 s per throw |
| Paper Boat | Live race on the same stream; the other boat shows as a ghost. The faster finish wins. | 8 s after the first finish, 120 s at most |
| Penalty Shootout | Each player's team is their lobby country. Turns to shoot and keep, 3 or 5 kicks each (quick match 5), then sudden death. The shooter aims and stops the power bar while the keeper picks a dive, at the same time and in secret (commit, then reveal); both phones judge the kick with the same model. | 10 s per shot or dive; a computer-style choice when time runs out |
| Naam Desh Ful Fol | Same letter for both each round (from the seed); both write name, country, flower and fruit at once. Answers are sent only when both are done. Unknown words that start with the letter go to the other player to tick or cross. 3 or 5 rounds (quick match 3). | 45/60/90 s to write; 10 s left once the other is done; 15 s to check |
| Chor Police (4 players) | Party rooms (`src/platform/net/party.ts`): the host and up to 3 friends by code or link; empty seats get stand-ins when the host starts. Quick match groups searchers four at a time, and fills the rest with stand-ins after 10 s. The host deals from the seed, sends each player only their own chit, and keeps the scores. A player who leaves is replaced by a stand-in; if the host leaves, the game ends. | 20 s to hide the chit, 15 s for the Police's guess |

Each game's protocol is described at the top of its `duel.ts`, `race.ts` or `online.tsx`.
