# EDUFUSION — Gamified Learning App

## Overview
EDUFUSION is a mobile-first, single-page web application designed to make learning Philippine history and Filipino language fun through game mechanics. It runs fully offline after the first load — no internet required.

---

## Authentication
- Players enter their name on a login screen to start
- Name is saved to localStorage so returning players skip the login
- Logout clears the session and returns to the login screen

---

## Game Modes

### 📜 History Unlocked
Multiple-choice questions about Philippine history — national heroes, presidents, revolutions, battles, and key historical events. Players read a question and pick one of four answers.

### 🖼️ Guess the Image
A real photo is displayed alongside a text clue. Players identify what or who is shown by choosing from four options. Covers historical figures, national symbols, landmarks, festivals, food, and cultural icons.

### 🔤 Spell It Right
The app speaks a Filipino word aloud using text-to-speech. Players listen and select the correct spelling from four choices.

### 🔠 Missing Letters
A word is shown with letters replaced by underscores (e.g. `B_H_Y`). Players choose the complete correct word from four options.

---

## Progression System
- Each mode has **10 levels**, each with **5 questions** — 50 questions per mode, 200 total
- Levels unlock sequentially — a player must score **60% or higher** to pass and unlock the next level
- Each level awards **1–3 stars** based on performance:
  - 1 star — 60–79% (3/5 correct)
  - 2 stars — 80% (4/5 correct)
  - 3 stars — 100% (5/5 correct)
- Maximum **30 stars per mode**, **120 stars total**

---

## Scoring
Each question is worth:
- **100 points** per correct answer
- **Time bonus** — remaining seconds × 10 points
- **Streak bonus** — consecutive correct answers × 10 points

---

## Timer
Each question has a **30-second countdown**. When time runs out, the question is marked wrong and the game moves on automatically.

---

## Results Modal
After completing all 5 questions, a modal appears showing:
- Pass/fail status with emoji
- Stars earned
- Correct answers, accuracy %, time bonus, total score
- Three action buttons: **↻ Try Again**, **🏠 Dashboard**, **Next Level →**

---

## Sound Effects
Generated entirely via the Web Audio API — no sound files needed:
- ✅ Correct answer — ascending two-tone chime
- ❌ Wrong answer / time up — descending buzz
- 🎉 Level passed — four-note ascending fanfare
- 😢 Level failed — four-note descending sad tones
- Background music supported if a `bg-music.mp3` file is placed in the root folder

---

## Daily Challenge
Each day a random mode and level is assigned as the Daily Challenge, accessible from the side menu. Completing it awards bonus points.

---

## Achievements
8 unlockable badges that reward milestones:

| Badge | Requirement |
|---|---|
| 🎯 First Step | Complete your first level |
| ⚡ Speed Demon | Finish a level in under 20 seconds |
| ⭐⭐⭐ Perfect Score | Get 3 stars on any level |
| 🔥 Streak Master | Achieve a 5-answer streak |
| 🏆 All-Star Champion | Earn 50 total stars |
| ⏱️ Time Keeper | Play for 30 minutes total |
| 📚 Knowledge Seeker | Unlock 5 levels in any mode |
| 📜 History Buff | Complete all 10 History levels |

---

## Player Profile
- Upload a profile photo
- Write a personal bio
- View personal stats — games played, total correct, total stars, best streak
- Progress chart showing completion rate, stars earned, total playtime
- Activity history showing recent level results

---

## Leaderboard
Ranks all players by total score using IndexedDB, supporting multiple players on the same device.

---

## Background Themes
7 visual themes that change the app's color scheme:

| Theme | Description |
|---|---|
| 🌙 Dark Modern | Default — smooth purples and blues |
| 🌴 Tropical | Warm Filipino vibes |
| 🌌 Cosmic | Deep space mystery |
| 🌿 Emerald | Nature and growth |
| 🌅 Sunset | Warm orange tones |
| 🌊 Ocean | Cool blue waters |
| ⚡ Neon | Cyberpunk edge |

---

## Data Storage

| Storage | Used For |
|---|---|
| IndexedDB | Player progress, score history, leaderboard |
| localStorage | Player name, theme, sound setting, daily challenge, achievements |

---

## Other Features
- **Share** — uses the Web Share API to share the app link, falls back to clipboard copy
- **Reset Progress** — clears all saved data with a confirmation dialog
- **Sound toggle** — enable/disable all sound effects and background music

---

## Project Structure

```
edufusion/
├── index.html              # Main HTML — all UI sections
├── script.js               # All game logic (~900 lines)
├── style.css               # Main styles
├── enhancements.css        # Achievements and daily challenge styles
├── background-themes.css   # 7 swappable background themes
├── logo/
│   ├── edu.mp4             # Animated logo video
│   ├── guessimg.png        # Guess the Image mode logo
│   ├── historylogo.png     # History Unlocked mode logo
│   ├── spell it.png        # Spell It Right mode logo
│   └── missing.png         # Missing Letters mode logo
└── images/
    └── guess/              # 50 images for Guess the Image mode
        ├── jose-rizal.jpg
        ├── emilio-aguinaldo.jpg
        └── ...
```

---

## Developed By
**L.A.F.G & R.M.S**
📧 edufusion.app@gmail.com
🌐 www.edufusion.app

© 2026 EDUFUSION
