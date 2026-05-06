// ============================
// EDUFUSION - Gamified Learning
// Complete Game Logic (Fixed & Optimized)
// ============================

// === STATE VARIABLES ===
let playerName = localStorage.getItem("edufusionPlayer") || "";
let hasPlayedBefore = localStorage.getItem("edufusionHasPlayed") === "true";
let soundEnabled = localStorage.getItem("edufusionSound") !== "false";
let currentMode = null;
let currentLevel = null;
let currentQuestion = 0;
let correctAnswers = 0;
let streak = 0;
let currentSessionScore = 0;
let timerInterval = null;
let secondsLeft = 30;
const totalQuestions = 5;
const TOTAL_LEVELS = 10;
let answerLocked = false; // Task 4: rate limiting

// === SECURITY HELPERS (Task 1) ===
function sanitizeName(name) {
  return name.replace(/[<>"'&]/g, '').trim().slice(0, 30);
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// === ACHIEVEMENT SYSTEM ===
const GAME_MODES = ['spell', 'missing', 'history', 'guess'];
const achievements = {
  firstStep:        { id: 1, title: "First Step",        description: "Complete your first level",          icon: "🎯",      requirement: (p) => p.stats && p.stats.totalGames >= 1 },
  speedDemon:       { id: 2, title: "Speed Demon",       description: "Complete a level in under 20 seconds", icon: "⚡",     requirement: (p) => p.stats && p.stats.fastestCompletion < 20 },
  perfectScore:     { id: 3, title: "Perfect Score",     description: "Get 3 stars in any level",            icon: "⭐⭐⭐", requirement: (p) => GAME_MODES.some(m => p[m] && p[m].levels && p[m].levels.some(l => l.stars === 3)) },
  streakMaster:     { id: 4, title: "Streak Master",     description: "Achieve a 5-answer streak",           icon: "🔥",      requirement: (p) => p.stats && p.stats.bestStreak >= 5 },
  allStarChampion:  { id: 5, title: "All-Star Champion", description: "Earn 50 total stars",                 icon: "🏆",      requirement: (p) => p.stats && p.stats.totalStars >= 50 },
  timeKeeper:       { id: 6, title: "Time Keeper",       description: "Play for 30 minutes total",           icon: "⏱️",     requirement: (p) => p.stats && p.stats.totalTimePlayed >= 1800 },
  knowledgeSeeker:  { id: 7, title: "Knowledge Seeker",  description: "Unlock 5 levels in any mode",         icon: "📚",      requirement: (p) => GAME_MODES.some(m => p[m] && p[m].levels && p[m].levels.filter(l => l.unlocked).length >= 5) },
  historyBuff:      { id: 8, title: "History Buff",      description: "Complete all History levels",         icon: "📜",      requirement: (p) => p.history && Array.isArray(p.history.levels) && p.history.levels.filter(l => l.stars > 0).length === TOTAL_LEVELS }
};
let unlockedAchievements = JSON.parse(localStorage.getItem("edufusionAchievements")) || {};

function checkAchievements() {
  Object.entries(achievements).forEach(([key, achievement]) => {
    if (!unlockedAchievements[key] && achievement.requirement(progress)) {
      unlockedAchievements[key] = true;
      localStorage.setItem("edufusionAchievements", JSON.stringify(unlockedAchievements));
      showNotification(`🎉 Achievement Unlocked: ${achievement.title}!`);
    }
  });
}

function getUnlockedAchievements() {
  return Object.entries(achievements)
    .filter(([key]) => unlockedAchievements[key])
    .map(([key, achievement]) => ({ ...achievement, key }));
}

// === DAILY CHALLENGE ===
function getDailyChallenge() {
  const today = new Date().toDateString();
  const storedChallenge = JSON.parse(localStorage.getItem("edufusionDailyChallenge")) || {};
  if (storedChallenge.date === today && storedChallenge.data) {
    return storedChallenge.data;
  }
  const modes = ['history', 'guess', 'spell', 'missing'];
  const randomMode = modes[Math.floor(Math.random() * modes.length)];
  const randomLevel = Math.floor(Math.random() * 5) + 1;
  const challenge = { date: today, mode: randomMode, level: randomLevel, completed: false, reward: 100 };
  localStorage.setItem("edufusionDailyChallenge", JSON.stringify({ date: today, data: challenge }));
  return challenge;
}

function showDailyChallengeNotif() {
  const challenge = getDailyChallenge();
  if (!challenge.completed) {
    showNotification(`🌟 Daily Challenge: ${challenge.mode.toUpperCase()} Level ${challenge.level}!`);
  }
}

// === DATABASE (IndexedDB) ===
let db;
const DB_NAME = 'EduFusionDB';
const DB_VERSION = 1;

function initDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { db = request.result; resolve(db); };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('players')) db.createObjectStore('players', { keyPath: 'name' });
      if (!db.objectStoreNames.contains('scores')) {
        const store = db.createObjectStore('scores', { keyPath: 'id', autoIncrement: true });
        store.createIndex('player', 'player', { unique: false });
      }
      if (!db.objectStoreNames.contains('leaderboard')) db.createObjectStore('leaderboard', { keyPath: 'player' });
    };
  });
}

async function savePlayerData(playerName, data) {
  if (!db) await initDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['players'], 'readwrite');
    const req = tx.objectStore('players').put({ name: playerName, ...data });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadPlayerData(playerName) {
  if (!db) await initDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['players'], 'readonly');
    const req = tx.objectStore('players').get(playerName);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function saveScore(playerName, mode, level, score, stars, accuracy) {
  if (!db) await initDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['scores'], 'readwrite');
    const req = tx.objectStore('scores').add({ player: playerName, mode, level, score, stars, accuracy, timestamp: new Date().toISOString() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getPlayerScores(playerName) {
  if (!db) await initDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['scores'], 'readonly');
    const req = tx.objectStore('scores').index('player').getAll(playerName);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function updateLeaderboardRecord(playerName, totalScore, totalStars) {
  if (!db) await initDatabase();
  // Enrich leaderboard record with per-mode stars and overall stats
  const modeStars = {};
  ['history', 'guess', 'spell', 'missing'].forEach(m => {
    modeStars[m] = progress[m] ? progress[m].levels.reduce((s, l) => s + (l.stars || 0), 0) : 0;
  });
  const totalGames = progress.stats ? progress.stats.totalGames : 0;
  const totalCorrect = progress.stats ? progress.stats.totalCorrect : 0;
  const accuracy = totalGames > 0 ? Math.round((totalCorrect / (totalGames * 5)) * 100) : 0;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['leaderboard'], 'readwrite');
    const req = tx.objectStore('leaderboard').put({
      player: playerName,
      totalScore,
      totalStars,
      modeStars,
      totalGames,
      accuracy,
      lastUpdated: new Date().toISOString()
    });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getLeaderboard() {
  if (!db) await initDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['leaderboard'], 'readonly');
    const req = tx.objectStore('leaderboard').getAll();
    req.onsuccess = () => {
      const data = req.result || [];
      data.sort((a, b) => b.totalScore - a.totalScore);
      resolve(data);
    };
    req.onerror = () => reject(req.error);
  });
}

// === PROGRESS MANAGEMENT ===
function getDefaultProgress() {
  return {
    spell: { currentLevel: 1, levels: Array(TOTAL_LEVELS).fill(null).map((_, i) => ({ stars: 0, unlocked: i === 0, highScore: 0 })) },
    missing: { currentLevel: 1, levels: Array(TOTAL_LEVELS).fill(null).map((_, i) => ({ stars: 0, unlocked: i === 0, highScore: 0 })) },
    history: { currentLevel: 1, levels: Array(TOTAL_LEVELS).fill(null).map((_, i) => ({ stars: 0, unlocked: i === 0, highScore: 0 })) },
    guess: { currentLevel: 1, levels: Array(TOTAL_LEVELS).fill(null).map((_, i) => ({ stars: 0, unlocked: i === 0, highScore: 0 })) },
    stats: {
      totalGames: 0, totalCorrect: 0, totalStars: 0, bestStreak: 0,
      totalTimePlayed: 0, fastestCompletion: 30, highestScoreEver: 0, totalExperience: 0
    },
    bio: "", profilePic: "", preferences: { soundEnabled: true, showHints: true, dashboardView: "progress" },
    lastSynced: null
  };
}

// Task 2: validate loaded data structure
function isValidProgress(data) {
  return data &&
    typeof data === 'object' &&
    data.stats &&
    typeof data.stats.totalGames === 'number' &&
    data.history && Array.isArray(data.history.levels) &&
    data.spell && Array.isArray(data.spell.levels) &&
    data.guess && Array.isArray(data.guess.levels) &&
    data.missing && Array.isArray(data.missing.levels);
}

let progress = getDefaultProgress();

async function loadProgress(playerName) {
  try {
    const playerData = await loadPlayerData(playerName);
    if (playerData && isValidProgress(playerData)) {
      progress = { ...getDefaultProgress(), ...playerData };
      progress.preferences = { ...getDefaultProgress().preferences, ...progress.preferences };
      soundEnabled = progress.preferences.soundEnabled !== false;
    } else {
      progress = getDefaultProgress();
      soundEnabled = progress.preferences.soundEnabled;
    }
  } catch (error) {
    console.error('Error loading progress:', error);
    progress = getDefaultProgress();
  }
}

async function saveProgress() {
  try {
    progress.preferences.soundEnabled = soundEnabled;
    await savePlayerData(playerName, progress);
    await updateLeaderboardRecord(playerName, progress.stats.totalCorrect * 10 + progress.stats.totalStars * 50, progress.stats.totalStars);
  } catch (error) {
    console.error('Error saving progress:', error);
  }
}

function updateModeStats() {
  ['spell', 'missing', 'history', 'guess'].forEach(mode => {
    const totalStars = progress[mode].levels.reduce((sum, l) => sum + (l.stars || 0), 0);
    const unlocked = progress[mode].levels.filter(l => l.unlocked).length;
    const el = document.getElementById(`${mode}-total-stars`);
    const el2 = document.getElementById(`${mode}-unlocked`);
    if (el) el.innerText = totalStars;
    if (el2) el2.innerText = unlocked;
  });
  updateScoreDisplays();
}

function updateScoreDisplays() {
  const highScoreEl = document.getElementById('high-score-display');
  if (highScoreEl) highScoreEl.innerText = `🏆 ${progress.stats.highestScoreEver || 0}`;
}

function createProgressChart() {
  const totalPossibleStars = TOTAL_LEVELS * 4 * 3;
  const earnedStars = ['spell', 'missing', 'history', 'guess']
    .reduce((sum, mode) => sum + progress[mode].levels.reduce((s, l) => s + (l.stars || 0), 0), 0);
  const playedLevels = ['spell', 'missing', 'history', 'guess']
    .reduce((sum, mode) => sum + progress[mode].levels.filter(l => l.stars > 0).length, 0);
  const completionRate = Math.round((playedLevels / (TOTAL_LEVELS * 4)) * 100);

  return `
    <div class="dashboard-chart-grid">
      <div class="chart-card"><h4>Progress</h4><div class="chart-bar"><div class="chart-bar-fill" style="width:${completionRate}%"></div></div><span>${completionRate}% levels unlocked</span></div>
      <div class="chart-card"><h4>Stars Earned</h4><div class="chart-circle" data-value="${earnedStars}"><span>${earnedStars}</span></div><span>out of ${totalPossibleStars}</span></div>
      <div class="chart-card"><h4>Total PlayTime</h4><div class="chart-mini"><span>${Math.round(progress.stats.totalTimePlayed / 60)} min</span></div><span>Time spent playing</span></div>
      <div class="chart-card"><h4>Best Streak</h4><div class="chart-mini"><span>🔥 ${progress.stats.bestStreak}</span></div><span>Longest combo</span></div>
    </div>
  `;
}

function renderProfileDashboard() {
  const profilePicUrl = progress.profilePic || "";
  const bioText = progress.bio || "";
  const unlockedBadges = getUnlockedAchievements();
  const totalAchievements = Object.keys(achievements).length;
  const totalStars = progress.stats.totalStars;
  const totalGames = progress.stats.totalGames;
  const bestStreak = progress.stats.bestStreak;
  const accuracy = totalGames > 0
    ? Math.round((progress.stats.totalCorrect / (totalGames * 5)) * 100)
    : 0;

  return `
    <div class="profile-dashboard">

      <!-- Hero Banner -->
      <div class="profile-hero">
        <div class="profile-hero-bg"></div>
        <div class="profile-hero-content">
          <div class="profile-avatar-wrap">
            <div class="profile-avatar-ring">
              ${profilePicUrl
                ? `<img src="${profilePicUrl}" class="profile-avatar-img">`
                : `<div class="profile-avatar-initials">${escapeHtml(playerName.charAt(0).toUpperCase())}</div>`}
            </div>
            <button class="profile-upload-btn" onclick="document.getElementById('profile-picture-input').click()" title="Change photo">
              📷
            </button>
          </div>
          <div class="profile-hero-info">
            <h2 class="profile-hero-name">${escapeHtml(playerName)}</h2>
            <p class="profile-hero-role">🎓 Edugamer</p>
            <div class="profile-hero-badges">
              <span class="hero-badge-pill">⭐ ${totalStars} Stars</span>
              <span class="hero-badge-pill">🎮 ${totalGames} Games</span>
              <span class="hero-badge-pill">🎯 ${accuracy}% Accuracy</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Bio Card -->
      <div class="profile-bio-card">
        <div class="profile-bio-header">
          <span class="profile-bio-icon">✏️</span>
          <span>About Me</span>
        </div>
        <p class="profile-bio-text">${bioText || '<span style="opacity:0.45">Share a short bio about your learning goals...</span>'}</p>
        <textarea id="profile-bio-input" class="profile-textarea" placeholder="Write something about yourself...">${progress.bio || ''}</textarea>
        <div class="profile-bio-actions">
          <button class="btn-primary profile-save-btn" onclick="saveProfileBio()">💾 Save Bio</button>
          <button class="btn-secondary profile-sound-btn" onclick="toggleSound()">${soundEnabled ? '🔊 Sound On' : '🔇 Sound Off'}</button>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="profile-stats-grid">
        <div class="profile-stat-card stat-purple">
          <div class="stat-card-icon">🎮</div>
          <div class="stat-card-value">${totalGames}</div>
          <div class="stat-card-label">Games Played</div>
        </div>
        <div class="profile-stat-card stat-gold">
          <div class="stat-card-icon">⭐</div>
          <div class="stat-card-value">${totalStars}</div>
          <div class="stat-card-label">Total Stars</div>
        </div>
        <div class="profile-stat-card stat-green">
          <div class="stat-card-icon">✅</div>
          <div class="stat-card-value">${progress.stats.totalCorrect}</div>
          <div class="stat-card-label">Correct Answers</div>
        </div>
        <div class="profile-stat-card stat-red">
          <div class="stat-card-icon">🔥</div>
          <div class="stat-card-value">${bestStreak}</div>
          <div class="stat-card-label">Best Streak</div>
        </div>
        <div class="profile-stat-card stat-blue">
          <div class="stat-card-icon">🎯</div>
          <div class="stat-card-value">${accuracy}%</div>
          <div class="stat-card-label">Accuracy</div>
        </div>
        <div class="profile-stat-card stat-teal">
          <div class="stat-card-icon">⏱️</div>
          <div class="stat-card-value">${Math.round(progress.stats.totalTimePlayed / 60)}</div>
          <div class="stat-card-label">Minutes Played</div>
        </div>
      </div>

      <!-- Achievements -->
      <div class="profile-section-card">
        <div class="profile-section-title">
          <span>🏅 Achievements</span>
          <span class="profile-section-count">${unlockedBadges.length}/${totalAchievements}</span>
        </div>
        <div class="achievements-grid">
          ${Object.entries(achievements).map(([key, ach]) => {
            const unlocked = unlockedAchievements[key];
            return `
              <div class="achievement-badge ${unlocked ? 'unlocked' : 'locked'}">
                <div class="badge-icon">${ach.icon}</div>
                <div class="badge-title">${ach.title}</div>
                <div class="badge-desc">${ach.description}</div>
                ${unlocked ? '<div class="badge-check">✓</div>' : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Progress Chart -->
      <div class="profile-section-card">
        <div class="profile-section-title"><span>📊 Progress Overview</span></div>
        ${createProgressChart()}
      </div>

      <!-- Activity History -->
      <div class="profile-section-card">
        <div class="profile-section-title">
          <span>📋 Activity History</span>
          <button class="profile-refresh-btn" onclick="loadActivityHistory()">↻ Refresh</button>
        </div>
        <div id="activity-history-content" class="activity-history-content">
          <div class="activity-empty"><span>⏳</span><p>Play a level to see your activity history here.</p></div>
        </div>
      </div>

      <input type="file" id="profile-picture-input" accept="image/*" class="hidden" onchange="uploadProfilePicture(event)">
    </div>
  `;
}

function showProfile() {
  closeMenu();
  hideAllSections();
  showSection("profile-section");
  document.getElementById("profile-content").innerHTML = renderProfileDashboard();
  updateMenuProfile();
  loadActivityHistory();
}

async function saveProfileBio() {
  const textarea = document.getElementById('profile-bio-input');
  if (!textarea) return;
  progress.bio = textarea.value.trim();
  await saveProgress();
  document.querySelector('.profile-bio-text').innerText = progress.bio || 'Share a short bio about your learning goals...';
  showNotification('Bio saved! 💾');
}

async function uploadProfilePicture(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  // Task 3: validate file type and size
  if (!file.type.startsWith('image/')) {
    showNotification('Only image files are allowed 🖼️');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showNotification('Image must be under 2MB 📦');
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    progress.profilePic = reader.result;
    await saveProgress();
    showProfile();
    showNotification('Profile picture updated! 📸');
  };
  reader.readAsDataURL(file);
}

async function loadActivityHistory() {
  const historyContainer = document.getElementById('activity-history-content');
  if (!historyContainer) return;
  try {
    const scores = await getPlayerScores(playerName);
    if (!scores.length) {
      historyContainer.innerHTML = `<div class="activity-empty"><span>🕹️</span><p>Complete a level and come back to track your history.</p></div>`;
      return;
    }
    const rows = scores.slice(-8).reverse().map(entry => `
      <div class="history-row">
        <div><strong>${entry.mode.toUpperCase()}</strong><p>Level ${entry.level} • ${new Date(entry.timestamp).toLocaleDateString()}</p></div>
        <div class="history-score"><span>${entry.stars} ⭐</span><span>${Math.round(entry.accuracy)}%</span></div>
      </div>
    `).join('');
    historyContainer.innerHTML = `<div class="activity-list">${rows}</div>`;
  } catch (error) {
    historyContainer.innerHTML = `<div class="activity-empty"><span>❌</span><p>Unable to load history right now.</p></div>`;
  }
}

// === LOGIN / AUTH ===

// PIN state
let _pinBuffer = '';
let _pinMode = 'enter';      // 'enter' | 'create' | 'confirm'
let _pinConfirmHash = '';    // hash stored during creation confirm step
let _pendingName = '';       // name waiting for PIN verification

async function hashPin(pin) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode('edufusion:' + pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getStoredPinHash(name) {
  try {
    const data = await loadPlayerData(name);
    return (data && data.pinHash) ? data.pinHash : null;
  } catch { return null; }
}

async function storePinHash(name, hash) {
  try {
    const data = await loadPlayerData(name) || {};
    await savePlayerData(name, { ...data, pinHash: hash });
  } catch (e) { console.error('Error storing PIN:', e); }
}

// Step 1 — name entry
async function loginStepName() {
  const input = document.getElementById("player-name-input");
  const rawName = input.value.trim();
  if (!rawName) {
    input.style.borderColor = "#ff4757";
    input.placeholder = "Please enter your name! 😊";
    input.focus();
    setTimeout(() => { input.style.borderColor = ""; input.placeholder = "Enter your name..."; }, 2000);
    return;
  }
  _pendingName = sanitizeName(rawName);
  const existingHash = await getStoredPinHash(_pendingName);

  if (existingHash) {
    // Returning player — ask for PIN
    _pinMode = 'enter';
    document.getElementById('pin-greeting').textContent = `Welcome back, ${_pendingName}! 👋`;
    document.getElementById('pin-label').textContent = 'Enter your 4-digit PIN';
    document.getElementById('pin-forgot-btn').classList.remove('hidden');
  } else {
    // New player — create PIN
    _pinMode = 'create';
    document.getElementById('pin-greeting').textContent = `Hi, ${_pendingName}! 👋`;
    document.getElementById('pin-label').textContent = 'Create a 4-digit PIN to protect your account';
    document.getElementById('pin-forgot-btn').classList.add('hidden');
  }

  _pinBuffer = '';
  _pinConfirmHash = '';
  updatePinDots();
  clearPinError();
  document.getElementById('login-step-name').classList.add('hidden');
  document.getElementById('login-step-pin').classList.remove('hidden');
}

// PIN keypad handlers
function pinKey(digit) {
  if (_pinBuffer.length >= 4) return;
  _pinBuffer += digit;
  updatePinDots();
  clearPinError();
  if (_pinBuffer.length === 4) {
    setTimeout(handlePinComplete, 120); // slight delay so last dot animates
  }
}

function pinDelete() {
  if (_pinBuffer.length === 0) return;
  _pinBuffer = _pinBuffer.slice(0, -1);
  updatePinDots();
  clearPinError();
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('pd' + i);
    if (!dot) continue;
    dot.classList.toggle('filled', i < _pinBuffer.length);
  }
}

function showPinError(msg) {
  const el = document.getElementById('pin-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  // Shake the dots
  const dots = document.getElementById('pin-dots');
  dots.classList.remove('pin-shake');
  void dots.offsetWidth;
  dots.classList.add('pin-shake');
}

function clearPinError() {
  const el = document.getElementById('pin-error');
  el.classList.add('hidden');
  el.textContent = '';
}

async function handlePinComplete() {
  const enteredHash = await hashPin(_pinBuffer);

  if (_pinMode === 'enter') {
    // Verify against stored hash
    const storedHash = await getStoredPinHash(_pendingName);
    if (enteredHash === storedHash) {
      finishLogin();
    } else {
      _pinBuffer = '';
      updatePinDots();
      showPinError('Wrong PIN. Try again.');
    }

  } else if (_pinMode === 'create') {
    // Store hash and ask to confirm
    _pinConfirmHash = enteredHash;
    _pinMode = 'confirm';
    _pinBuffer = '';
    updatePinDots();
    document.getElementById('pin-label').textContent = 'Confirm your PIN';

  } else if (_pinMode === 'confirm') {
    if (enteredHash === _pinConfirmHash) {
      await storePinHash(_pendingName, enteredHash);
      finishLogin();
    } else {
      // Mismatch — restart creation
      _pinMode = 'create';
      _pinConfirmHash = '';
      _pinBuffer = '';
      updatePinDots();
      document.getElementById('pin-label').textContent = 'Create a 4-digit PIN to protect your account';
      showPinError("PINs didn't match. Try again.");
    }
  }
}

function loginBackToName() {
  _pinBuffer = '';
  _pendingName = '';
  _pinMode = 'enter';
  clearPinError();
  document.getElementById('login-step-pin').classList.add('hidden');
  document.getElementById('login-step-name').classList.remove('hidden');
  document.getElementById('player-name-input').value = '';
  document.getElementById('player-name-input').focus();
}

function pinForgot() {
  showConfirm(
    '🔑 Forgot PIN?',
    `To reset your PIN, your progress for "${_pendingName}" will be permanently deleted. Continue?`,
    'Reset & Continue',
    async () => {
      closeConfirm();
      // Wipe player data and start fresh
      try {
        if (!db) await initDatabase();
        await new Promise((res, rej) => {
          const tx = db.transaction(['players', 'leaderboard'], 'readwrite');
          tx.objectStore('players').delete(_pendingName);
          tx.objectStore('leaderboard').delete(_pendingName);
          tx.oncomplete = res;
          tx.onerror = rej;
        });
      } catch (e) { console.error('Error wiping player:', e); }
      _pinMode = 'create';
      _pinBuffer = '';
      _pinConfirmHash = '';
      updatePinDots();
      clearPinError();
      document.getElementById('pin-label').textContent = 'Create a new 4-digit PIN';
      document.getElementById('pin-forgot-btn').classList.add('hidden');
    }
  );
}

function finishLogin() {
  playerName = _pendingName;
  localStorage.setItem("edufusionPlayer", playerName);
  loadProgress(playerName).then(() => {
    document.getElementById("login-overlay").classList.add("hidden");
    document.getElementById("main-content").classList.remove("hidden");
    updateMenuProfile();
    updateModeStats();
    if (!hasPlayedBefore) {
      const greeting = document.getElementById("greeting");
      greeting.innerText = `Hello, ${escapeHtml(playerName)}! 👋 Choose a mode to start!`;
      greeting.classList.remove("hidden");
    }
    showOnboarding();
  }).catch(error => {
    console.error('Error loading progress:', error);
    progress = getDefaultProgress();
    document.getElementById("login-overlay").classList.add("hidden");
    document.getElementById("main-content").classList.remove("hidden");
    updateMenuProfile();
    updateModeStats();
    showOnboarding();
  });
}

async function logout() {
  closeMenu();
  await saveProgress().catch(e => console.error(e));
  hasPlayedBefore = false;
  playerName = "";
  _pendingName = '';
  _pinBuffer = '';
  localStorage.removeItem("edufusionPlayer");
  localStorage.removeItem("edufusionHasPlayed");
  stopTimer();
  document.getElementById("main-content").classList.add("hidden");
  // Reset login to step 1
  document.getElementById('login-step-pin').classList.add('hidden');
  document.getElementById('login-step-name').classList.remove('hidden');
  document.getElementById("player-name-input").value = "";
  document.getElementById("login-overlay").classList.remove("hidden");
  hideAllSections();
}

function markAsPlayed() {
  if (!hasPlayedBefore) {
    hasPlayedBefore = true;
    localStorage.setItem("edufusionHasPlayed", "true");
    const greeting = document.getElementById("greeting");
    greeting.classList.add("hidden");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const loginInput = document.getElementById("player-name-input");
  if (loginInput) loginInput.addEventListener("keypress", (e) => { if (e.key === "Enter") loginStepName(); });
});

// === UI NAVIGATION ===
function hideAllSections() {
  ["modes", "levels-area", "game-area", "leaderboard-section", "profile-section", "contact-section", "daily-challenge-section", "theme-selector-section"].forEach(id => {
    document.getElementById(id).classList.add("hidden");
  });
  // Remove results overlay if present
  const rs = document.getElementById("results-screen");
  if (rs) rs.remove();
}

// Task 9: animated section reveal
function showSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('hidden');
  el.classList.remove('section-enter');
  void el.offsetWidth; // force reflow
  el.classList.add('section-enter');
}

// === HOW TO PLAY MECHANICS ===
const mechanicsData = {
  history: {
    icon: '📜',
    title: 'History Unlocked',
    color: '#ffa94d',
    steps: [
      { icon: '❓', text: 'Read the history question carefully' },
      { icon: '💡', text: 'Tap "Show Hint" for a clue if you need help' },
      { icon: '✅', text: 'Choose the correct answer from 4 options' },
      { icon: '⏱️', text: 'Answer within 30 seconds to earn a time bonus' },
      { icon: '🔥', text: 'Build a streak by answering correctly in a row' },
      { icon: '⭐', text: 'Score 60% or higher to pass and unlock the next level' }
    ]
  },
  guess: {
    icon: '🖼️',
    title: 'Guess the Image',
    color: '#667eea',
    steps: [
      { icon: '🔍', text: 'Study the photo shown on screen' },
      { icon: '💡', text: 'Read the text clue below the image' },
      { icon: '✅', text: 'Choose the correct answer from 4 options' },
      { icon: '⏱️', text: 'Answer within 30 seconds to earn a time bonus' },
      { icon: '🔥', text: 'Build a streak by answering correctly in a row' },
      { icon: '⭐', text: 'Score 60% or higher to pass and unlock the next level' }
    ]
  },
  spell: {
    icon: '🔤',
    title: 'Spell It Right',
    color: '#2ed573',
    steps: [
      { icon: '🔊', text: 'Tap the speaker button to hear the Filipino word' },
      { icon: '👂', text: 'Listen carefully — you can tap it multiple times' },
      { icon: '✅', text: 'Choose the correct spelling from 4 options' },
      { icon: '⏱️', text: 'Answer within 30 seconds to earn a time bonus' },
      { icon: '🔥', text: 'Build a streak by answering correctly in a row' },
      { icon: '⭐', text: 'Score 60% or higher to pass and unlock the next level' }
    ]
  },
  missing: {
    icon: '🔠',
    title: 'Missing Letters',
    color: '#f093fb',
    steps: [
      { icon: '🖼️', text: 'Look at the image hint showing what the word means' },
      { icon: '🔡', text: 'Study the word pattern with missing letters (e.g. B_H_Y)' },
      { icon: '✅', text: 'Choose the complete correct word from 4 options' },
      { icon: '⏱️', text: 'Answer within 30 seconds to earn a time bonus' },
      { icon: '🔥', text: 'Build a streak by answering correctly in a row' },
      { icon: '⭐', text: 'Score 60% or higher to pass and unlock the next level' }
    ]
  }
};

function showMechanics(mode) {
  const data = mechanicsData[mode];
  if (!data) return;
  document.getElementById('mechanics-content').innerHTML = `
    <div class="mechanics-header" style="border-color: ${data.color}40">
      <div class="mechanics-icon" style="background: ${data.color}20; border-color: ${data.color}40">${data.icon}</div>
      <h2 style="color: ${data.color}">${data.title}</h2>
      <p class="mechanics-subtitle">How to Play</p>
    </div>
    <div class="mechanics-steps">
      ${data.steps.map((s, i) => `
        <div class="mechanics-step" style="animation-delay: ${i * 0.07}s">
          <div class="step-icon">${s.icon}</div>
          <div class="step-text">${s.text}</div>
        </div>
      `).join('')}
    </div>
    <button class="btn-primary mechanics-play-btn" onclick="closeMechanics(); showLevels('${mode}')">
      Play Now →
    </button>
  `;
  document.getElementById('mechanics-modal').classList.remove('hidden');
}

function closeMechanics() {
  document.getElementById('mechanics-modal').classList.add('hidden');
}

function showLevels(mode) {
  currentMode = mode;
  markAsPlayed();
  hideAllSections();
  showSection("levels-area");
  const modeNames = { spell: "🔤 Spell It Right", missing: "🔠 Missing Letters", history: "📜 History Unlocked", guess: "🖼️ Guess the Image" };
  document.getElementById("level-title").innerText = modeNames[mode];
  const completed = progress[mode].levels.filter(l => l.stars > 0).length;
  const percentage = Math.round((completed / TOTAL_LEVELS) * 100);
  document.getElementById("mode-percentage").innerText = percentage + "%";
  document.getElementById("progress-circle").setAttribute("stroke-dasharray", `${percentage}, 100`);
  renderLevels();
}

function renderLevels() {
  const grid = document.getElementById("levels-grid");
  grid.innerHTML = "";
  for (let i = 0; i < TOTAL_LEVELS; i++) {
    const levelData = progress[currentMode].levels[i] || { stars: 0, unlocked: false, highScore: 0 };
    const btn = document.createElement("button");
    btn.className = "level-btn";
    if (levelData.unlocked) {
      btn.classList.add("unlocked");
      if (levelData.stars === 3) {
        btn.classList.add("completed");
      }
      // Mark as current: the next level to beat (lowest unlocked with < 3 stars)
      const isCurrent = (i + 1 === progress[currentMode].currentLevel) ||
                        (!levelData.stars && levelData.unlocked);
      if (isCurrent && levelData.stars < 3) {
        btn.classList.add("current");
        btn.innerHTML = `
          <span class="current-badge">NEXT</span>
          <span class="level-num">${i + 1}</span>
          <span class="stars-display">${"⭐".repeat(levelData.stars || 0)}</span>
        `;
        btn.onclick = () => startLevel(i + 1);
        grid.appendChild(btn);
        continue;
      }
      btn.innerHTML = `<span class="level-num">${i + 1}</span><span class="stars-display">${"⭐".repeat(levelData.stars || 0)}</span>`;
      btn.onclick = () => startLevel(i + 1);
    } else {
      btn.classList.add("locked");
      btn.innerHTML = `<span class="lock-num">${i + 1}</span><span class="lock-icon">🔒</span>`;
      btn.disabled = true;
    }
    grid.appendChild(btn);
  }
}

function goBackToModes() {
  stopTimer();
  hideResultsModal();
  hideAllSections();
  showSection("modes");
  currentMode = null;
  currentLevel = null;
  updateModeStats();
}

function goBackToLevels() {
  stopTimer();
  hideAllSections();
  showSection("levels-area");
  if (currentMode) renderLevels();
}

// === GAME LOGIC ===
const gameData = {
  history: { levels: [
    { questions: [ { type: "history", question: "Who was the first president of the Philippines?", answer: "Emilio Aguinaldo", hint: "He led the Philippine Revolution and declared independence in Kawit, Cavite.", options:["Emilio Aguinaldo", "Manuel Quezon", "Jose Rizal", "Andres Bonifacio"] }, { type: "history", question: "When did the Philippines gain independence?", answer: "June 12, 1898", hint: "This date is celebrated as Philippine Independence Day every year.", options:["June 12, 1898", "July 4, 1776", "May 1, 1898", "August 21, 1983"] }, { type: "history", question: "Who is the national hero of the Philippines?", answer: "Jose Rizal", hint: "He was executed at Bagumbayan and wrote two famous novels.", options:["Jose Rizal", "Andres Bonifacio", "Emilio Aguinaldo", "Apolinario Mabini"] }, { type: "history", question: "Who wrote the novel Noli Me Tangere?", answer: "Jose Rizal", hint: "This novel exposed the abuses of Spanish colonial rule.", options:["Jose Rizal", "Marcelo H. del Pilar", "Graciano Lopez Jaena", "Andres Bonifacio"] }, { type: "history", question: "Who was the leader of the Katipunan?", answer: "Andres Bonifacio", hint: "He founded the secret revolutionary society Katipunan in 1892.", options:["Andres Bonifacio", "Emilio Aguinaldo", "Jose Rizal", "Apolinario Mabini"] } ] },
    { questions: [ { type: "history", question: "When did Magellan arrive in the Philippines?", answer: "1521", hint: "He arrived during the first circumnavigation of the globe.", options:["1521", "1565", "1898", "1946"] }, { type: "history", question: "What was the revolution against Spain called?", answer: "Revolution", hint: "It was sparked by the Katipunan's uprising against Spanish rule.", options:["Revolution", "Uprising", "Rebellion", "War"] }, { type: "history", question: "Who was the first female president of the Philippines?", answer: "Corazon Aquino", hint: "She came to power after the 1986 People Power Revolution.", options:["Corazon Aquino", "Gloria Macapagal-Arroyo", "Imelda Marcos", "Miriam Defensor"] }, { type: "history", question: "What was the name of Magellan's ship?", answer: "Victoria", hint: "It was the only ship from Magellan's fleet to complete the voyage.", options:["Victoria", "Trinidad", "San Antonio", "Concepcion"] }, { type: "history", question: "Who wrote the epic Florante at Laura?", answer: "Francisco Balagtas", hint: "He wrote this Tagalog masterpiece while imprisoned in Bataan.", options:["Francisco Balagtas", "Jose Rizal", "Andres Bonifacio", "Apolinario Mabini"] } ] },
    { questions: [ { type: "history", question: "When was the Battle of Mactan?", answer: "April 27, 1521", hint: "Lapu-Lapu defeated Magellan on this date in Cebu.", options:["April 27, 1521", "May 1, 1521", "June 12, 1521", "July 4, 1521"] }, { type: "history", question: "Who was executed at Bagumbayan?", answer: "Jose Rizal", hint: "He was shot by a firing squad at age 35 on December 30, 1896.", options:["Jose Rizal", "Andres Bonifacio", "Gomburza", "Antonio Luna"] }, { type: "history", question: "Who was the last ruler of Manila?", answer: "Rajah Sulayman", hint: "He was the Muslim ruler of Maynila before the Spanish conquest.", options:["Rajah Sulayman", "Lapu-Lapu", "Rajah Matanda", "Rajah Humabon"] }, { type: "history", question: "Who wrote the novel El Filibusterismo?", answer: "Jose Rizal", hint: "This sequel to Noli Me Tangere depicted a planned revolution.", options:["Jose Rizal", "Marcelo H. del Pilar", "Graciano Lopez Jaena", "Antonio Luna"] }, { type: "history", question: "Who is known as the Father of the National Language?", answer: "Manuel L. Quezon", hint: "He established Filipino as the national language and was the first Commonwealth president.", options:["Manuel L. Quezon", "Jose Rizal", "Andres Bonifacio", "Emilio Aguinaldo"] } ] },
    { questions: [ { type: "history", question: "When did American occupation end?", answer: "July 4, 1946", hint: "The US granted independence on this date, also American Independence Day.", options:["July 4, 1946", "June 12, 1898", "May 1, 1898", "August 21, 1983"] }, { type: "history", question: "Who was the president during Martial Law?", answer: "Ferdinand Marcos", hint: "He declared Martial Law in 1972 and ruled for over 20 years.", options:["Ferdinand Marcos", "Corazon Aquino", "Fidel Ramos", "Joseph Estrada"] }, { type: "history", question: "What was the People Power Revolution called?", answer: "EDSA Revolution", hint: "Millions gathered on Epifanio de los Santos Avenue in 1986.", options:["EDSA Revolution", "Civil War", "Coup d'etat", "Protest"] }, { type: "history", question: "Who was Jose Rizal's wife?", answer: "Josephine Bracken", hint: "She was an Irish woman Rizal met in Dapitan during his exile.", options:["Josephine Bracken", "Leonor Rivera", "Segunda Katigbak", "Consuelo Ortiga"] }, { type: "history", question: "Who wrote the lyrics of Lupang Hinirang?", answer: "Jose Palma", hint: "He wrote the Spanish lyrics to the tune composed by Julian Felipe.", options:["Jose Palma", "Jose Rizal", "Andres Bonifacio", "Julian Felipe"] } ] },
    { questions: [ { type: "history", question: "Who killed Antonio Luna?", answer: "General Mascardo's men", hint: "Luna was killed at the Cabanatuan convent in June 1899.", options:["General Mascardo's men", "Emilio Aguinaldo", "Manuel Quezon", "Miguel Malvar"] }, { type: "history", question: "What was the first name of the Philippines?", answer: "Las Islas Filipinas", hint: "The islands were named after King Philip II of Spain.", options:["Las Islas Filipinas", "Maharlika", "Filipinas", "Pearl of the Orient"] }, { type: "history", question: "Who was the first female writer in the Philippines?", answer: "Leona Florentino", hint: "She was an Ilocana poet whose works were published in Europe.", options:["Leona Florentino", "Jose Rizal", "Marcelo H. del Pilar", "Graciano Lopez Jaena"] }, { type: "history", question: "What was the old education system called?", answer: "Caton", hint: "It was a primer used to teach children reading and prayers during Spanish rule.", options:["Caton", "Escuela", "Universidad", "Colegio"] }, { type: "history", question: "What were Chinese traders called?", answer: "Sangleys", hint: "This term came from a Hokkien word meaning 'to do business.'", options:["Sangleys", "Mestizo", "Indio", "Principalia"] } ] },
    { questions: [ { type: "history", question: "Who led the Cry of Pugad Lawin?", answer: "Andres Bonifacio", hint: "He tore his cedula (tax certificate) to signal the start of the revolution.", options:["Andres Bonifacio", "Emilio Aguinaldo", "Melchora Aquino", "Pio Valenzuela"] }, { type: "history", question: "When was the Cry of Balintawak?", answer: "August 26, 1896", hint: "This event marked the beginning of the Philippine Revolution against Spain.", options:["August 26, 1896", "August 23, 1896", "September 1, 1896", "July 7, 1896"] }, { type: "history", question: "Who was Melchora Aquino?", answer: "Tandang Sora", hint: "She was called the 'Mother of the Katipunan' and nursed wounded rebels.", options:["Tandang Sora", "Leona Florentino", "Josephine Bracken", "Gabriela Silang"] }, { type: "history", question: "Who was the general known for Biak-na-Bato?", answer: "Emilio Aguinaldo", hint: "He signed the Pact of Biak-na-Bato and went into exile in Hong Kong.", options:["Emilio Aguinaldo", "Antonio Luna", "Miguel Malvar", "Gregorio del Pilar"] }, { type: "history", question: "What was the first republic in the Philippines?", answer: "Republic of Biak-na-Bato", hint: "It was established in 1897 in the mountains of San Miguel, Bulacan.", options:["Republic of Biak-na-Bato", "First Republic", "Malolos Republic", "Commonwealth"] } ] },
    { questions: [ { type: "history", question: "Who founded La Liga Filipina?", answer: "Jose Rizal", hint: "This civic organization promoted unity and self-reliance among Filipinos.", options:["Jose Rizal", "Andres Bonifacio", "Marcelo H. del Pilar", "Antonio Luna"] }, { type: "history", question: "Who was called the 'Brains of the Katipunan'?", answer: "Emilio Jacinto", hint: "He wrote the Kartilya ng Katipunan, the moral code of the revolution.", options:["Emilio Jacinto", "Andres Bonifacio", "Apolinario Mabini", "Jose Rizal"] }, { type: "history", question: "What was the weapon of the Katipunan?", answer: "Bolo", hint: "This long Filipino knife was the primary weapon of Katipunan fighters.", options:["Bolo", "Rifle", "Sword", "Bow"] }, { type: "history", question: "Who was called the 'Sublime Paralytic'?", answer: "Apolinario Mabini", hint: "He was paralyzed from the waist down but served as Aguinaldo's chief adviser.", options:["Apolinario Mabini", "Jose Rizal", "Emilio Jacinto", "Antonio Luna"] }, { type: "history", question: "Who was the youngest general in the Philippines?", answer: "Gregorio del Pilar", hint: "He died at the Battle of Tirad Pass at only 24 years old.", options:["Gregorio del Pilar", "Emilio Aguinaldo", "Antonio Luna", "Miguel Malvar"] } ] },
    { questions: [ { type: "history", question: "What was the name of the 1899 Constitution?", answer: "Malolos Constitution", hint: "It was the first democratic constitution in Asia, ratified in Malolos, Bulacan.", options:["Malolos Constitution", "1935 Constitution", "1987 Constitution", "Commonwealth Constitution"] }, { type: "history", question: "Who was the first president of the Commonwealth?", answer: "Manuel L. Quezon", hint: "He took his oath as Commonwealth president in 1935 under the new constitution.", options:["Manuel L. Quezon", "Sergio Osmeña", "Manuel Roxas", "Jose P. Laurel"] }, { type: "history", question: "Where did the Death March take place?", answer: "Bataan", hint: "Thousands of Filipino and American soldiers were forced to march 65 miles in 1942.", options:["Bataan", "Corregidor", "Manila", "Zambales"] }, { type: "history", question: "When did MacArthur return to the Philippines?", answer: "1944", hint: "He waded ashore at Leyte Gulf and fulfilled his famous promise.", options:["1944", "1942", "1945", "1941"] }, { type: "history", question: "What did MacArthur say when he left the Philippines?", answer: "I shall return", hint: "MacArthur said this when he left the Philippines for Australia in 1942.", options:["I shall return", "I will be back", "We shall fight", "Victory is ours"] } ] },
    { questions: [ { type: "history", question: "Who is called the 'Father of Ilocano Literature'?", answer: "Pedro Bucaneg", hint: "He was a blind poet who helped translate the Christian Doctrina into Ilocano.", options:["Pedro Bucaneg", "Francisco Balagtas", "Jose Rizal", "Leona Florentino"] }, { type: "history", question: "Who invented the jeepney?", answer: "Leonardo Sarao", hint: "He converted surplus US Army jeeps into colorful passenger vehicles after WWII.", options:["Leonardo Sarao", "Andres Bonifacio", "Jose Rizal", "Ferdinand Marcos"] }, { type: "history", question: "What is the national anthem of the Philippines?", answer: "Lupang Hinirang", hint: "Its music was composed by Julian Felipe and first played in 1898.", options:["Lupang Hinirang", "Bayan Ko", "Pilipinas Kong Mahal", "Ako ay Pilipino"] }, { type: "history", question: "When did the Philippines become independent from America?", answer: "July 4, 1946", hint: "Manuel Roxas was the first president of the independent Third Republic.", options:["July 4, 1946", "June 12, 1898", "June 12, 1946", "January 23, 1899"] }, { type: "history", question: "Who was president during EDSA People Power?", answer: "Corazon Aquino", hint: "She became president after Marcos fled to Hawaii following the People Power revolt.", options:["Corazon Aquino", "Ferdinand Marcos", "Fidel Ramos", "Joseph Estrada"] } ] },
    { questions: [ { type: "history", question: "Who was called the 'Hero of the Philippine Revolution'?", answer: "Emilio Aguinaldo", hint: "He proclaimed Philippine independence and led the First Philippine Republic.", options:["Emilio Aguinaldo", "Andres Bonifacio", "Jose Rizal", "Antonio Luna"] }, { type: "history", question: "Who was the founder of the Katipunan?", answer: "Andres Bonifacio", hint: "He established the Katipunan on July 7, 1892 in Tondo, Manila.", options:["Andres Bonifacio", "Emilio Jacinto", "Jose Rizal", "Emilio Aguinaldo"] }, { type: "history", question: "Who won the Philippine-American War?", answer: "America", hint: "The war ended with the Treaty of Paris in 1898 transferring the Philippines to the US.", options:["America", "Philippines", "Spain", "Japan"] }, { type: "history", question: "What was the original language of the national anthem?", answer: "Spanish", hint: "The original lyrics 'Filipinas' were written by Jose Palma in Spanish.", options:["Spanish", "Filipino", "English", "Tagalog"] }, { type: "history", question: "Who was the female leader of Ilocos?", answer: "Gabriela Silang", hint: "She continued her husband Diego's revolt after he was assassinated in 1763.", options:["Gabriela Silang", "Melchora Aquino", "Leona Florentino", "Josephine Bracken"] } ] }
  ]},
  guess: { levels: [
    { questions: [ { type: "guess", answer: "Jose Rizal", hint: "National Hero of the Philippines", image: "images/guess/jose-rizal.jpg", options:["Jose Rizal", "Andres Bonifacio", "Emilio Aguinaldo", "Apolinario Mabini"] }, { type: "guess", answer: "Emilio Aguinaldo", hint: "First President of the Philippines", image: "images/guess/emilio-aguinaldo.jpg", options:["Emilio Aguinaldo", "Manuel Quezon", "Jose Rizal", "Andres Bonifacio"] }, { type: "guess", answer: "Andres Bonifacio", hint: "Supremo of the Katipunan", image: "images/guess/andres-bonifacio.jpg", options:["Andres Bonifacio", "Emilio Aguinaldo", "Jose Rizal", "Apolinario Mabini"] }, { type: "guess", answer: "Lapu-Lapu", hint: "Defeated Magellan at Mactan", image: "images/guess/lapu-lapu.jpg", options:["Lapu-Lapu", "Rajah Sulayman", "Rajah Humabon", "Rajah Matanda"] }, { type: "guess", answer: "Apolinario Mabini", hint: "The Sublime Paralytic", image: "images/guess/apolinario-mabini.jpg", options:["Apolinario Mabini", "Antonio Luna", "Juan Luna", "Graciano Lopez Jaena"] } ] },
    { questions: [ { type: "guess", answer: "Antonio Luna", hint: "General of the Philippine-American War", image: "images/guess/antonio-luna.jpg", options:["Antonio Luna", "Emilio Aguinaldo", "Andres Bonifacio", "Miguel Malvar"] }, { type: "guess", answer: "Manuel L. Quezon", hint: "Father of the National Language", image: "images/guess/manuel-quezon.jpg", options:["Manuel L. Quezon", "Sergio Osmeña", "Manuel Roxas", "Elpidio Quirino"] }, { type: "guess", answer: "Corazon Aquino", hint: "Mother of Democracy", image: "images/guess/corazon-aquino.jpg", options:["Corazon Aquino", "Gloria Macapagal-Arroyo", "Imelda Marcos", "Miriam Defensor"] }, { type: "guess", answer: "Ferdinand Marcos", hint: "Longest-serving president of the Philippines", image: "images/guess/ferdinand-marcos.jpg", options:["Ferdinand Marcos", "Fidel Ramos", "Joseph Estrada", "Rodrigo Duterte"] }, { type: "guess", answer: "Ramon Magsaysay", hint: "Champion of the Masses", image: "images/guess/ramon-magsaysay.jpg", options:["Ramon Magsaysay", "Carlos Garcia", "Diosdado Macapagal", "Manuel Roxas"] } ] },
    { questions: [ { type: "guess", answer: "Philippine Flag", hint: "National flag with three colors", image: "images/guess/philippine-flag.jpg", options:["Philippine Flag", "American Flag", "Japanese Flag", "Spanish Flag"] }, { type: "guess", answer: "Philippine Eagle", hint: "National bird of the Philippines", image: "images/guess/philippine-eagle.jpg", options:["Philippine Eagle", "Maya", "Egret", "Dove"] }, { type: "guess", answer: "Carabao", hint: "National animal of the Philippines", image: "images/guess/carabao.jpg", options:["Carabao", "Tamaraw", "Bull", "Horse"] }, { type: "guess", answer: "Sampaguita", hint: "National flower of the Philippines", image: "images/guess/sampaguita.jpg", options:["Sampaguita", "Rose", "Ylang-Ylang", "Santan"] }, { type: "guess", answer: "Narra", hint: "National tree of the Philippines", image: "images/guess/narra.jpg", options:["Narra", "Acacia", "Ipil", "Tindalo"] } ] },
    { questions: [ { type: "guess", answer: "Bangus", hint: "National fish of the Philippines", image: "images/guess/bangus.jpg", options:["Bangus", "Tilapia", "Galunggong", "Tuna"] }, { type: "guess", answer: "Jeepney", hint: "King of the road in the Philippines", image: "images/guess/jeepney.jpg", options:["Jeepney", "Bus", "Tricycle", "Kalesa"] }, { type: "guess", answer: "Barong Tagalog", hint: "National men's clothing", image: "images/guess/barong-tagalog.jpg", options:["Barong Tagalog", "Kimono", "Malong", "Tapis"] }, { type: "guess", answer: "Baro't Saya", hint: "National women's clothing", image: "images/guess/barot-saya.jpg", options:["Baro't Saya", "Kimono", "Malong", "Terno"] }, { type: "guess", answer: "Anahaw", hint: "National leaf of the Philippines", image: "images/guess/anahaw.jpg", options:["Anahaw", "Narra", "Bamboo", "Palm"] } ] },
    { questions: [ { type: "guess", answer: "Tarsier", hint: "Small animal found in Bohol", image: "images/guess/tarsier.jpg", options:["Tarsier", "Panda", "Koala", "Orangutan"] }, { type: "guess", answer: "Chocolate Hills", hint: "Famous tourist spot in Bohol", image: "images/guess/chocolate-hills.jpg", options:["Chocolate Hills", "Banaue Rice Terraces", "Mayon Volcano", "Taal Volcano"] }, { type: "guess", answer: "Banaue Rice Terraces", hint: "Eighth Wonder of the World in Ifugao", image: "images/guess/banaue-rice-terraces.jpg", options:["Banaue Rice Terraces", "Chocolate Hills", "Tubbataha Reef", "Puerto Princesa"] }, { type: "guess", answer: "Intramuros", hint: "Old walled city in Manila", image: "images/guess/intramuros.jpg", options:["Intramuros", "Fort Santiago", "Rizal Park", "Manila Cathedral"] }, { type: "guess", answer: "Mayon Volcano", hint: "Perfect cone volcano in Albay", image: "images/guess/mayon-volcano.jpg", options:["Mayon Volcano", "Taal Volcano", "Pinatubo", "Kanlaon"] } ] },
    { questions: [ { type: "guess", answer: "Taal Volcano", hint: "Smallest active volcano in the world", image: "images/guess/taal-volcano.jpg", options:["Taal Volcano", "Mayon Volcano", "Pinatubo", "Kanlaon"] }, { type: "guess", answer: "Juan Luna", hint: "Painter of the Spoliarium", image: "images/guess/juan-luna.jpg", options:["Juan Luna", "Felix Resurreccion Hidalgo", "Fernando Amorsolo", "Carlos Francisco"] }, { type: "guess", answer: "Sipa", hint: "National sport of the Philippines", image: "images/guess/sipa.jpg", options:["Sipa", "Basketball", "Volleyball", "Sepak Takraw"] }, { type: "guess", answer: "Arnis", hint: "National martial art of the Philippines", image: "images/guess/arnis.jpg", options:["Arnis", "Karate", "Taekwondo", "Kung Fu"] }, { type: "guess", answer: "Manny Pacquiao", hint: "National boxing champion of the Philippines", image: "images/guess/manny-pacquiao.jpg", options:["Manny Pacquiao", "Nonito Donaire", "Jerwin Ancajas", "Donnie Nietes"] } ] },
    { questions: [ { type: "guess", answer: "Rizal Park", hint: "Famous park in Manila where Rizal was executed", image: "images/guess/rizal-park.jpg", options:["Rizal Park", "Quezon Memorial", "Ayala Triangle", "Bonifacio Park"] }, { type: "guess", answer: "Puerto Princesa", hint: "Underground River in Palawan", image: "images/guess/puerto-princesa.jpg", options:["Puerto Princesa", "Coron", "El Nido", "Cebu"] }, { type: "guess", answer: "Tubbataha Reef", hint: "UNESCO World Heritage in the Sulu Sea", image: "images/guess/tubbataha-reef.jpg", options:["Tubbataha Reef", "Boracay", "Siargao", "Palawan"] }, { type: "guess", answer: "Boracay", hint: "Famous white sand beach in Aklan", image: "images/guess/boracay.jpg", options:["Boracay", "Puerto Galera", "El Nido", "Siargao"] }, { type: "guess", answer: "Siargao", hint: "Surfing capital of the Philippines", image: "images/guess/siargao.jpg", options:["Siargao", "Boracay", "La Union", "Baler"] } ] },
    { questions: [ { type: "guess", answer: "Pahiyas Festival", hint: "Festival in Lucban, Quezon", image: "images/guess/pahiyas-festival.jpg", options:["Pahiyas Festival", "Sinulog", "Ati-Atihan", "Kadayawan"] }, { type: "guess", answer: "Sinulog Festival", hint: "Festival in Cebu for the Sto. Niño", image: "images/guess/sinulog-festival.jpg", options:["Sinulog Festival", "Pahiyas", "Ati-Atihan", "Panagbenga"] }, { type: "guess", answer: "Ati-Atihan", hint: "Festival in Kalibo, Aklan", image: "images/guess/ati-atihan.jpg", options:["Ati-Atihan", "Sinulog", "Dinagyang", "MassKara"] }, { type: "guess", answer: "Panagbenga Festival", hint: "Flower festival in Baguio", image: "images/guess/panagbenga-festival.jpg", options:["Panagbenga Festival", "Pahiyas", "Sinulog", "Kadayawan"] }, { type: "guess", answer: "Kadayawan Festival", hint: "Festival of Davao for thanksgiving", image: "images/guess/kadayawan-festival.jpg", options:["Kadayawan Festival", "Sinulog", "Ati-Atihan", "Panagbenga"] } ] },
    { questions: [ { type: "guess", answer: "Lechon", hint: "Popular food during fiestas", image: "images/guess/lechon.jpg", options:["Lechon", "Adobo", "Sinigang", "Kare-Kare"] }, { type: "guess", answer: "Adobo", hint: "Unofficial national dish of the Philippines", image: "images/guess/adobo.jpg", options:["Adobo", "Sinigang", "Lechon", "Kare-Kare"] }, { type: "guess", answer: "Sinigang", hint: "Sour soup dish", image: "images/guess/sinigang.jpg", options:["Sinigang", "Adobo", "Nilaga", "Tinola"] }, { type: "guess", answer: "Balut", hint: "Boiled duck embryo", image: "images/guess/balut.jpg", options:["Balut", "Penoy", "Kwek-Kwek", "Tokneneng"] }, { type: "guess", answer: "Halo-Halo", hint: "Popular summer dessert with mixed ingredients", image: "images/guess/halo-halo.jpg", options:["Halo-Halo", "Mais Con Yelo", "Sago't Gulaman", "Ube Halaya"] } ] },
    { questions: [ { type: "guess", answer: "Bayanihan", hint: "Traditional Filipino spirit of communal unity", image: "images/guess/bayanihan.jpg", options:["Bayanihan", "Fiesta", "Santacruzan", "Christmas"] }, { type: "guess", answer: "Santacruzan", hint: "Religious parade held in May", image: "images/guess/santacruzan.jpg", options:["Santacruzan", "Sinulog", "Flores de Mayo", "Pahiyas"] }, { type: "guess", answer: "Antonio Luna", hint: "General assassinated in Cabanatuan", image: "images/guess/antonio-luna.jpg", options:["Antonio Luna", "Emilio Aguinaldo", "Gregorio del Pilar", "Miguel Malvar"] }, { type: "guess", answer: "Emilio Jacinto", hint: "Brain of the Katipunan", image: "images/guess/emilio-jacinto.jpg", options:["Emilio Jacinto", "Andres Bonifacio", "Apolinario Mabini", "Jose Rizal"] }, { type: "guess", answer: "Gomburza", hint: "Three martyred priests of 1872", image: "images/guess/gomburza.jpg", options:["Gomburza", "Rizal", "Bonifacio", "Mabini"] } ] }
  ]},
  spell: { levels: [
    { questions: [ { type: "spell", word: "aklat", options:["aklat", "aclat", "aklad", "aclak"] }, { type: "spell", word: "bahay", options:["bahay", "bahey", "bahae", "bahi"] }, { type: "spell", word: "guro", options:["guro", "guroh", "goro", "gurro"] }, { type: "spell", word: "mesa", options:["mesa", "misa", "masa", "meza"] }, { type: "spell", word: "pusa", options:["pusa", "pasa", "pusah", "psua"] } ] },
    { questions: [ { type: "spell", word: "eskwela", options:["eskwela", "eskuela", "eskwila", "eskuyla"] }, { type: "spell", word: "kaibigan", options:["kaibigan", "kaybigan", "kaibegan", "keibigan"] }, { type: "spell", word: "dagat", options:["dagat", "dagad", "daat", "daghat"] }, { type: "spell", word: "buwan", options:["buwan", "buan", "bwan", "buhwan"] }, { type: "spell", word: "araw", options:["araw", "ahraw", "alaw", "arawh"] } ] },
    { questions: [ { type: "spell", word: "mag-aaral", options:["mag-aaral", "magaaral", "mag-aral", "maga-aral"] }, { type: "spell", word: "punong-guro", options:["punong-guro", "punongguro", "punong guro", "puno-guro"] }, { type: "spell", word: "kasaysayan", options:["kasaysayan", "kasay-sayan", "kassaysayan", "kasaysyan"] }, { type: "spell", word: "pagkakaisa", options:["pagkakaisa", "pagkaka-isa", "pagakaisa", "pagkkaisa"] }, { type: "spell", word: "katangian", options:["katangian", "katangiyan", "katangyan", "katanian"] } ] },
    { questions: [ { type: "spell", word: "paaralan", options:["paaralan", "paralan", "paarlan", "parhalan"] }, { type: "spell", word: "magulang", options:["magulang", "magolang", "magulag", "maghulang"] }, { type: "spell", word: "kaalaman", options:["kaalaman", "kaalamman", "kalaman", "kaalman"] }, { type: "spell", word: "pinagpala", options:["pinagpala", "pinag-pala", "pinagpahla", "pinagpalla"] }, { type: "spell", word: "pagbabago", options:["pagbabago", "pagbago", "pagbabagu", "pagbaghago"] } ] },
    { questions: [ { type: "spell", word: "pamahalaan", options:["pamahalaan", "pamahalaann", "pamhalahan", "pamhalaan"] }, { type: "spell", word: "pagmamahal", options:["pagmamahal", "pagmahal", "pagamahal", "pagmamhal"] }, { type: "spell", word: "kasalanan", options:["kasalanan", "kassalanan", "kasalanann", "kasalnan"] }, { type: "spell", word: "nakakatuwa", options:["nakakatuwa", "nakatuwa", "nakakatwa", "nakakatuha"] }, { type: "spell", word: "pinakamahalaga", options:["pinakamahalaga", "pinakamhalaga", "pinaka-mahalaga", "pinakmahalaga"] } ] },
    { questions: [ { type: "spell", word: "kalayaan", options:["kalayaan", "kalaya-an", "kalayahan", "kalaya"] }, { type: "spell", word: "kapayapaan", options:["kapayapaan", "kapaypan", "kapayapahan", "kppayapaan"] }, { type: "spell", word: "tagumpay", options:["tagumpay", "tagumay", "tagumpya", "tagunpay"] }, { type: "spell", word: "pangangalaga", options:["pangangalaga", "pangalaga", "panganngalaga", "panangalaga"] }, { type: "spell", word: "pagpapatuloy", options:["pagpapatuloy", "pagpatuloy", "pagppatuloy", "pagpapatloy"] } ] },
    { questions: [ { type: "spell", word: "pananagutan", options:["pananagutan", "panagtutan", "pananagtan", "pana-nagutan"] }, { type: "spell", word: "katiyakan", options:["katiyakan", "katipakan", "katiykan", "katuyakan"] }, { type: "spell", word: "katapangan", options:["katapangan", "katapngan", "katapagan", "katapahan"] }, { type: "spell", word: "pagkilos", options:["pagkilos", "pagkilis", "paghilos", "pakilos"] }, { type: "spell", word: "pagdarasal", options:["pagdarasal", "pagdrasal", "padgarasal", "pagdarasl"] } ] },
    { questions: [ { type: "spell", word: "kagalakan", options:["kagalakan", "kaglakan", "kaghalakan", "kagaalakan"] }, { type: "spell", word: "pagtanggap", options:["pagtanggap", "pagtang-gap", "pagtangap", "pagtanghap"] }, { type: "spell", word: "kaunawaan", options:["kaunawaan", "kaunahan", "kaunawa-an", "kaunawan"] }, { type: "spell", word: "paghihirap", options:["paghihirap", "paghirap", "paghirrap", "paghihira"] }, { type: "spell", word: "pangarap", options:["pangarap", "pagnarap", "pangharap", "panarap"] } ] },
    { questions: [ { type: "spell", word: "kapangyarihan", options:["kapangyarihan", "kapangyarihhan", "kapangarihan", "kapangyariham"] }, { type: "spell", word: "pagmamalasakit", options:["pagmamalasakit", "pagmalasakit", "pagmamalsakit", "pagmamalasakot"] }, { type: "spell", word: "katapatan", options:["katapatan", "kataptaan", "katapathan", "kataputan"] }, { type: "spell", word: "pagkukusa", options:["pagkukusa", "pagkusa", "pagkukuksa", "pagukusa"] }, { type: "spell", word: "bayanihan", options:["bayanihan", "bayanhian", "bayanihen", "bayanohan"] } ] },
    { questions: [ { type: "spell", word: "pag-ibig", options:["pag-ibig", "pagibig", "pag-ibog", "pag-ebig"] }, { type: "spell", word: "pagkakaibigan", options:["pagkakaibigan", "pagkaibigan", "pagkaka-ibigan", "pagkkaibigan"] }, { type: "spell", word: "pagtatanggol", options:["pagtatanggol", "pagtanggol", "pagtatangol", "pagtatanggul"] }, { type: "spell", word: "pakikipagkapwa", options:["pakikipagkapwa", "pakikipagkapua", "pakikipagakapwa", "pakikipagkapwe"] }, { type: "spell", word: "pagmamahal", options:["pagmamahal", "pagmahal", "pagamahal", "pagmamhal"] } ] }
  ]},
  missing: { levels: [
    { questions: [ { type: "missing", word: "aklat", display: " KL_T ", image: "images/missing/aklat.jpg", options:["aklat", "aklad", "aklet", "iklat"] }, { type: "missing", word: "bahay", display: "B_H_Y", image: "images/missing/bahay.jpg", options:["bahay", "bahey", "buhay", "bohay"] }, { type: "missing", word: "guro", display: "G_R_", image: "images/missing/guro.jpg", options:["guro", "goro", "gura", "giro"] }, { type: "missing", word: "mesa", display: "M_S_", image: "images/missing/mesa.jpg", options:["mesa", "misa", "masa", "mosa"] }, { type: "missing", word: "pusa", display: "P_S_", image: "images/missing/pusa.jpg", options:["pusa", "pasa", "pisa", "posa"] } ] },
    { questions: [ { type: "missing", word: "eskwela", display: "E_KW_L_", image: "images/missing/eskwela.jpg", options:["eskwela", "eskuela", "eskwila", "eskuyla"] }, { type: "missing", word: "kaibigan", display: "K_IBIG_N", image: "images/missing/kaibigan.jpg", options:["kaibigan", "kaybigan", "kaibugan", "kaebigan"] }, { type: "missing", word: "dagat", display: "D_G_T_", image: "images/missing/dagat.jpg", options:["dagat", "dagad", "digat", "dagut"] }, { type: "missing", word: "buwan", display: "B_W_N", image: "images/missing/buwan.jpg", options:["buwan", "bawan", "buhwan", "biwan"] }, { type: "missing", word: "araw", display: "_R_W_", image: "images/missing/araw.jpg", options:["araw", "iraw", "uruw", "arah"] } ] },
    { questions: [ { type: "missing", word: "mag-aaral", display: "M_G-A_R_L", image: "images/missing/mag-aaral.jpg", options:["mag-aaral", "magaaral", "mag-araal", "mag-aral"] }, { type: "missing", word: "kasaysayan", display: "K_S_YS_Y_N", image: "images/missing/kasaysayan.jpg", options:["kasaysayan", "kasay-sayan", "kassaysayan", "kasaysyan"] }, { type: "missing", word: "pagkakaisa", display: "P_GK_K_IS_", image: "images/missing/pagkakaisa.jpg", options:["pagkakaisa", "pagkaka-isa", "pagakaisa", "pagkkaisa"] }, { type: "missing", word: "katangian", display: "K_T_NG__N", image: "images/missing/katangian.jpg", options:["katangian", "katangyan", "katangiyan", "katanian"] }, { type: "missing", word: "punong-guro", display: "P_N_NG-G_R_", image: "images/missing/punong-guro.jpg", options:["punong-guro", "punongguro", "punong guro", "puno-guro"] } ] },
    { questions: [ { type: "missing", word: "paaralan", display: "P__R_L_N", image: "images/missing/eskwela.jpg", options:["paaralan", "paralan", "paarlan", "parhalan"] }, { type: "missing", word: "magulang", display: "M_G_L_NG", image: "images/missing/magulang.jpg", options:["magulang", "magolang", "magulag", "maghalang"] }, { type: "missing", word: "kaalaman", display: "K_L_M_N", image: "images/missing/kaalaman.jpg", options:["kaalaman", "kaalamman", "kalaman", "kaalman"] }, { type: "missing", word: "pinagpala", display: "P_N_GP_L_", image: "images/missing/pinagpala.jpg", options:["pinagpala", "pinag-pala", "pinagpahla", "pinagpalla"] }, { type: "missing", word: "pagbabago", display: "P_GB_B_G_", image: "images/missing/pagbabago.jpg", options:["pagbabago", "pagbago", "pagbaghago", "pagbabagu"] } ] },
    { questions: [ { type: "missing", word: "pamahalaan", display: "P_M_H_L__N", image: "images/missing/pamahalaan.jpg", options:["pamahalaan", "pamahala", "pamhalahan", "pamhalaan"] }, { type: "missing", word: "pagmamahal", display: "P_GM_M_H_L", image: "images/missing/pagmamahal.jpg", options:["pagmamahal", "pagmahal", "pagamahal", "pagmamhal"] }, { type: "missing", word: "kasalanan", display: "K_S_L_N_N", image: "images/missing/kasalanan.jpg", options:["kasalanan", "kassalanan", "kasalanann", "kasalnan"] }, { type: "missing", word: "nakakatuwa", display: "N_K_K_T_W_", image: "images/missing/nakakatuwa.jpg", options:["nakakatuwa", "nakatuwa", "nakakatwa", "nakakatuha"] }, { type: "missing", word: "pinakamahalaga", display: "P_N_K_M_H_L_G_", image: "images/missing/pinakamahalaga.jpg", options:["pinakamahalaga", "pinakamhalaga", "pinakmahalaga", "pinaka-mahalaga"] } ] },
    { questions: [ { type: "missing", word: "kalayaan", display: "K_L_Y__N", image: "images/missing/kalayaan.jpg", options:["kalayaan", "kalaya-an", "kalayahan", "kalayan"] }, { type: "missing", word: "kapayapaan", display: "K_P_Y_P__N", image: "images/missing/kapayapaan.jpg", options:["kapayapaan", "kapaypan", "kapayapahan", "kppayapaan"] }, { type: "missing", word: "tagumpay", display: "T_G_MP_Y", image: "images/missing/tagumpay.jpg", options:["tagumpay", "tagumay", "tagunpay", "tagumpya"] }, { type: "missing", word: "pangangalaga", display: "P_NG_NG_L_G_", image: "images/missing/pangangalaga.jpg", options:["pangangalaga", "pangalaga", "panganngalaga", "panangalaga"] }, { type: "missing", word: "pagpapatuloy", display: "P_GP_PT_L_Y", image: "images/missing/pagpapatuloy.jpg", options:["pagpapatuloy", "pagpatuloy", "pagppatuloy", "pagpapatloy"] } ] },
    { questions: [ { type: "missing", word: "pananagutan", display: "P_N_N_G_T_N", image: "images/missing/pananagutan.jpg", options:["pananagutan", "panagtutan", "pananagtan", "pananahutan"] }, { type: "missing", word: "katiyakan", display: "K_T_Y_K_N", image: "images/missing/katiyakan.jpg", options:["katiyakan", "katipakan", "katiykan", "katuyakan"] }, { type: "missing", word: "katapangan", display: "K_T_P_NG_N", image: "images/missing/katapangan.jpg", options:["katapangan", "katapngan", "katapagan", "katapahan"] }, { type: "missing", word: "pagkilos", display: "P_GK_L_S", image: "images/missing/pagkilos.jpg", options:["pagkilos", "pagkilis", "pakilos", "paghilos"] }, { type: "missing", word: "pagdarasal", display: "P_GD_R_S_L", image: "images/missing/pagdarasal.jpg", options:["pagdarasal", "pagdrasal", "padgarasal", "pagdarasl"] } ] },
    { questions: [ { type: "missing", word: "kagalakan", display: "K_G_L_K_N", image: "images/missing/kagalakan.jpg", options:["kagalakan", "kaglakan", "kaghalakan", "kagaalakan"] }, { type: "missing", word: "pagtanggap", display: "P_GT_NGG_P", image: "images/missing/pagtanggap.jpg", options:["pagtanggap", "pagtangap", "pagtanghap", "pagtang-gap"] }, { type: "missing", word: "kaunawaan", display: "K_N_W__N", image: "images/missing/kaunawaan.jpg", options:["kaunawaan", "kaunahan", "kaunawa-an", "kaunawan"] }, { type: "missing", word: "paghihirap", display: "P_GH_H_R_P", image: "images/missing/paghihirap.jpg", options:["paghihirap", "paghirap", "paghirrap", "paghihira"] }, { type: "missing", word: "pangarap", display: "P_NG_R_P", image: "images/missing/pangarap.jpg", options:["pangarap", "pagnarap", "pangharap", "panarap"] } ] },
    { questions: [ { type: "missing", word: "kapangyarihan", display: "K_P_NG_Y_R_H_N", image: "images/missing/kapangyarihan.jpg", options:["kapangyarihan", "kapangarihan", "kapangyarihhan", "kapangyariham"] }, { type: "missing", word: "pagmamalasakit", display: "P_GM_M_L_S_K_T", image: "images/missing/pagmamalasakit.jpg", options:["pagmamalasakit", "pagmalasakit", "pagmamalsakit", "pagmamalasakot"] }, { type: "missing", word: "katapatan", display: "K_T_P_T_N", image: "images/missing/katapatan.jpg", options:["katapatan", "kataptaan", "katapathan", "kataputan"] }, { type: "missing", word: "pagkukusa", display: "P_GK_K_S_", image: "images/missing/pagkukusa.jpg", options:["pagkukusa", "pagkusa", "pagkukuksa", "pagukusa"] }, { type: "missing", word: "bayanihan", display: "B_Y_N_H_N", image: "images/missing/bayanihan.jpg", options:["bayanihan", "bayanhian", "bayanihen", "bayanohan"] } ] },
    { questions: [ { type: "missing", word: "pag-ibig", display: "P_G-_B_G", image: "images/missing/pag-ibig.jpg", options:["pag-ibig", "pagibig", "pag-ibog", "pag-ebig"] }, { type: "missing", word: "pagkakaibigan", display: "P_GK_K_IB_G_N", image: "images/missing/pagkakaibigan.jpg", options:["pagkakaibigan", "pagkaibigan", "pagkaka-ibigan", "pagkkaibigan"] }, { type: "missing", word: "pagtatanggol", display: "P_GT_T_NGG_L", image: "images/missing/pagtatanggol.jpg", options:["pagtatanggol", "pagtanggol", "pagtatangol", "pagtatanggul"] }, { type: "missing", word: "pakikipagkapwa", display: "P_K_K_PG_KPW_", image: "images/missing/pakikipagkapwa.jpg", options:["pakikipagkapwa", "pakikipagkapua", "pakikipagakapwa", "pakikipagkapwe"] }, { type: "missing", word: "pagmamahal", display: "P_GM_M_H_L", image: "images/missing/pagmamahal.jpg", options:["pagmamahal", "pagmahal", "pagamahal", "pagmamhal"] } ] }
  ]}
};

// === SOUND EFFECTS (Web Audio API — no files needed) ===
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playCorrectSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    // Two-tone ascending chime
    const notes = [523.25, 783.99]; // C5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.35);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.35);
    });
  } catch (e) {}
}

function playWrongSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    // Low descending buzz
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {}
}

function playLevelCompleteSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    // Ascending fanfare: C5 E5 G5 C6
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.4);
    });
  } catch (e) {}
}

function playFailSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    // Descending sad tones
    const notes = [392, 349.23, 311.13, 261.63]; // G4 F4 Eb4 C4
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.18);
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.18);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.4);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.4);
    });
  } catch (e) {}
}

function getCorrectAnswer(question) { return question.word || question.answer; }

function startLevel(level) {
  currentLevel = level;
  currentQuestion = 0;
  correctAnswers = 0;
  streak = 0;
  secondsLeft = 30;
  endLevel._running = false; // reset endLevel guard
  // Remove results overlay if it exists (dynamically created)
  const rs = document.getElementById("results-screen");
  if (rs) rs.remove();
  hideAllSections();
  showSection("game-area");
  document.getElementById("game-content").style.display = "";
  document.querySelector(".question-progress").style.display = "";
  document.getElementById("current-level-num").innerText = level;
  loadQuestion();
}

function loadQuestion() {
  answerLocked = false; // Task 4: reset lock on new question
  const levelData = gameData[currentMode].levels[currentLevel - 1];
  if (!levelData) { endLevel(); return; }
  const question = levelData.questions[currentQuestion];
  if (!question) { endLevel(); return; }
  
  const shuffledOptions = shuffleArray([...question.options]);
  const correctAnswer = getCorrectAnswer(question);
  
  startTimer();
  const currentQEl = document.getElementById("current-q");
  if (currentQEl) currentQEl.innerText = currentQuestion + 1;
  document.getElementById("question-progress-bar").style.width = ((currentQuestion + 1) / totalQuestions * 100) + "%";
  document.getElementById("current-streak").innerText = streak;

  // Task 11: question progress dots
  const dotsContainer = document.getElementById('progress-dots');
  if (dotsContainer) {
    dotsContainer.innerHTML = Array.from({length: totalQuestions}, (_, i) =>
      `<span class="q-dot ${i < currentQuestion ? 'done' : i === currentQuestion ? 'active' : ''}"></span>`
    ).join('');
  }
  
  const content = document.getElementById("game-content");
  content.innerHTML = "";
  const container = document.createElement("div");
  container.className = "question-container";

  // Top section: badge + question content
  const questionBody = document.createElement("div");
  questionBody.className = "question-body";

  const typeBadge = document.createElement("span");
  typeBadge.className = "question-type";
  typeBadge.innerText = currentMode === "spell" ? "Spelling" : currentMode === "missing" ? "Missing Letters" : currentMode === "history" ? "History" : "Image Guess";
  questionBody.appendChild(typeBadge);

  if (currentMode === "spell") {
    const speakerBtn = document.createElement("button");
    speakerBtn.className = "speaker-btn"; speakerBtn.innerText = "🔊"; speakerBtn.onclick = (e) => playWord(question.word, e);
    questionBody.appendChild(speakerBtn);
    const hint = document.createElement("p"); hint.className = "question-text"; hint.innerText = "Listen and choose the correct spelling"; questionBody.appendChild(hint);
  } else if (currentMode === "missing") {
    if (question.image) {
      const imgWrap = document.createElement("div");
      imgWrap.className = "missing-image-wrap";
      imgWrap.innerHTML = `<img src="${question.image}" alt="${question.word}" class="missing-image"
        onerror="this.parentElement.style.display='none';">`;
      questionBody.appendChild(imgWrap);
    }
    const display = document.createElement("h2"); display.className = "question-text missing-display"; display.innerText = question.display; questionBody.appendChild(display);
    const hint = document.createElement("p"); hint.className = "missing-hint-text"; hint.innerText = "Choose the correct complete word"; questionBody.appendChild(hint);
  } else if (currentMode === "history") {
    const qText = document.createElement("p");
    qText.className = "question-text";
    qText.innerText = question.question;
    questionBody.appendChild(qText);

    if (question.hint) {
        const hintBtn = document.createElement("button");
        hintBtn.className = "hint-btn";
        hintBtn.innerHTML = "💡 Show Hint";
        hintBtn.onclick = () => showHistoryHint(question.hint, hintBtn);
        questionBody.appendChild(hintBtn);
    }
  } else if (currentMode === "guess") {
    const hintBox = document.createElement("div");
    hintBox.className = "guess-hint-box";
    if (question.image) {
      hintBox.innerHTML = `
        <div class="guess-image-wrap">
          <img src="${question.image}" alt="Guess the image" class="guess-image"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
          <div class="guess-image-fallback" style="display:none;">
            <div class="hint-icon">🖼️</div>
            <div class="hint-text">${question.hint}</div>
          </div>
        </div>
        <div class="guess-hint-label">💡 ${question.hint}</div>`;
    } else {
      hintBox.innerHTML = `<div class="hint-icon">🖼️</div><div class="hint-text">${question.hint}</div>`;
    }
    questionBody.appendChild(hintBox);
  }

  container.appendChild(questionBody);

  // Bottom section: options always pinned to bottom
  const optionsGrid = document.createElement("div"); optionsGrid.className = "options-grid";
  shuffledOptions.forEach((option, index) => {
    const btn = document.createElement("button"); btn.className = "option-btn";
    btn.innerHTML = `<span class="option-letter">${String.fromCharCode(65 + index)}</span><span class="option-text">${option}</span>`;
    btn.onclick = () => selectOption(btn, option, correctAnswer);
    optionsGrid.appendChild(btn);
  });
  container.appendChild(optionsGrid);
  content.appendChild(container);
}

function selectOption(btn, selected, correct) {
  if (answerLocked) return; // Task 4: rate limiting
  answerLocked = true;
  const allBtns = document.querySelectorAll(".option-btn");
  allBtns.forEach(b => { b.classList.add("disabled"); b.style.pointerEvents = "none"; });

  const isCorrect = selected.toLowerCase().trim() === correct.toLowerCase().trim();
  if (isCorrect) {
    btn.classList.add("correct"); correctAnswers++; streak++;
    playCorrectSound();
    haptic(50); // Task 8: haptic on correct
    if (streak > 0 && streak % 3 === 0) {
      showStreakBanner(streak); // Task 12: streak banner
    }
    showFeedback(true);
  } else {
    btn.classList.add("wrong");
    allBtns.forEach(b => {
      const optText = b.querySelector(".option-text");
      if (optText && optText.innerText.toLowerCase().trim() === correct.toLowerCase().trim()) b.classList.add("correct");
    });
    streak = 0;
    playWrongSound();
    haptic([80, 40, 80]); // Task 8: haptic on wrong
    showFeedback(false, correct);
  }

  document.getElementById("current-streak").innerText = streak;
  stopTimer();

  // Wait for feedback to show (1500ms), then advance
  setTimeout(() => {
    currentQuestion++;
    if (currentQuestion < totalQuestions) {
      loadQuestion();
    } else {
      endLevel();
    }
  }, 1500);
}

function showFeedback(isCorrect, correctAnswer) {
  const overlay = document.createElement("div"); overlay.className = "feedback-overlay";
  const feedbackText = isCorrect ? "Correct! 🎉" : `Wrong! The answer is: ${correctAnswer}`;
  overlay.innerHTML = `<div class="feedback-content"><div class="feedback-emoji">${isCorrect ? "✅" : "❌"}</div><div class="feedback-text">${isCorrect ? "Correct!" : "Wrong!"}</div><div class="feedback-subtext">${isCorrect ? "Great! Next question..." : `The answer is: ${correctAnswer}`}</div></div>`;
  document.body.appendChild(overlay);
  setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 1200);
}

function showHistoryHint(hintText, btn) {
    // Toggle hint display
    let hintEl = btn.nextElementSibling;
    if (hintEl && hintEl.classList.contains('history-hint-box')) {
        hintEl.remove();
        btn.innerHTML = "💡 Show Hint";
        return;
    }
    const box = document.createElement("div");
    box.className = "history-hint-box";
    box.innerHTML = `<span class="hint-bulb">💡</span><span class="hint-hint-text">${hintText}</span>`;
    btn.insertAdjacentElement('afterend', box);
    btn.innerHTML = "🙈 Hide Hint";
}

function showResultsModal(passed, stars, correctAnswers, accuracy, timeBonus, totalScore) {
  document.getElementById("modal-emoji").innerText = passed ? "🎉" : "😢";
  document.getElementById("modal-title").innerText = passed ? "Level Complete!" : "Not Passed";
  // Task 10: animated star spans
  const starsHtml = stars > 0
    ? '⭐'.repeat(stars).split('').map(s => `<span>${s}</span>`).join('')
    : '<span>💫</span>';
  document.getElementById("modal-stars").innerHTML = starsHtml;
  document.getElementById("modal-correct").innerText = `${correctAnswers}/${totalQuestions}`;
  document.getElementById("modal-accuracy").innerText = `${accuracy.toFixed(0)}%`;
  document.getElementById("modal-time-bonus").innerText = `+${timeBonus}`;
  document.getElementById("modal-total-score").innerText = totalScore;

  const msg = document.getElementById("modal-message");
  if (passed) {
    msg.className = "modal-message success";
    msg.innerText = stars === 3 ? "Perfect score! 🌟" : stars === 2 ? "Next level unlocked! 🎉" : "Level passed! Keep going!";
  } else {
    msg.className = "modal-message fail";
    msg.innerText = "You need 60% to pass. Try again!";
  }

  // Task 10: personal best comparison
  const prevBest = progress[currentMode]?.levels[currentLevel - 1]?.highScore || 0;
  const isNewBest = totalScore > prevBest;
  // Remove any previous personal best line
  document.querySelectorAll('.modal-personal-best').forEach(el => el.remove());
  if (isNewBest && passed) {
    const bestLine = document.createElement('div');
    bestLine.className = 'modal-message success modal-personal-best';
    bestLine.style.marginTop = '6px';
    bestLine.innerText = '🏅 New Personal Best!';
    msg.parentNode.insertBefore(bestLine, msg.nextSibling);
  }

  const nextBtn = document.getElementById("modal-next-btn");
  nextBtn.style.display = (passed && currentLevel < TOTAL_LEVELS) ? "inline-block" : "none";

  document.getElementById("results-modal").classList.remove("hidden");

  // Task 10: score count-up animation
  const scoreEl = document.getElementById("modal-total-score");
  animateCount(scoreEl, totalScore);
}

// Task 10: count-up animation helper
function animateCount(el, target, duration = 600) {
  const startTime = performance.now();
  const update = (now) => {
    const ratio = Math.min((now - startTime) / duration, 1);
    el.textContent = Math.round(ratio * target);
    if (ratio < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

function hideResultsModal() {
  document.getElementById("results-modal").classList.add("hidden");
  // Clean up any personal best lines added dynamically
  document.querySelectorAll('.modal-personal-best').forEach(el => el.remove());
}

function showResultsScreen(passed, stars, correctAnswers, accuracy, timeBonus, totalScore) {
  // Remove any existing results overlay
  const existing = document.getElementById("results-screen");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "results-screen";
  overlay.innerHTML = `
    <div class="results-container">
      <div class="result-emoji">${passed ? "🎉" : "😢"}</div>
      <h2 class="result-title">${passed ? "Level Complete!" : "Not Passed"}</h2>
      <div class="stars-result">${stars > 0 ? "⭐".repeat(stars) : "💫"}</div>
      <div class="score-breakdown">
        <div class="score-item"><span>Correct Answers:</span><span>${correctAnswers}/${totalQuestions}</span></div>
        <div class="score-item"><span>Accuracy:</span><span>${accuracy.toFixed(0)}%</span></div>
        <div class="score-item"><span>Time Bonus:</span><span>+${timeBonus}</span></div>
        <div class="score-item total"><span>Total Score:</span><span>${totalScore}</span></div>
      </div>
      <div class="result-message ${passed ? 'success' : 'fail'}">
        ${passed ? `Great job! ${stars === 3 ? "Perfect score! 🌟" : stars === 2 ? "Next level unlocked! 🎉" : "Keep it up!"}` : "You need 60% to pass. Try again!"}
      </div>
      <div class="result-buttons">
        <button class="btn-retry" onclick="retryLevel()">↻ Try Again</button>
        <button class="btn-secondary" onclick="goBackToModes()">🏠 Dashboard</button>
        ${passed && currentLevel < TOTAL_LEVELS ? `<button class="btn-primary" onclick="nextLevel()">Next Level →</button>` : ""}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function endLevel() {
  stopTimer();
  // Guard against double-calls using a flag instead of checking score values
  if (endLevel._running) return;
  endLevel._running = true;
  setTimeout(() => { endLevel._running = false; }, 3000);

  try {
    // Capture all values immediately before anything can reset them
    const finalCorrect = correctAnswers;
    const finalStreak = streak;
    const finalSecondsLeft = secondsLeft;
    const finalMode = currentMode;
    const finalLevel = currentLevel;

    const accuracy = (finalCorrect / totalQuestions) * 100;
    const passed = accuracy >= 60;
    const stars = passed ? (finalCorrect === 5 ? 3 : finalCorrect >= 4 ? 2 : 1) : 0;
    const timeBonus = finalSecondsLeft * 10;
    const totalScore = (finalCorrect * 100) + timeBonus + (finalStreak * 10);
    const completionTime = 30 - finalSecondsLeft;

    const levelIndex = finalLevel - 1;
    const prevStars = progress[finalMode].levels[levelIndex].stars || 0;
    progress[finalMode].levels[levelIndex].stars = Math.max(prevStars, stars);
    const prevHighScore = progress[finalMode].levels[levelIndex].highScore || 0;
    progress[finalMode].levels[levelIndex].highScore = Math.max(prevHighScore, totalScore);

    if (passed && finalLevel < TOTAL_LEVELS) {
      progress[finalMode].levels[levelIndex + 1].unlocked = true;
      if (finalLevel >= progress[finalMode].currentLevel) progress[finalMode].currentLevel = finalLevel + 1;
    }

    progress.stats.totalGames++;
    progress.stats.totalCorrect += finalCorrect;
    progress.stats.totalStars += stars;
    progress.stats.bestStreak = Math.max(progress.stats.bestStreak, finalStreak);
    progress.stats.totalTimePlayed += completionTime;
    progress.stats.fastestCompletion = Math.min(progress.stats.fastestCompletion, completionTime);
    progress.stats.highestScoreEver = Math.max(progress.stats.highestScoreEver || 0, totalScore);
    progress.stats.totalExperience = (progress.stats.totalCorrect * 10) + (progress.stats.totalStars * 50);
    currentSessionScore = totalScore;
    updateScoreDisplays();
    try { checkAchievements(); } catch(achErr) { console.warn('Achievement check failed:', achErr); }
    saveScore(playerName, finalMode, finalLevel, totalScore, stars, accuracy).catch(e => console.error(e));
    saveProgress().catch(e => console.error(e));

    // Wait for feedback overlay to clear, then show modal
    setTimeout(() => {
      document.querySelectorAll('.feedback-overlay').forEach(el => el.remove());
      showResultsModal(passed, stars, finalCorrect, accuracy, timeBonus, totalScore);
      setTimeout(() => { passed ? playLevelCompleteSound() : playFailSound(); }, 200);
    }, 400);

  } catch(e) {
    console.error('endLevel error:', e);
  }
}

function retryLevel() {
  hideResultsModal();
  const rs = document.getElementById("results-screen");
  if (rs) rs.remove();
  startLevel(currentLevel);
}

function nextLevel() {
  hideResultsModal();
  const rs = document.getElementById("results-screen");
  if (rs) rs.remove();
  if (currentLevel < TOTAL_LEVELS) startLevel(currentLevel + 1);
}

// === TIMER ===
function startTimer() {
  clearInterval(timerInterval); secondsLeft = 30;
  document.getElementById("timer").innerText = secondsLeft;
  document.getElementById("timer").style.color = "";
  timerInterval = setInterval(() => {
    secondsLeft--;
    document.getElementById("timer").innerText = secondsLeft;
    if (secondsLeft <= 10) document.getElementById("timer").style.color = "#ff4757";
    else document.getElementById("timer").style.color = "";
    if (secondsLeft <= 0) { clearInterval(timerInterval); handleTimeUp(); }
  }, 1000);
}
function stopTimer() { clearInterval(timerInterval); }
function handleTimeUp() {
  answerLocked = true; // Task 4: lock on time up
  const levelData = gameData[currentMode].levels[currentLevel - 1];
  const correctAnswer = getCorrectAnswer(levelData.questions[currentQuestion]);
  streak = 0; document.getElementById("current-streak").innerText = streak;
  playWrongSound();
  showFeedback(false, correctAnswer);
  setTimeout(() => { currentQuestion++; currentQuestion < totalQuestions ? loadQuestion() : endLevel(); }, 1500);
}

// === MENU & UI ===
function openMenu() { document.getElementById("side-menu").classList.remove("hidden"); document.getElementById("menu-overlay").classList.remove("hidden"); }
function closeMenu() { document.getElementById("side-menu").classList.add("hidden"); document.getElementById("menu-overlay").classList.add("hidden"); }
function updateMenuProfile() {
  const avatar = document.getElementById("menu-avatar");
  const nameEl = document.getElementById("menu-player-name");
  if (avatar) avatar.textContent = playerName ? playerName.charAt(0).toUpperCase() : "A";
  if (nameEl) nameEl.textContent = playerName || "Player";
}

async function showLeaderboard() {
  closeMenu(); hideAllSections();
  showSection("leaderboard-section");
  const container = document.getElementById("leaderboard-content");
  container.innerHTML = `<div class="lb-loading"><div class="lb-spinner"></div><p>Loading scores…</p></div>`;
  try {
    const data = await getLeaderboard();
    renderLeaderboard(data, 'all');
  } catch (e) {
    console.error(e);
    document.getElementById("leaderboard-content").innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Could not load</h3><p>Try again later.</p></div>`;
  }
}

function renderLeaderboard(data, activeTab) {
  const container = document.getElementById("leaderboard-content");
  const tabs = [
    { id: 'all',     label: '🏆 Overall' },
    { id: 'history', label: '📜 History' },
    { id: 'guess',   label: '🖼️ Guess' },
    { id: 'spell',   label: '🔤 Spell' },
    { id: 'missing', label: '🔠 Missing' }
  ];

  // Sort data for the active tab
  let sorted;
  if (activeTab === 'all') {
    sorted = [...data].sort((a, b) => b.totalScore - a.totalScore);
  } else {
    sorted = [...data].sort((a, b) => {
      const aS = (a.modeStars && a.modeStars[activeTab]) || 0;
      const bS = (b.modeStars && b.modeStars[activeTab]) || 0;
      return bS - aS || b.totalScore - a.totalScore;
    });
  }

  if (sorted.length === 0) {
    container.innerHTML = `
      <div class="lb-tabs">${tabs.map(t => `<button class="lb-tab${t.id === activeTab ? ' active' : ''}" onclick="renderLeaderboard([], '${t.id}')">${t.label}</button>`).join('')}</div>
      <div class="empty-state"><div class="empty-icon">🏆</div><h3>No scores yet</h3><p>Complete a level to appear here!</p></div>`;
    return;
  }

  // Podium (top 3)
  const podiumPlayers = sorted.slice(0, 3);
  const podiumOrder = podiumPlayers.length >= 3
    ? [podiumPlayers[1], podiumPlayers[0], podiumPlayers[2]]
    : podiumPlayers.length === 2
      ? [podiumPlayers[1], podiumPlayers[0]]
      : [podiumPlayers[0]];

  const podiumPositions = podiumPlayers.length >= 3 ? [2, 1, 3] : podiumPlayers.length === 2 ? [2, 1] : [1];

  function getScore(p) {
    if (activeTab === 'all') return `${p.totalScore} pts`;
    const s = (p.modeStars && p.modeStars[activeTab]) || 0;
    return `${s} ⭐`;
  }

  function podiumHeight(pos) {
    return pos === 1 ? '110px' : pos === 2 ? '80px' : '60px';
  }

  function medalEmoji(pos) {
    return pos === 1 ? '🥇' : pos === 2 ? '🥈' : '🥉';
  }

  const podiumHTML = `
    <div class="lb-podium">
      ${podiumOrder.map((p, idx) => {
        const pos = podiumPositions[idx];
        const isCurrent = p.player === playerName;
        return `
          <div class="lb-podium-slot lb-pos-${pos}${isCurrent ? ' lb-podium-you' : ''}">
            <div class="lb-podium-avatar">${escapeHtml(p.player.charAt(0).toUpperCase())}</div>
            <div class="lb-podium-name">${escapeHtml(p.player)}${isCurrent ? ' <span class="you-badge">YOU</span>' : ''}</div>
            <div class="lb-podium-score">${getScore(p)}</div>
            <div class="lb-podium-block" style="height:${podiumHeight(pos)}">
              <span class="lb-podium-medal">${medalEmoji(pos)}</span>
            </div>
          </div>`;
      }).join('')}
    </div>`;

  // Rest of the list (rank 4+)
  const restHTML = sorted.length > 3 ? `
    <div class="lb-rest-list">
      ${sorted.slice(3).map((p, i) => {
        const isCurrent = p.player === playerName;
        return `
          <div class="leaderboard-entry${isCurrent ? ' current-player' : ''}">
            <div class="rank">#${i + 4}</div>
            <div class="player-avatar-sm">${escapeHtml(p.player.charAt(0).toUpperCase())}</div>
            <div class="player-details">
              <h4>${escapeHtml(p.player)}${isCurrent ? ' <span class="you-badge">YOU</span>' : ''}</h4>
              <div class="player-mini-stats">
                <span>⭐ ${p.totalStars || 0}</span>
                <span>🎯 ${p.accuracy || 0}%</span>
                <span>🎮 ${p.totalGames || 0}</span>
              </div>
            </div>
            <div class="player-score">${getScore(p)}</div>
          </div>`;
      }).join('')}
    </div>` : '';

  // Current player's rank if not in top 10
  const myRank = sorted.findIndex(p => p.player === playerName);
  const myRankHTML = myRank >= 3 && myRank < sorted.length ? '' : ''; // already shown inline

  container.innerHTML = `
    <div class="lb-tabs">
      ${tabs.map(t => `<button class="lb-tab${t.id === activeTab ? ' active' : ''}" onclick="(async()=>{const d=await getLeaderboard();renderLeaderboard(d,'${t.id}');})()">${t.label}</button>`).join('')}
    </div>
    ${podiumHTML}
    ${restHTML}
    ${myRank === -1 ? `<div class="lb-not-ranked"><span>You haven't played yet — complete a level to join the board!</span></div>` : ''}
  `;
}

function showContactUs() { closeMenu(); hideAllSections(); showSection("contact-section"); }

// === THEME SELECTOR ===
const themes = [
  { id: 'theme-dark',     name: 'Dark Modern', emoji: '🌙', desc: 'Smooth purples and blues',
    gradient: 'linear-gradient(-45deg, #0d0d2b, #1a0a3d, #0f1a4a, #1e0a35)',
    accent: '#667eea' },
  { id: 'theme-tropical', name: 'Tropical',    emoji: '🌴', desc: 'Warm Filipino vibes',
    gradient: 'linear-gradient(-45deg, #ff6b35, #f7931e, #fdb833, #f37335)',
    accent: '#fdb833' },
  { id: 'theme-cosmic',   name: 'Cosmic',      emoji: '🌌', desc: 'Deep space mystery',
    gradient: 'linear-gradient(-45deg, #0a0015, #1a0033, #2d0052, #0f0025)',
    accent: '#a78bfa' },
  { id: 'theme-emerald',  name: 'Emerald',     emoji: '🌿', desc: 'Nature & growth',
    gradient: 'linear-gradient(-45deg, #0d3e1f, #1a5c3b, #2d8659, #15502b)',
    accent: '#2ed573' },
  { id: 'theme-sunset',   name: 'Sunset',      emoji: '🌅', desc: 'Warm orange tones',
    gradient: 'linear-gradient(-45deg, #2c1810, #4a2617, #a94b2f, #d67d3d)',
    accent: '#ff6b35' },
  { id: 'theme-ocean',    name: 'Ocean',       emoji: '🌊', desc: 'Cool blue waters',
    gradient: 'linear-gradient(-45deg, #0f1d4d, #1a3a70, #2a5aa8, #1e4d7b)',
    accent: '#74b9ff' },
  { id: 'theme-neon',     name: 'Neon',        emoji: '⚡', desc: 'Cyberpunk edge',
    gradient: 'linear-gradient(-45deg, #0a0e27, #150a2e, #1f0a35, #0d0520)',
    accent: '#00ffe0' }
];

function showThemeSelector() {
  closeMenu(); hideAllSections();
  showSection("theme-selector-section");
  const currentTheme = localStorage.getItem("edufusionTheme") || 'theme-dark';
  const grid = document.getElementById("theme-selector-content");
  grid.innerHTML = '';
  themes.forEach(theme => {
    const isActive = currentTheme === theme.id;
    const card = document.createElement('div');
    card.className = `theme-card ${isActive ? 'active' : ''}`;
    card.innerHTML = `
      <div class="theme-preview-swatch" style="background: ${theme.gradient}">
        <div class="theme-swatch-dots">
          <span style="background:${theme.accent}"></span>
          <span style="background:${theme.accent}88"></span>
          <span style="background:${theme.accent}44"></span>
        </div>
        ${isActive ? '<div class="theme-active-badge">✓ Active</div>' : ''}
      </div>
      <div class="theme-card-body">
        <div class="theme-card-title">
          <span class="theme-emoji">${theme.emoji}</span>
          <span>${theme.name}</span>
        </div>
        <p class="theme-card-desc">${theme.desc}</p>
        <button class="theme-apply-btn ${isActive ? 'theme-btn-active' : ''}"
          onclick="switchTheme('${theme.id}')"
          style="${isActive ? `background: linear-gradient(135deg, ${theme.accent}88, ${theme.accent}44); border-color: ${theme.accent}` : ''}">
          ${isActive ? '✓ Current Theme' : 'Apply Theme'}
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

function switchTheme(themeId) {
  themes.forEach(t => document.body.classList.remove(t.id));
  document.body.classList.add(themeId);
  localStorage.setItem("edufusionTheme", themeId);
  showThemeSelector();
  showNotification(`Background changed to ${themes.find(t => t.id === themeId)?.name} 🎨`);
}

// === DAILY CHALLENGE ===
function showDailyChallenge() {
  closeMenu(); hideAllSections();
  showSection("daily-challenge-section");
  const challenge = getDailyChallenge();
  const modeNames = { history: "📜 History Unlocked", guess: "🖼️ Guess the Image", spell: "🔤 Spell It Right", missing: "🔠 Missing Letters" };
  document.getElementById("daily-challenge-content").innerHTML = `
    <div class="daily-challenge-card">
      <div class="daily-challenge-header"><h2>🌟 Daily Challenge</h2><p class="daily-date">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p></div>
      <div class="challenge-info">
        <div class="challenge-badge">${modeNames[challenge.mode]}</div>
        <div class="challenge-level"><span class="level-label">Level:</span><span class="level-number">${challenge.level}</span></div>
        <div class="challenge-reward"><span class="reward-icon">🎁</span><span class="reward-text">+${challenge.reward} bonus points</span></div>
      </div>
      <div class="challenge-status">${challenge.completed ? '<div class="challenge-completed">✓ Completed Today!</div>' : '<div class="challenge-pending">Not completed yet</div>'}</div>
      ${!challenge.completed ? `<button class="btn-primary challenge-start-btn" onclick="startDailyChallenge('${challenge.mode}', ${challenge.level})">Start Challenge 🚀</button>` : '<button class="btn-secondary disabled" style="opacity:0.6">Come back tomorrow!</button>'}
    </div>`;
}

function startDailyChallenge(mode, level) { currentMode = mode; startLevel(level); }

// === SHARE & RESET ===
function shareApp() {
  closeMenu();
  if (navigator.share) navigator.share({ title: "EDUFUSION - Gamified Learning", text: "Try EDUFUSION! Learn while having fun! 🎮📚", url: window.location.href }).catch(() => {});
  else navigator.clipboard.writeText(window.location.href).then(() => showNotification("Link copied! 📋"));
}

function resetProgressConfirm() { closeMenu(); showConfirm("🔄 Reset Progress?", "All your progress and scores will be deleted. This cannot be undone!", "Yes, Reset", resetProgress); }
function resetProgress() { closeConfirm(); progress = getDefaultProgress(); saveProgress(); updateModeStats(); showNotification("Progress has been reset! 🔄"); }

// === CONFIRM & NOTIFICATION ===
function showConfirm(title, message, actionText, callback) {
  document.getElementById("confirm-title").innerText = title;
  document.getElementById("confirm-message").innerText = message;
  const btn = document.getElementById("confirm-action-btn"); btn.innerText = actionText; btn.onclick = callback;
  document.getElementById("confirm-dialog").classList.remove("hidden");
}
function closeConfirm() { document.getElementById("confirm-dialog").classList.add("hidden"); }

function showNotification(text) {
  const notif = document.getElementById("notification");
  document.getElementById("notification-text").innerText = text;
  notif.classList.remove("hidden"); notif.classList.add("show");
  setTimeout(() => { notif.classList.remove("show"); setTimeout(() => notif.classList.add("hidden"), 300); }, 2500);
}

// === PWA HELPERS ===
let _deferredInstallPrompt = null;
let _pendingSwWorker = null;
function showPwaBanner() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.classList.remove('hidden');
}

function hidePwaBanner() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.classList.add('hidden');
}

async function triggerPwaInstall() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  const { outcome } = await _deferredInstallPrompt.userChoice;
  _deferredInstallPrompt = null;
  hidePwaBanner();
  if (outcome === 'accepted') showNotification('Installing EduFusion… 📲');
}

function showUpdateToast(worker) {
  _pendingSwWorker = worker;
  const toast = document.getElementById('pwa-update-toast');
  if (toast) toast.classList.remove('hidden');
}

function applySwUpdate() {
  const toast = document.getElementById('pwa-update-toast');
  if (toast) toast.classList.add('hidden');
  if (_pendingSwWorker) _pendingSwWorker.postMessage('SKIP_WAITING');
  // Reload once the new SW takes control
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
}

// === UTILITIES ===
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function playWord(word, event) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(word); utterance.rate = 0.8; utterance.lang = 'fil-PH'; speechSynthesis.speak(utterance);
  }
  if (event && event.target) { event.target.style.transform = "scale(0.9)"; setTimeout(() => event.target.style.transform = "scale(1)", 200); }
}

// Task 8: Haptic feedback helper
function haptic(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// Task 12: Streak banner
function showStreakBanner(streak) {
  const banner = document.createElement('div');
  banner.className = 'streak-banner';
  banner.innerHTML = `🔥 ${streak}x Streak!`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 1500);
}

function playBgMusic() {
  const audio = document.getElementById("bg-music");
  if (!audio || !soundEnabled) return;
  // Set volume from saved preference
  const savedVol = parseFloat(localStorage.getItem("edufusionVolume") ?? "0.7");
  audio.volume = savedVol;
  audio.play().catch(() => {});
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem("edufusionSound", soundEnabled);
  const audio = document.getElementById("bg-music");
  if (soundEnabled) {
    playBgMusic();
  } else {
    if (audio) audio.pause();
  }
  const btn = document.getElementById('sound-menu-btn');
  if (btn) btn.innerText = soundEnabled ? '🔊 Sound' : '🔇 Sound';
  updateVolumeUI();
  showNotification(soundEnabled ? "Sound enabled 🎵" : "Sound disabled 🔇");
}

function setVolume(value) {
  const vol = parseInt(value) / 100;
  const audio = document.getElementById("bg-music");
  if (audio) audio.volume = vol;
  localStorage.setItem("edufusionVolume", vol);
  // Update track fill CSS variable
  const slider = document.getElementById("volume-slider");
  if (slider) slider.style.setProperty('--vol', `${value}%`);
  // Auto-enable sound if user drags volume up from 0
  if (vol > 0 && !soundEnabled) {
    soundEnabled = true;
    localStorage.setItem("edufusionSound", true);
    playBgMusic();
  }
  // Auto-mute if dragged to 0
  if (vol === 0 && audio) audio.pause();
  updateVolumeUI();
}

function toggleMute() {
  const audio = document.getElementById("bg-music");
  if (!audio) return;
  if (audio.paused && soundEnabled) {
    // Was muted via button — unmute
    playBgMusic();
  } else if (!audio.paused) {
    audio.pause();
  } else {
    // Sound was off entirely — turn on
    soundEnabled = true;
    localStorage.setItem("edufusionSound", true);
    playBgMusic();
  }
  updateVolumeUI();
}

function updateVolumeUI() {
  const audio = document.getElementById("bg-music");
  const slider = document.getElementById("volume-slider");
  const valueLabel = document.getElementById("volume-value");
  const muteBtn = document.getElementById("volume-mute-btn");
  const soundBtn = document.getElementById("sound-menu-btn");

  const isMuted = !audio || audio.paused || !soundEnabled;
  const vol = audio ? Math.round(audio.volume * 100) : 70;

  if (slider) {
    slider.value = isMuted ? 0 : vol;
    slider.style.setProperty('--vol', `${isMuted ? 0 : vol}%`);
  }
  if (valueLabel) valueLabel.textContent = isMuted ? "0%" : `${vol}%`;
  if (muteBtn) muteBtn.textContent = isMuted ? "🔇" : (vol < 50 ? "🔉" : "🔊");
  if (soundBtn) soundBtn.innerText = soundEnabled ? "🔊 Sound" : "🔇 Sound";
}

// === ONBOARDING (Task 14) ===
let onboardingSlide = 0;
const totalOnboardingSlides = 4;

function showOnboarding() {
  if (localStorage.getItem('edufusionOnboarded')) return;
  onboardingSlide = 0;
  updateOnboardingSlide();
  document.getElementById('onboarding-modal').classList.remove('hidden');
}

function closeOnboarding() {
  document.getElementById('onboarding-modal').classList.add('hidden');
  localStorage.setItem('edufusionOnboarded', 'true');
}

function nextOnboardingSlide() {
  onboardingSlide++;
  if (onboardingSlide >= totalOnboardingSlides) {
    closeOnboarding();
    return;
  }
  updateOnboardingSlide();
}

function updateOnboardingSlide() {
  document.querySelectorAll('.onboarding-slide').forEach((s, i) => {
    s.classList.toggle('active', i === onboardingSlide);
  });
  const dots = document.getElementById('onboarding-dots');
  if (dots) {
    dots.innerHTML = Array.from({length: totalOnboardingSlides}, (_, i) =>
      `<span class="ob-dot ${i === onboardingSlide ? 'active' : ''}" onclick="goToOnboardingSlide(${i})"></span>`
    ).join('');
  }
  const nextBtn = document.getElementById('onboarding-next');
  if (nextBtn) nextBtn.textContent = onboardingSlide === totalOnboardingSlides - 1 ? "Let's Go! 🚀" : 'Next →';
}

function goToOnboardingSlide(index) {
  onboardingSlide = index;
  updateOnboardingSlide();
}

// === INITIALIZATION ===
document.addEventListener("DOMContentLoaded", async () => {
  const savedTheme = localStorage.getItem("edufusionTheme") || 'theme-dark';
  document.body.classList.add(savedTheme);
  try { await initDatabase(); } catch (e) { console.error(e); }
  
  const videos = document.querySelectorAll('.logo-video');
  videos.forEach(video => {
    video.loop = false;
    const loopPoint = Math.max(0, (video.duration || 10) - 3);
    const checkTime = () => { if (video.currentTime >= loopPoint) video.currentTime = 0; requestAnimationFrame(checkTime); };
    requestAnimationFrame(checkTime);
  });

  if (playerName) {
    try { await loadProgress(playerName); } catch (e) { progress = getDefaultProgress(); }
    checkAchievements(); showDailyChallengeNotif();
    document.getElementById("login-overlay").classList.add("hidden");
    document.getElementById("main-content").classList.remove("hidden");
    updateMenuProfile(); updateModeStats();
    if (soundEnabled) playBgMusic();
    // Restore saved volume
    const savedVol = parseFloat(localStorage.getItem("edufusionVolume") ?? "0.7");
    const audio = document.getElementById("bg-music");
    if (audio) audio.volume = savedVol;
    const slider = document.getElementById("volume-slider");
    const valueLabel = document.getElementById("volume-value");
    if (slider) slider.value = Math.round(savedVol * 100);
    if (slider) slider.style.setProperty('--vol', `${Math.round(savedVol * 100)}%`);
    if (valueLabel) valueLabel.textContent = `${Math.round(savedVol * 100)}%`;
    if (hasPlayedBefore) document.getElementById("greeting").classList.add("hidden");
    else { document.getElementById("greeting").classList.remove("hidden"); document.getElementById("greeting").innerText = `Hello, ${playerName}! 👋 Choose a mode to start!`; }
  }

  // === PWA: Service Worker + Install Prompt ===

  // Capture the browser's install prompt
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredInstallPrompt = e;
    // Only show if user hasn't dismissed it before
    if (!localStorage.getItem('edufusionPwaDismissed')) {
      setTimeout(() => showPwaBanner(), 3000); // show after 3s so it doesn't interrupt login
    }
  });

  // Hide banner once installed
  window.addEventListener('appinstalled', () => {
    hidePwaBanner();
    _deferredInstallPrompt = null;
    showNotification('EduFusion installed! 🎉');
  });

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      // Listen for a waiting SW (new version available)
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast(newWorker);
          }
        });
      });
    }).catch(e => console.warn('SW registration failed:', e));
  }

  // Install banner handlers
  const installBtn = document.getElementById('pwa-install-btn');
  const dismissBtn = document.getElementById('pwa-dismiss-btn');
  if (installBtn) installBtn.addEventListener('click', triggerPwaInstall);
  if (dismissBtn) dismissBtn.addEventListener('click', () => {
    hidePwaBanner();
    localStorage.setItem('edufusionPwaDismissed', '1');
  });

  // === FLOATING TECH + HISTORY BACKGROUND SYMBOLS ===
  const bgSymbols = [
    // Technology
    '⚙️','💻','🔬','📡','🛰️','🔭','⚡','🧬','🖥️','📟',
    // History / Philippines
    '📜','🏛️','⚔️','🗺️','🏺','📖','🎓','🏆','🌏','🔑',
    // Education
    '✏️','📐','🔢','🔤','💡','🧠','📚','🎯','🌟','🏅'
  ];

  function spawnSymbol() {
    const el = document.createElement('span');
    el.className = 'bg-symbol';
    el.textContent = bgSymbols[Math.floor(Math.random() * bgSymbols.length)];
    // Random horizontal position
    el.style.left = `${Math.random() * 100}vw`;
    // Random size between 0.8rem and 1.6rem
    const size = 0.8 + Math.random() * 0.8;
    el.style.fontSize = `${size}rem`;
    // Random duration between 18s and 35s
    const duration = 18 + Math.random() * 17;
    el.style.animationDuration = `${duration}s`;
    // Random delay so they don't all start together
    el.style.animationDelay = `${Math.random() * duration}s`;
    // Subtle color tint — purple, blue, or gold
    const tints = [
      'rgba(102,126,234,0.55)',
      'rgba(240,147,251,0.5)',
      'rgba(255,215,0,0.45)',
      'rgba(100,200,255,0.45)',
      'rgba(255,255,255,0.35)'
    ];
    el.style.color = tints[Math.floor(Math.random() * tints.length)];
    document.body.appendChild(el);
    // Remove after animation completes to avoid DOM buildup
    setTimeout(() => el.remove(), (duration + parseFloat(el.style.animationDelay)) * 1000 + 500);
  }

  // Spawn initial batch
  for (let i = 0; i < 18; i++) spawnSymbol();
  // Keep spawning new ones every 2.5s
  setInterval(spawnSymbol, 2500);
});