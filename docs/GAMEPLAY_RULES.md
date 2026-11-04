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

## Phase 2 and Phase 3 (planned rules)

| No. | Game | Planned rules |
|---|---|---|
| 07 | Pen Fight | Players take turns to flick their pen with a swipe. A pen that falls off the bench loses. Best of 3. |
| 08 | Rubber Band Shooting | Pull back and release. Hit paper targets for points. Moving targets at higher levels. Limited bands. |
| 09 | Notebook Drawing Battle | One player draws a secret word on a khata page for 60 s. The others guess. Points for fast guesses. Pass-and-play first. |
| 10 | Elonti Belonti | The caller sings "Elonti Belonti, ghori baje ting ting, 1 2 3!" with their back turned. Players move. When the caller turns, any movement sends you back to the start. First to touch the caller wins. |
| 11 | Spoon & Marble Race | Balance the marble while you run. If the marble falls, go back a set distance (or restart, by option). |
| 12 | Haari Bhanga | Blindfolded. Turn and walk by sound cues. One swing of the stick per try. Break the pot to win. |
| 13 | Paper Airplane Racing | Choose a fold, launch angle and power. Glide through rings over rooftops. Wind changes. |
| 14 | Paper Boat Racing | Steer on flowing rainwater. Avoid drains, sandals and leaves. First past the line wins. |
| 15 | Musical Chairs | Walk around the chairs while the music plays. When it stops, sit. The player without a chair is out. One chair is removed each round. |
| 16 | Sack Race | Hop on the beat. A bad hop is a fall. First to the finish wins. |
| 17 | Three-Legged Race | Two players step in sync (left-right). A mismatch is a stumble. |
| 18 | Short-Pitch Cricket | 1, 2, 3 and 4 runs are allowed. **A six is OUT.** There is no conventional six-run score. Local boundaries are configurable. |
| 19 | Tape Tennis Cricket | Street cricket with a taped tennis ball: fast bounce, swing. Configurable street boundaries. |
| 20 | Rooftop Cricket | Water tanks and parapets. Option: ball off the roof = OUT. |
| 21 | Goli Cricket | A narrow alley. Brick stumps. Wall rebounds give configurable runs. |
| 22 | Pillow Fight | Two players sit on a padded bamboo beam. Swing, block or lean. Knock the other off. |
| 23 | Kabaddi / Ha-du-du | The raider says "ha-du-du" on one breath, tags defenders and returns. Tackles, revival and the bonus line. Traditional variants are options. |
| 24 | Rooftop Badminton | High-drag shuttle; clears, drops and smashes. Optional wind. Rally scoring to 11 or 21. |
