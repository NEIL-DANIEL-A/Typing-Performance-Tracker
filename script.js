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

// Wikipedia API (no key required). Difficulty levels are approximate,
// client-side heuristics — Wikipedia does not label articles by difficulty.
const WIKI_API_URL = "https://en.wikipedia.org/api/rest_v1/page/random/summary";
const WIKI_MAX_ATTEMPTS = 3;
const WIKI_MIN_CHARS = 80;
const FALLBACK_MESSAGE = "Unable to fetch a new passage. Using an offline passage instead.";

// ---------- State ----------
let currentPassage = "";
let currentDifficulty = "easy";
let currentTitle = "Offline library";
let currentSourceUrl = "";
let lastWikiTitle = "";     // avoid immediately repeating the same article
let passageRequestSeq = 0;  // guards against stale async responses
let isFetchingPassage = false;
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
const articleTitle = document.getElementById("articleTitle");
const articleLink = document.getElementById("articleLink");
const passageStatus = document.getElementById("passageStatus");
const loadingIndicator = document.getElementById("loadingIndicator");
const newPassageBtn = document.getElementById("newPassageBtn");
const restartBtn = document.getElementById("restartBtn");
const startBtn = document.getElementById("startBtn");

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

// ---------- Wikipedia integration ----------
function isValidWikiUrl(url) {
  return typeof url === "string" && url.indexOf("https://en.wikipedia.org/") === 0;
}

// Collapse whitespace so the passage is clean for typing practice.
function cleanWikiText(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

function splitSentences(text) {
  const matches = String(text).match(/[^.!?]+[.!?]+/g);
  if (!matches || matches.length === 0) return [text].filter(Boolean);
  return matches.map(function (s) { return s.trim(); }).filter(Boolean);
}

function analyzeText(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = splitSentences(text);
  const wordCount = words.length;
  const avgWords = sentences.length > 0 ? wordCount / sentences.length : wordCount;
  let longWords = 0;
  for (let i = 0; i < words.length; i++) {
    const plain = words[i].replace(/[^A-Za-z]/g, "");
    if (plain.length >= 8) longWords++;
  }
  return {
    chars: text.length,
    words: wordCount,
    sentences: sentences.length,
    avgWords: avgWords,
    longRatio: wordCount > 0 ? longWords / wordCount : 0
  };
}

// Approximate difficulty (measurable criteria only — not a readability grade).
function passageMeetsDifficulty(text, difficulty) {
  const a = analyzeText(text);
  if (difficulty === "easy") {
    return a.chars <= 260 && a.avgWords <= 16 && a.longRatio < 0.18;
  }
  if (difficulty === "hard") {
    return a.chars >= 280 || a.avgWords >= 17 || a.longRatio >= 0.15;
  }
  // medium: moderately long, normal sentence structure
  return a.chars >= 150 && a.chars <= 420 && a.avgWords <= 22;
}

// Use a suitable section of the summary (not always the whole extract).
function extractSectionForDifficulty(cleaned, difficulty) {
  const targets = {
    easy: { sentences: 2, maxChars: 220 },
    medium: { sentences: 3, maxChars: 350 },
    hard: { sentences: 4, maxChars: 520 }
  };
  const t = targets[difficulty] || targets.medium;
  const sentences = splitSentences(cleaned);
  let out = "";
  for (let i = 0; i < sentences.length && i < t.sentences; i++) {
    const next = out ? out + " " + sentences[i] : sentences[i];
    if (next.length > t.maxChars && out) break;
    out = next;
  }
  if (!out) out = cleaned.slice(0, t.maxChars);
  // Trim to a word boundary when truncating.
  if (out.length < cleaned.length && out.length >= t.maxChars) {
    const cut = out.slice(0, t.maxChars);
    const space = cut.lastIndexOf(" ");
    out = (space > 40 ? cut.slice(0, space) : cut).trim();
    if (!/[.!?]$/.test(out)) out += ".";
  }
  return out;
}

// Fetch ONE random article summary and validate it. Throws on any problem.
// The thrown error carries err.status (HTTP code) when the server responded.
async function fetchWikipediaPassage() {
  const response = await fetch(WIKI_API_URL, { headers: { accept: "application/json" } });
  if (!response.ok) {
    const err = new Error("HTTP " + response.status);
    err.status = response.status;
    throw err;
  }
  const data = await response.json();
  const title = data && typeof data.title === "string" ? data.title.trim() : "";
  const extract = data && typeof data.extract === "string" ? data.extract : "";
  let url = "";
  if (data && data.content_urls && data.content_urls.desktop &&
      typeof data.content_urls.desktop.page === "string") {
    url = data.content_urls.desktop.page;
  }
  if (!title || !extract) throw new Error("Missing fields");
  const cleaned = cleanWikiText(extract);
  if (cleaned.length < WIKI_MIN_CHARS) throw new Error("Summary too short");
  return { title: title, text: cleaned, url: isValidWikiUrl(url) ? url : "" };
}

// Score how well a candidate fits the difficulty (lower is better).
// Used to keep the "best available" passage when none passes the filter.
function difficultyScore(text, difficulty) {
  const a = analyzeText(text);
  if (difficulty === "easy") {
    return a.avgWords + 100 * a.longRatio + a.chars / 500; // prefer short, simple
  }
  if (difficulty === "hard") {
    return -(a.avgWords + 100 * a.longRatio + a.chars / 200); // prefer long, complex
  }
  // medium: prefer near 250 chars and ~15 words per sentence
  return Math.abs(a.chars - 250) / 50 + Math.abs(a.avgWords - 15);
}

// Try up to WIKI_MAX_ATTEMPTS to find a passage fitting the difficulty.
// Returns the best-scoring candidate; throws if every attempt failed.
// Stops retrying immediately on HTTP 429: Wikipedia is rate-limiting us,
// so further instant retries would fail too and only make it worse.
async function getPassageForDifficulty(difficulty) {
  let best = null;
  let bestScore = Infinity;
  let lastError = null;
  for (let attempt = 0; attempt < WIKI_MAX_ATTEMPTS; attempt++) {
    let raw = null;
    try {
      raw = await fetchWikipediaPassage();
    } catch (e) {
      lastError = e;
      if (e && e.status === 429) break; // rate-limited — stop now
      continue; // transient error — try one of the remaining attempts
    }
    if (raw.title === lastWikiTitle) continue; // avoid immediate repeat
    const section = extractSectionForDifficulty(raw.text, difficulty);
    if (section.length < WIKI_MIN_CHARS) continue; // reject short sections
    const candidate = { title: raw.title, text: section, url: raw.url };
    const score = difficultyScore(section, difficulty);
    if (!best || score < bestScore) {
      best = candidate;
      bestScore = score;
    }
    if (passageMeetsDifficulty(section, difficulty)) return candidate;
  }
  if (best) return best;
  throw lastError || new Error("No suitable passage");
}

function getOfflinePassage(difficulty) {
  return { title: "Offline library", text: getRandomPassage(difficulty), url: "" };
}

// Build the message shown when Wikipedia is unavailable.
function fallbackMessageFor(error) {
  if (error && error.status === 429) {
    return "Wikipedia is rate-limiting requests right now. Using an offline passage — " +
      "wait a few seconds, then click New Passage to try again.";
  }
  return FALLBACK_MESSAGE + " (" + (error && error.message ? error.message : "network error") + ")";
}

// Switch to a built-in passage and explain why (shared by all fetch callers).
function useOfflinePassage(difficulty, error, context) {
  preparePassage(getOfflinePassage(difficulty));
  showPassageStatus(fallbackMessageFor(error), true);
  if (typeof console !== "undefined" && console.warn) {
    console.warn("Wikipedia fetch failed (" + context + "):", error);
  }
}

// Apply a passage object {title, text, url} and reset the test state.
function preparePassage(passageObj) {
  currentPassage = passageObj.text;
  currentTitle = passageObj.title || "Offline library";
  currentSourceUrl = passageObj.url || "";
  if (currentSourceUrl) lastWikiTitle = currentTitle;
  resetTestState();
  updateSourceDisplay();
}

function updateSourceDisplay() {
  // textContent only — never inject article text as HTML.
  articleTitle.textContent = currentTitle;
  if (currentSourceUrl) {
    articleLink.href = currentSourceUrl;
    articleLink.hidden = false;
  } else {
    articleLink.removeAttribute("href");
    articleLink.hidden = true;
  }
  const tag = currentSourceUrl ? "Wikipedia" : "offline";
  passageMeta.textContent =
    "(" + currentDifficulty + ", " + currentPassage.length + " chars, " + tag + ")";
}

function showPassageStatus(message, isError) {
  passageStatus.textContent = message || "";
  if (isError) passageStatus.classList.add("status-error");
  else passageStatus.classList.remove("status-error");
}

function setPassageLoading(loading) {
  isFetchingPassage = loading;
  loadingIndicator.hidden = !loading;
  // Freeze passage-changing controls while loading so a late response
  // can never clobber a restarted test. Dashboard/history stay usable.
  newPassageBtn.disabled = loading;
  restartBtn.disabled = loading;
  if (startBtn) startBtn.disabled = loading;
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
async function startTest() {
  if (isFetchingPassage) return; // prevent conflicting requests
  const myId = ++passageRequestSeq;
  stopTimer(); // prevent duplicate timers
  currentDifficulty = getSelectedDifficulty();
  testDuration = parseInt(durationSelect.value, 10) || 60;
  hideResults();
  setPassageLoading(true);
  showPassageStatus("");
  try {
    const wiki = await getPassageForDifficulty(currentDifficulty);
    if (myId !== passageRequestSeq) return; // stale response — ignore
    preparePassage(wiki);
    showPassageStatus("");
  } catch (e) {
    if (myId !== passageRequestSeq) return;
    useOfflinePassage(currentDifficulty, e, "startTest");
  } finally {
    if (myId === passageRequestSeq) setPassageLoading(false);
  }
  document.getElementById("test").scrollIntoView({ behavior: "smooth" });
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
  updateSourceDisplay();
  updateTypingDisplay();
  typingInput.focus();
}

function restartTest() {
  // Same passage, fresh timer and stats (no fetch — works offline too).
  if (isFetchingPassage) return;
  stopTimer();
  testDuration = parseInt(durationSelect.value, 10) || 60;
  currentDifficulty = getSelectedDifficulty();
  resetTestState();
}

async function pickNewPassage() {
  if (isFetchingPassage) return; // New Passage disabled while loading (guard too)
  const myId = ++passageRequestSeq;
  stopTimer();
  currentDifficulty = getSelectedDifficulty();
  testDuration = parseInt(durationSelect.value, 10) || 60;
  hideResults();
  setPassageLoading(true);
  showPassageStatus("");
  try {
    const wiki = await getPassageForDifficulty(currentDifficulty);
    if (myId !== passageRequestSeq) return;
    preparePassage(wiki);
    showPassageStatus("");
  } catch (e) {
    if (myId !== passageRequestSeq) return;
    useOfflinePassage(currentDifficulty, e, "pickNewPassage");
  } finally {
    if (myId === passageRequestSeq) setPassageLoading(false);
  }
  document.getElementById("test").scrollIntoView({ behavior: "smooth" });
}

// Initial load: show an offline passage instantly (usable without internet),
// then quietly upgrade to a Wikipedia passage if the user hasn't started typing.
async function loadInitialPassage() {
  const myId = ++passageRequestSeq;
  setPassageLoading(true);
  try {
    const wiki = await getPassageForDifficulty(currentDifficulty);
    if (myId !== passageRequestSeq) return;
    if (typingInput.value !== "" || startTime !== null) return; // user busy — keep current
    preparePassage(wiki);
    showPassageStatus("");
  } catch (e) {
    if (myId !== passageRequestSeq) return;
    // Offline passage already showing — report why so "offline" is explainable.
    showPassageStatus(fallbackMessageFor(e), true);
    if (typeof console !== "undefined" && console.warn) console.warn("Wikipedia fetch failed (initial load):", e);
  } finally {
    if (myId === passageRequestSeq) setPassageLoading(false);
  }
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
    if (emptyState) emptyState.style.display = "";
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

  if (emptyState) emptyState.style.display = "none";
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
  // Show an offline passage instantly so the test works without internet,
  // then try to upgrade to a Wikipedia passage in the background.
  currentDifficulty = getSelectedDifficulty();
  testDuration = parseInt(durationSelect.value, 10) || 60;
  const offline = getOfflinePassage(currentDifficulty);
  currentPassage = offline.text;
  currentTitle = offline.title;
  currentSourceUrl = "";
  timeLeft = testDuration;
  testActive = true;
  resultSaved = false;
  renderPassageSpans();
  updateSourceDisplay();
  updateTypingDisplay();
  updateDashboard();
  drawPerformanceChart();
  loadInitialPassage();

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

  if (startBtn) {
    startBtn.addEventListener("click", function () {
      startTest();
    });
  }
  document.getElementById("restartBtn").addEventListener("click", restartTest);
  document.getElementById("newPassageBtn").addEventListener("click", pickNewPassage);
  document.getElementById("clearHistoryBtn").addEventListener("click", clearHistory);

  // Difficulty changes fetch a fresh passage for that level;
  // duration changes only reset the timer (same passage, no fetch).
  const radios = document.querySelectorAll('input[name="difficulty"]');
  for (let i = 0; i < radios.length; i++) {
    radios[i].addEventListener("change", pickNewPassage);
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
