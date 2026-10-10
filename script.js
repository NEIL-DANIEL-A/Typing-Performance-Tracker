/* Typing Performance Tracker — script.js
   Vanilla JS: state, timer, DOM updates, LocalStorage, Canvas chart. */

"use strict";

// ---------- Data: passages per difficulty (arrays + objects) ----------
const PASSAGES = {
  easy: [
    "The sun is bright and the sky is blue. I like to run and play every day.",
    "My cat likes to sit in the sun. It drinks milk and sleeps all afternoon.",
    "We read books and learn new words. Reading every day helps us grow.",
    "The dog runs fast in the park. It loves to play with a red ball.",
    "I eat an apple and drink water. Fresh food keeps me strong and happy."
  ],
  medium: [
    "Learning to type quickly takes practice, patience, and steady focus every single day.",
    "The library was quiet, except for the soft turning of pages and distant footsteps.",
    "Although it was raining, the team continued practising on the wet field together.",
    "My favourite season is autumn, when leaves turn gold and the air feels crisp.",
    "Technology changes fast, so students must keep learning new skills all the time."
  ],
  hard: [
    "Extraordinary achievements rarely happen overnight; they require perseverance, discipline, and meticulous preparation.",
    "The physicist hypothesised that quantum fluctuations might elucidate the anomaly observed in the experiment.",
    "Conscientious citizens recognise that privilege entails responsibility, especially amidst socioeconomic disparity.",
    "Synchronised swimmers executed breathtaking pirouettes, juxtaposing athleticism with exquisite choreography.",
    "Pneumonia aside, the entrepreneur's zealous pursuit of cryptocurrency exemplified quixotic exuberance."
  ]
};

const STORAGE_KEY = "tpt_history_v1";

// ---------- State ----------
let currentPassage = "";
let currentDifficulty = "easy";
let testDuration = 60;      // seconds (30 / 60 / 120)
let timeLeft = 60;
let timerId = null;         // interval handle, null when not running
let startTime = null;       // Date timestamp (ms) of first keystroke
let testActive = false;     // true while user may type
let resultSaved = false;    // guard: save only once per test

// ---------- DOM handles ----------
const passageDisplay = document.getElementById("passageDisplay");
const passageMeta = document.getElementById("passageMeta");
const typingInput = document.getElementById("typingInput");
const durationSelect = document.getElementById("durationSelect");
const resultsModal = document.getElementById("resultsModal");

// ---------- Helpers ----------
function getSelectedDifficulty() {
  const checked = document.querySelector('input[name="difficulty"]:checked');
  return checked ? checked.value : "easy";
}

function getRandomPassage(difficulty) {
  const list = PASSAGES[difficulty] || PASSAGES.easy;
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

function getElapsedSeconds() {
  if (startTime === null) return 0;
  return Math.max(0, (Date.now() - startTime) / 1000);
}

// Compare current input against passage; returns {correct, incorrect, total}
function compareInput(passage, typed) {
  let correct = 0;
  let incorrect = 0;
  const total = typed.length;
  for (let i = 0; i < typed.length; i++) {
    if (i < passage.length && typed[i] === passage[i]) {
      correct++;
    } else {
      incorrect++;
    }
  }
  return { correct, incorrect, total };
}

// ---------- Calculations ----------
function calculateWPM(correctChars, elapsedSeconds) {
  if (elapsedSeconds <= 0 || correctChars <= 0) return 0;
  const minutes = elapsedSeconds / 60;
  return (correctChars / 5) / minutes;
}

function calculateAccuracy(correctChars, totalTyped) {
  if (totalTyped <= 0) return 100; // empty input: no errors yet
  return (correctChars / totalTyped) * 100;
}

function performanceMessage(wpm, accuracy) {
  if (wpm >= 60 && accuracy >= 95) return "Outstanding! Professional-level typing!";
  if (wpm >= 40 && accuracy >= 90) return "Great job! Keep practising to go even faster.";
  if (wpm >= 25) return "Good progress! Focus on accuracy to boost speed.";
  return "Nice start! Slow down, aim for accuracy, and speed will follow.";
}

// ---------- Rendering ----------
function renderPassageSpans() {
  // Build one span per character once per passage (fast live updates).
  passageDisplay.textContent = "";
  for (let i = 0; i < currentPassage.length; i++) {
    const span = document.createElement("span");
    span.textContent = currentPassage[i];
    passageDisplay.appendChild(span);
  }
  passageMeta.textContent = "(" + currentDifficulty + ", " + currentPassage.length + " chars)";
}

function updateTypingDisplay() {
  const typed = typingInput.value;
  const spans = passageDisplay.children;
  const stats = compareInput(currentPassage, typed);

  // Loop: mark each visible character correct / incorrect / current.
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    span.classList.remove("correct", "incorrect", "current");
    if (i < typed.length) {
      if (typed[i] === currentPassage[i]) {
        span.classList.add("correct");
      } else {
        span.classList.add("incorrect");
      }
    } else if (i === typed.length && testActive) {
      span.classList.add("current");
    }
  }

  // Live stats always derived from final-text comparison (no delete exploit).
  const elapsed = getElapsedSeconds();
  const wpm = calculateWPM(stats.correct, elapsed);
  const acc = calculateAccuracy(stats.correct, stats.total);

  document.getElementById("liveTime").textContent = Math.ceil(timeLeft) + "s";
  document.getElementById("liveWpm").textContent = Math.round(wpm);
  document.getElementById("liveAccuracy").textContent = Math.round(acc) + "%";
  document.getElementById("liveCorrect").textContent = stats.correct;
  document.getElementById("liveIncorrect").textContent = stats.incorrect;
  document.getElementById("liveTyped").textContent = stats.total;

  // Passage fully typed -> finish early.
  if (testActive && typed.length >= currentPassage.length) {
    finishTest("completed");
  }
}

// ---------- Timer ----------
function updateTimer() {
  const elapsed = getElapsedSeconds();
  timeLeft = Math.max(0, testDuration - elapsed);
  updateTypingDisplay(); // refresh WPM + countdown each tick
  if (timeLeft <= 0) {
    finishTest("timeout");
  }
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

// ---------- Test control ----------
function startTest() {
  stopTimer(); // prevent duplicate timers
  currentDifficulty = getSelectedDifficulty();
  testDuration = parseInt(durationSelect.value, 10) || 60;
  currentPassage = getRandomPassage(currentDifficulty);
  resetTestState();
}

function resetTestState() {
  timeLeft = testDuration;
  startTime = null;
  testActive = true;
  resultSaved = false;
  typingInput.value = "";
  typingInput.disabled = false;
  resultsModal.hidden = true;
  renderPassageSpans();
  updateTypingDisplay();
  typingInput.focus();
}

function restartTest() {
  // Same passage, fresh timer and stats.
  stopTimer();
  testDuration = parseInt(durationSelect.value, 10) || 60;
  currentDifficulty = getSelectedDifficulty();
  resetTestState();
}

function pickNewPassage() {
  stopTimer();
  currentDifficulty = getSelectedDifficulty();
  testDuration = parseInt(durationSelect.value, 10) || 60;
  currentPassage = getRandomPassage(currentDifficulty);
  resetTestState();
  document.getElementById("test").scrollIntoView({ behavior: "smooth" });
}

function finishTest() {
  if (!testActive) return; // guard against double-finish
  testActive = false;
  stopTimer();
  typingInput.disabled = true; // prevent typing after test ends

  // Final results computed from recorded attempt (not stale live display).
  const typed = typingInput.value;
  const stats = compareInput(currentPassage, typed);
  const elapsed = Math.min(getElapsedSeconds() || testDuration, testDuration);
  // If user finished instantly, elapsed may be ~0; fall back to actual typed time safely.
  const safeElapsed = elapsed > 0.5 ? elapsed : (stats.total > 0 ? 0.5 : 0);
  const wpm = Math.round(calculateWPM(stats.correct, safeElapsed));
  const accuracy = Math.round(calculateAccuracy(stats.correct, stats.total) * 10) / 10;

  const result = {
    date: new Date().toISOString(),
    wpm: wpm,
    accuracy: accuracy,
    correct: stats.correct,
    incorrect: stats.incorrect,
    total: stats.total,
    difficulty: currentDifficulty,
    duration: testDuration
  };

  displayResults(result);
  saveResult(result); // saved only once (guarded inside)
  updateDashboard();
  drawPerformanceChart();
}

// ---------- Results modal ----------
function displayResults(result) {
  document.getElementById("resWpm").textContent = result.wpm;
  document.getElementById("resAccuracy").textContent = result.accuracy + "%";
  document.getElementById("resCorrect").textContent = result.correct;
  document.getElementById("resIncorrect").textContent = result.incorrect;
  document.getElementById("resTotal").textContent = result.total;
  document.getElementById("resDuration").textContent = result.duration + "s";
  document.getElementById("resDifficulty").textContent = result.difficulty;
  document.getElementById("resMessage").textContent = performanceMessage(result.wpm, result.accuracy);
  resultsModal.hidden = false;
  document.getElementById("tryAgainBtn").focus();
}

function hideResults() {
  resultsModal.hidden = true;
}

// ---------- History (LocalStorage) ----------
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter out invalid entries gracefully.
    return parsed.filter(function (r) {
      return r && typeof r.wpm === "number" && typeof r.accuracy === "number";
    });
  } catch (e) {
    return []; // corrupt data -> treat as empty
  }
}

function saveResult(result) {
  if (resultSaved) return; // prevent duplicate saving
  resultSaved = true;
  try {
    const history = loadHistory();
    history.push(result);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    renderHistoryList();
  } catch (e) {
    // Storage full / unavailable: still show results, just skip persistence.
  }
}

function clearHistory() {
  const history = loadHistory();
  if (history.length === 0) return;
  const ok = window.confirm("Clear all saved typing history? This cannot be undone.");
  if (!ok) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) { /* ignore */ }
  renderHistoryList();
  updateDashboard();
  drawPerformanceChart();
}

function renderHistoryList() {
  const history = loadHistory();
  const list = document.getElementById("historyList");
  list.textContent = "";
  if (history.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No attempts yet. Complete a test to build your history.";
    list.appendChild(li);
    return;
  }
  // Show newest first.
  const reversed = history.slice().reverse();
  for (let i = 0; i < reversed.length; i++) {
    const r = reversed[i];
    const li = document.createElement("li");
    const date = new Date(r.date);
    const dateStr = isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
    // textContent: safe for user-influenced data.
    li.textContent =
      dateStr + " — " + r.wpm + " WPM, " + r.accuracy + "% accuracy " +
      "(correct " + r.correct + ", incorrect " + r.incorrect + ", " +
      r.difficulty + ", " + r.duration + "s)";
    list.appendChild(li);
  }
}

// ---------- Dashboard ----------
function updateDashboard() {
  const history = loadHistory();
  const emptyState = document.getElementById("emptyState");

  if (history.length === 0) {
    emptyState.style.display = "";
    document.getElementById("statBest").textContent = "—";
    document.getElementById("statLatest").textContent = "—";
    document.getElementById("statAverage").textContent = "—";
    document.getElementById("statAccuracy").textContent = "—";
    document.getElementById("statTotal").textContent = "0";
    document.getElementById("historyBest").textContent = "—";
    document.getElementById("historyAvg").textContent = "—";
    renderHistoryList();
    return;
  }

  emptyState.style.display = "none";
  let best = 0;
  let sum = 0;
  for (let i = 0; i < history.length; i++) {
    if (history[i].wpm > best) best = history[i].wpm;
    sum += history[i].wpm;
  }
  const latest = history[history.length - 1];
  const avg = Math.round((sum / history.length) * 10) / 10;

  document.getElementById("statBest").textContent = best;
  document.getElementById("statLatest").textContent = latest.wpm;
  document.getElementById("statAverage").textContent = avg;
  document.getElementById("statAccuracy").textContent = latest.accuracy;
  document.getElementById("statTotal").textContent = history.length;
  document.getElementById("historyBest").textContent = best + " WPM";
  document.getElementById("historyAvg").textContent = avg + " WPM";
  renderHistoryList();
}

// ---------- Canvas chart ----------
function drawPerformanceChart() {
  const canvas = document.getElementById("performanceChart");
  const summary = document.getElementById("chartSummary");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const history = loadHistory();
  const recent = history.slice(-12); // plot last 12 attempts

  // Handle device pixel ratio + responsive width.
  const cssWidth = canvas.clientWidth || 600;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cssWidth * dpr;
  canvas.height = 260 * dpr;
  ctx.scale(dpr, dpr);
  const W = cssWidth, H = 260;
  ctx.clearRect(0, 0, W, H);

  if (recent.length === 0) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "14px sans-serif";
    ctx.fillText("No history yet — complete a test to see your chart.", 20, H / 2);
    summary.textContent = "No chart data yet. Complete a test to see your progress.";
    return;
  }

  const pad = { left: 44, right: 14, top: 16, bottom: 30 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  let maxWpm = 0;
  for (let i = 0; i < recent.length; i++) {
    if (recent[i].wpm > maxWpm) maxWpm = recent[i].wpm;
  }
  maxWpm = Math.max(maxWpm, 10); // avoid flat/zero scale
  maxWpm = Math.ceil(maxWpm / 10) * 10;

  // Axes
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.lineTo(pad.left + plotW, pad.top + plotH);
  ctx.stroke();

  // Y labels (0, mid, max)
  ctx.fillStyle = "#6b7280";
  ctx.font = "11px sans-serif";
  const ticks = [0, Math.round(maxWpm / 2), maxWpm];
  for (let t = 0; t < ticks.length; t++) {
    const y = pad.top + plotH - (ticks[t] / maxWpm) * plotH;
    ctx.fillText(ticks[t] + " WPM", 2, y + 4);
    ctx.strokeStyle = "#e5e7eb";
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
  }

  // Line + points
  function xFor(i) {
    if (recent.length === 1) return pad.left + plotW / 2;
    return pad.left + (i / (recent.length - 1)) * plotW;
  }
  function yFor(wpm) {
    return pad.top + plotH - (wpm / maxWpm) * plotH;
  }

  ctx.strokeStyle = "#4f46e5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < recent.length; i++) {
    const x = xFor(i), y = yFor(recent[i].wpm);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = "#4f46e5";
  for (let i = 0; i < recent.length; i++) {
    const x = xFor(i), y = yFor(recent[i].wpm);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    // X label: attempt number
    ctx.fillStyle = "#6b7280";
    ctx.fillText("#" + (history.length - recent.length + i + 1), x - 8, H - 10);
    ctx.fillStyle = "#4f46e5";
  }

  // Accessible text summary
  const wpms = recent.map(function (r) { return r.wpm; }).join(", ");
  summary.textContent =
    "Recent WPM scores (oldest to newest): " + wpms + ". " +
    "Best in view: " + maxWpm + " WPM scale. Total attempts: " + history.length + ".";
}

// ---------- Init + events ----------
function initializeApp() {
  // Default passage so the page is usable immediately.
  currentDifficulty = getSelectedDifficulty();
  testDuration = parseInt(durationSelect.value, 10) || 60;
  currentPassage = getRandomPassage(currentDifficulty);
  timeLeft = testDuration;
  testActive = true;
  resultSaved = false;
  renderPassageSpans();
  updateTypingDisplay();
  updateDashboard();
  drawPerformanceChart();

  // Typing: start timer on first input, update highlights + stats.
  typingInput.addEventListener("input", function () {
    if (!testActive) return;
    if (startTime === null) {
      startTime = Date.now();
      stopTimer();
      timerId = setInterval(updateTimer, 250);
    }
    updateTypingDisplay();
  });

  // Prevent pasting huge text from breaking stats: still counts as typed.
  typingInput.addEventListener("paste", function () {
    if (!testActive) return;
    if (startTime === null) {
      startTime = Date.now();
      stopTimer();
      timerId = setInterval(updateTimer, 250);
    }
  });

  document.getElementById("startBtn").addEventListener("click", function () {
    startTest();
    document.getElementById("test").scrollIntoView({ behavior: "smooth" });
  });
  document.getElementById("restartBtn").addEventListener("click", restartTest);
  document.getElementById("newPassageBtn").addEventListener("click", pickNewPassage);
  document.getElementById("clearHistoryBtn").addEventListener("click", clearHistory);

  // Changing settings starts a fresh test with the new option.
  const radios = document.querySelectorAll('input[name="difficulty"]');
  for (let i = 0; i < radios.length; i++) {
    radios[i].addEventListener("change", restartTest);
  }
  durationSelect.addEventListener("change", restartTest);

  // Results modal buttons
  document.getElementById("tryAgainBtn").addEventListener("click", function () {
    hideResults();
    restartTest();
  });
  document.getElementById("anotherPassageBtn").addEventListener("click", function () {
    hideResults();
    pickNewPassage();
  });
  document.getElementById("dashboardBtn").addEventListener("click", function () {
    hideResults();
    restartTest();
    document.getElementById("dashboard").scrollIntoView({ behavior: "smooth" });
  });
  document.getElementById("viewHistoryBtn").addEventListener("click", function () {
    hideResults();
    document.getElementById("history").scrollIntoView({ behavior: "smooth" });
  });

  // Redraw chart on window resize.
  let resizeTimer = null;
  window.addEventListener("resize", function () {
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawPerformanceChart, 200);
  });
}

// Start when DOM is ready (script is at end of body, but be safe).
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}
