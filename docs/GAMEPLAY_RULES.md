# Gameplay Rules

## Phase 1 (implemented)

### 01 Hand Cricket (হ্যান্ড ক্রিকেট)
1. Toss: Player 1 calls odd or even. Both players show a number. If the parity of the sum matches the call, the caller wins. The winner chooses to bat or bowl.
2. Each ball, both players show a number from 1 to 6 at the same time. Six is the thumb.
3. Different numbers: the batter scores the batter's number.
4. The same number: the batter is OUT.
5. The innings ends when all wickets fall (1, 2, 3 or 5) or when the overs end (1, 2 or 5; "classic" has no limit).
6. The second side chases the target (first innings + 1). The match ends when the target is reached, or when the second innings ends. Equal scores = tie.
7. Result text: "won by N runs" (the side batting first won) or "won by N wickets" (the chasing side won).
- Computer: easy plays at random. Medium and hard learn your habits (number frequency and what you play after each number). It commits before it sees your number.
- Two players: each player has a pad. A pick shows "Locked ✓" and not the number. In portrait, the top pad turns 180° for the player across the bench. Keys: Player 1 `1`–`6`, Player 2 `U I O J K L`.

### 02 Book Cricket (বই ক্রিকেট)
1. Hold the book (or the button, or Space) to riffle the pages. Let go to open the book. The page is chance, as in the real game.
2. Read the **last digit of the left-hand page** (left pages are even: 0, 2, 4, 6, 8).
3. **Default rule ("Classic"):** 0 = OUT, 2 = 2 runs, 4 = 4 runs, 6 = 6 runs, 8 = 1 run.
4. **Variant ("No-ball"):** 8 = no-ball: +1 run, and the ball does not count.
5. **Custom:** set each digit to OUT, dot, 1, 2, 3, 4, 6 or no-ball. The rule set must have at least one OUT.
6. One batter bats at a time. "Wickets" means batters per side (1, 3, 5 or 10). Overs: 1, 3, 5 or no limit.
7. The chase and the result work as in Hand Cricket.
- Fairness: the game opens even pages from 10 to 198. Each last digit has exactly a 1-in-5 chance.

### 03 Pakhir Ure (পাখি উড়ে)
1. Keep your finger on the pad (the bench). Keys: hold `Space` (or `A`); in two-player mode, `A` and `L`.
2. The caller says "___ উড়ে!" ("___ flies!").
3. If the thing really flies, **lift** your finger fast. If it does not fly, keep your finger down.
4. Lifting before the call, or less than 120 ms after it, is a false start.
5. Points: a correct lift = 100 + a speed bonus (up to 100). A correct hold = 50. Streaks give ×1.5 (from 5) and ×2 (from 10).
6. The response window starts at 1.5 s and shrinks by 35 ms per call, to 0.7 s.
7. Levels change every 6 calls: level 1 has clear animals; level 2 adds tricky animals (bat, penguin, peacock, beetle, spider) with an explanation; level 3+ adds things (kite, aeroplane, balloon, CNG, bus, brick…).
8. Solo: 3 lives, endless. Versus (computer or a friend): 20 calls. A mistake costs 50 points. The higher score wins.
- Simple mode: "Tap" instead of "lift".
- Unclear cases are left out on purpose (domestic chicken, duck, goose).

### 04 Tug of War (দড়ি টানাটানি)
1. Joba House (red) against Oporajita House (blue). Three pullers per team.
2. The chant beats "হেঁইয়ো!". The beat starts at 0.70 s and speeds up to 0.50 s over 30 s.
3. Tap your pad on the beat. Within 75 ms = perfect (strong pull). Within 160 ms = good.
4. Tapping off the beat, or twice on one beat, is a **slip**: your grip slides, and the rope moves toward the other team.
5. Every fourth good pull in a row is a big "Heave-ho!" pull.
6. A round ends when a team's front puller crosses the centre line, or after 45 s (the side that has the rope wins; exact centre = draw).
7. The match is best of 1, 3 or 5 rounds.
- Simple tapping mode: no beat; at most 6 taps per second count.
- Keys: Player 1 `A` or `Space`; Player 2 `L` or `Enter`.

### 05 Balloon Burst (বেলুন ফাটানো)
1. Tap balloons to pop them. The round lasts 30, 45 or 60 s.
2. Points: normal 10, gold (small, fast) 30, tough (ringed; 2 hits) 25, family 10 (it splits into three minis worth 8 each), clock 5 and +3 s (solo only).
3. The banner calls a target colour every 8 s. That colour gives ×2.
4. Combo: pops within 1.2 s of each other. ×1.5 from 5, ×2 from 10, ×2.5 from 15, ×3 cap.
5. A tap on empty sky: −2 points and the combo breaks. Taps above 10 per second do not count.
6. The grey rain cloud: −15 points, the combo breaks, and rain covers your screen for 1.4 s.
- Versus the computer: one shared field. The computer has a purple pin and races you for the same balloons.
- Two players: a split screen with identical balloons for both players.
- Keyboard: arrow keys move a crosshair; `Space` pops.

### 06 Biscuit Race (বিস্কুট দৌড়)
1. Hands stay behind your back. Run to the bamboo frame.
2. The biscuit hangs on a string. It swings like a pendulum, and the wind pushes it.
3. Jump and touch the biscuit with your face. If your mouth is centred under it (easy ±16, medium ±12, hard ±9 units), you bite it. If not, you bump it: it swings away, and you are dizzy for a moment.
4. You cannot pass the frame without the biscuit.
5. With the biscuit in your mouth, run to the finish. First to finish wins. After the first finish, the other racer has 9 more seconds.
- Keys: Player 1 `A`/`D` to move, `W`/`Space` to jump. Player 2 arrow keys. Against the computer, the arrow keys also control Player 1.

## Phase 2 (implemented)

### 07 Pen Fight (কলম যুদ্ধ)
1. Two pens lie on a wooden bench. Players take turns.
2. On your turn, touch your own pen, pull back and let go. The arrow shows the direction and the power. Keys: ← → aim, ↑ ↓ move the grab point, hold `Space` for power and release to flick.
3. A flick near the end of the pen spins it. A flick at the middle pushes it straight.
4. When the pens stop, a pen whose centre is off the bench has fallen.
5. If the other pen fell, you win the point. If your own pen fell (even if both fell), the other player wins the point. If none fell, the turn passes.
6. The first to 3 (or 5) points wins. The pens go back to the start after each point.

### 08 Rubber Band Shooting (রাবার ব্যান্ড শুটিং)
1. Touch the hand, pull back and let go. Pull further for more power. An optional aim guide shows the first part of the path.
2. Knock targets off the desks (or knock a cup or a chalk stick over): cup 10, chalk 15, book 20, pencil box 30, paper bird 50.
3. Five bands per level. If you clear the desk, each unused band gives +10.
4. Level 1: a cup pyramid. Level 2: two desks. Level 3: a swinging paper bird, and the ceiling fan blows bands down.
5. Solo: total score. Versus: each player shoots the same level in turn; the higher total wins.

### 09 Notebook Drawing Battle (খাতায় আঁকাআঁকি)
- **Party (2–4 players, one phone):** the drawer secretly picks one of three words and draws it in 60 s (pens in four colours, eraser, undo, clear). Friends shout guesses. The drawer taps the name of the friend who was right. Guesser: 50 + 2 × seconds left. Drawer: 40 + seconds left. No letters or numbers in the drawing. Each player draws 1 or 2 times.
- **Computer draws:** 8 rounds. The computer draws a doodle stroke by stroke. Pick the answer from four choices. Points: 50 + up to 100, more for a faster answer.

### 10 Elonti Belonti (এলন্টি বেলন্টি)
1. The caller stands under a mango tree with their back to the players and chants "এলন্টি বেলন্টি, ঘড়ি বাজে টিং টিং, এক দুই তিন!".
2. Hold WALK to move. Release to stop. Stopping takes about a quarter of a second.
3. The chant speed changes each time. Sometimes there is a pause before "এক দুই তিন".
4. On "তিন!" the caller turns (0.2 s) and watches for 1.2–2.4 s. Anyone still moving goes back to the start.
5. The first player to reach the caller wins.

### 11 Spoon & Marble Race (চামচ-মার্বেল দৌড়)
1. Hold RUN to go; release to slow down. That is the only control.
2. Speeding up rolls the marble back. Slowing down rolls it forward. The spoon bowl pulls it to the centre.
3. Faster running makes bigger random bumps (they grow with the square of the speed).
4. If the marble leaves the spoon, you stop to pick it up (1.8 s), or go back to the start (option).
5. First to the finish wins. A bubble above your head shows the marble on the spoon.

### 12 Haari Bhanga (হাঁড়িভাঙা)
1. You are blindfolded and spun round. Turn with ◀ ▶, walk with ▲, swing with HIT.
2. The pot makes a clay "tung" sound. It is directional with headphones (HRTF) and faster when you are close.
3. Friends shout "বামে! (left)", "ডানে! (right)", "সোজা! (straight)", "পেছনে ঘোরো! (turn round)" or "এখনই মারো! (hit now)". With no peeking, one friend lies 20 % of the time.
4. Peek setting: a lot (easy), a little, or none (hard).
5. Three swings and 60 s. A swing hits if the stick end is within reach of the pot.
6. Solo: break it as fast as you can. Versus: each player takes a turn; the faster break wins. The path is shown after each turn.

### 13 Paper Airplane Racing (কাগজের উড়োজাহাজ)
1. Choose a fold: glider (more lift, slower) or dart (faster, less lift).
2. On the roof, pull back from the plane and let go (or hold `Space` for power). A dotted line shows the start of the path.
3. In the air, hold ▲ to raise the nose. Above the stall angle, lift drops and the nose falls.
4. Wind changes each throw (the flag shows it). Hot roofs give rising air.
5. Rings +50 each. A soft landing on a roof, or reaching the end of the para, +100. Wires, water tanks, kites, walls and the street end the flight.
6. Score = distance ÷ 10 + bonuses. Three throws each; the best counts.

### 14 Paper Boat Racing (কাগজের নৌকা)
1. The current carries the boats up the stream. Hold ◀ or ▶ to steer.
2. The current is fastest in the middle of the channel.
3. Bricks, sandals and leaves bump and slow your boat. Whirlpools near drains pull it in and spin it.
4. The soak meter rises with rain, bumps and whirlpools. At 100 % the boat sinks.
5. The first boat under the bamboo bridge wins. After the first finish, the others have 8 s.

### 15 Musical Chairs (মিউজিক্যাল চেয়ার)
1. Five kids walk round the chairs while the harmonium plays. There is one chair fewer than kids.
2. The music stops after 4–10 s. Sometimes the music dips for a moment as a trick.
3. When it stops, press SIT. Your kid runs to the nearest free chair. The first to arrive sits.
4. Pressing SIT while the music plays is a foul: your kid trips for 1.3 s.
5. The kid left standing is out. One chair is removed. The last kid wins.

### 16 Sack Race (বস্তা দৌড়)
1. Tap HOP to jump forward in the sack.
2. The best hop is 0.06–0.30 s after landing (perfect). Up to 0.7 s is fine. A standing start is slow.
3. A tap too soon after landing, or in the air, adds wobble. Wobble falls slowly over time.
4. Full wobble = a fall: you lie down for 1.3 s.
5. First across the finish line wins.

### 17 Three-Legged Race (তিন পায়ে দৌড়)
1. The pair has two moves: the outer legs and the tied legs (a red gamchha ties them).
2. Alternate them at a steady pace (0.16–0.5 s between steps) for full speed.
3. The same move twice, both moves within 0.07 s, or stepping faster than 0.16 s = a stumble.
4. Too many stumbles: both kids fall for 1.5 s.
5. Two players: one team. Player 1 has the outer legs (`A`), Player 2 has the tied legs (`L`).

## Phase 3 (implemented): 18 Short-Pitch Cricket 3D (শর্ট-পিচ ক্রিকেট ৩ডি)

**Field.** A round para field with a rope at 26 m from the batter's stumps. The pitch is short: 11 m between the stumps. Nine fielders (a wicketkeeper, mid-off, mid-on, point, square leg, long-off, long-on, third man and the bowler) wear caps. The batters wear helmets and pads. The players have no faces.

**Scoring (para rules).**
- The ball crosses the rope after it touches the ground: **FOUR**.
- The ball crosses the rope in the air: **OUT ("six is out")**.
- Runs between the wickets: 1, 2 or 3. The batters change ends after an odd number of runs.
- A ball that the batter cannot reach (too wide or above the head): **wide**, +1 run, the ball is bowled again.
- **Out:** bowled, caught (a clean catch before the bounce), six-out, run out (the throw reaches the end before the runner; a throw from far away can miss the stumps).
- A match is 1, 2, 3 or 5 overs a side with 2, 3 or 5 wickets. The chasing side wins when it passes the target. The result says "won by N runs" or "won by N wickets", or "tied".

**Bowling.** There is no run-up. The bowler stands at the crease and bowls. Types: fast (≈ 21 m/s, swing), medium (≈ 17 m/s, swing), slow (≈ 12.5 m/s), off spin (turns to the leg side after the bounce), leg spin (turns to the off side). The bowler taps the pitch to choose where the ball lands. Coloured zones show full, good and short lengths. The computer bowler varies type, line and length; its accuracy depends on the level.

**Batting.**
- The direction stick: up = straight past the bowler, left = off side, right = leg side, down = behind the wicket. With no direction, the shot follows the line of the ball and the timing (early pulls to the leg side, late pushes to the off side).
- **Hit (মারো)** keeps the ball along the ground. **Loft (উঁচিয়ে)** goes in the air: it clears the infield, but a clean loft can carry the rope, and that is OUT. **Block (ঠেকাও)** is a soft defensive shot with a wider timing window.
- A swipe on the field plays Hit in the swipe direction (the same mapping as the stick).
- Timing windows (medium): perfect ±35 ms, good ±82 ms, early/late ±150 ms, edge beyond that. Easy widens the windows by 30 %; hard narrows them by 15 %. An edge flies behind the wicket (catch chance for the keeper and third man). Hitting against the line of the ball costs power.
- **Run (দৌড়)** asks for a run; tap again during a run for another run. On easy, the Run button turns green when a run is safe and red when it is risky.
- On easy, a yellow ring shows where the computer's delivery will bounce.

**Fielding** is automatic: the two nearest fielders chase, the first to reach the ball gathers it, waits 0.5 s, and throws (19 m/s) to the end where a runner is in the most danger. Catch success depends on the level and the speed of the ball.

**Computer batter.** It chooses gaps between the fielders, defends high balls, lofts more when the required rate is high, times its shots with noise by level, and runs when the estimated fielding time is longer than the running time plus a safety margin.

**Balance (simulation, 1,500 balls per level, computer against computer).** Runs per ball: easy 0.65, medium 0.84, hard 1.15. Balls per wicket: about 7. Fours: 10–19 %. Six-outs: 1–4 %. Wides: about 1 %.

## Phase 3 (other games: planned rules)

| No. | Game | Planned rules |
|---|---|---|
| 19 | Tape Tennis Cricket | Street cricket with a taped tennis ball: fast bounce, swing. Configurable street boundaries. |
| 20 | Rooftop Cricket | Water tanks and parapets. Option: ball off the roof = OUT. |
| 21 | Goli Cricket | A narrow alley. Brick stumps. Wall rebounds give configurable runs. |
| 22 | Pillow Fight | Two players sit on a padded bamboo beam. Swing, block or lean. Knock the other off. |
| 23 | Kabaddi / Ha-du-du | The raider says "ha-du-du" on one breath, tags defenders and returns. Tackles, revival and the bonus line. Traditional variants are options. |
| 24 | Rooftop Badminton | High-drag shuttle; clears, drops and smashes. Optional wind. Rally scoring to 11 or 21. |
