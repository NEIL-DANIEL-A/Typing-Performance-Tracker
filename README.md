# Typing Performance Tracker

A beginner-friendly, responsive web app that helps students practise typing and measure
typing speed (WPM), accuracy, and overall performance. Passages are fetched live from
Wikipedia, with built-in offline passages as an automatic fallback.

Built strictly with **HTML5, CSS3, and vanilla JavaScript** — no frameworks, no backend,
no build step. Open `index.html` in a browser and it runs.

## Features

- **Home dashboard** — best / latest / average WPM, latest accuracy, total tests, plus an
  empty state before the first test.
- **Typing test** — Easy / Medium / Hard difficulties, 30 / 60 / 120-second durations,
  live character highlighting (green = correct, red = incorrect, marker = current position).
- **Live statistics** — time remaining, WPM, accuracy, correct / incorrect / typed counts,
  updated as you type.
- **Results modal** — final WPM, accuracy, character counts, duration, difficulty, and a
  performance message, with Try Again / Another Passage / Dashboard / View History actions.
- **Performance history** — every completed test is saved in LocalStorage (this browser
  only) with date, WPM, accuracy, counts, difficulty, and duration. Personal best, average,
  clear-history (with confirmation).
- **Performance chart** — hand-drawn HTML Canvas line chart of recent WPM scores, with a
  text summary for accessibility. Redraws on new results, history clear, and window resize.
- **Wikipedia passages** — random article summaries via the Wikipedia REST API, trimmed to
  a difficulty-appropriate section, with article title and "Read on Wikipedia" source link.

## Tech Stack

| Layer   | Technology                                      |
|---------|-------------------------------------------------|
| Markup  | HTML5 (semantic: `header`, `nav`, `main`, `section`, `article`, `footer`) |
| Styling | CSS3 (custom properties, Flexbox, Grid, positioning + `z-index`, transitions, media queries) |
| Logic   | Vanilla JavaScript (DOM, events, timers, `fetch` + `async/await`, Canvas) |
| Content | Wikipedia REST API (`page/random/summary`), no key required |
| Storage | Browser LocalStorage (same key as before: `tpt_history_v1`) |

No React / Angular / Vue, no CSS frameworks, no chart libraries, no backend, no login.

## Project Structure

```
TypingPerformanceTracker/
├── index.html   # Semantic structure and interface elements
├── style.css    # All styling and responsive behaviour
├── script.js    # Test logic, scoring, history, LocalStorage, Canvas chart, Wikipedia fetch
├── logo.svg     # Header + tab (favicon) logo
└── README.md    # This file
```

## How to Run

1. Download or copy the project folder.
2. Double-click `index.html` — it opens in any modern browser (Chrome, Edge, Firefox).
3. No server, no internet setup, no installation required.
   - Internet is only needed for fresh Wikipedia passages; without it the app
     automatically uses built-in offline passages.

Optional (for cleaner CORS behaviour in some setups):

```bash
cd "TypingPerformanceTracker"
python -m http.server 8000
# then open http://localhost:8000
```

## How to Use

1. Choose a **difficulty** (Easy / Medium / Hard) and a **duration** (30 / 60 / 120 s).
2. Click **Start Typing Test** — a fresh Wikipedia passage is fetched.
3. Click inside the text box and start typing. **The timer starts on your first keystroke.**
4. The test ends when time runs out or you finish the whole passage.
5. Review your results, then Try Again, grab Another Passage, or check your History.
6. **New Passage** fetches a different article any time; **Restart Test** replays the
   current passage with a fresh timer.

## How Scores Are Calculated

Standard five-characters-per-word method:

```
WPM      = (Correct Characters ÷ 5) ÷ Elapsed Minutes
Accuracy = (Correct Characters ÷ Total Characters Typed) × 100
```

Notes:

- Empty input counts as 100% accuracy until you type (no division by zero).
- Scores are recomputed from your **final text** on every update, so deleting and
  retyping cannot inflate your score — only characters correct at the end count.
- A result is saved exactly once per completed test, never just for fetching a passage.

## Difficulty Levels (Approximate)

Wikipedia does not label articles by difficulty, so the app applies a client-side
heuristic (sentence length, word count, passage length, long-word ratio):

| Level  | Passage shape                          | Filter (approx.)                              |
|--------|----------------------------------------|-----------------------------------------------|
| Easy   | First 2 sentences, ≤ 220 chars        | ≤ 260 chars, ≤ 16 words/sentence, few long words |
| Medium | First 3 sentences, ≤ 350 chars        | 150–420 chars, ≤ 22 words/sentence            |
| Hard   | First 4 sentences, ≤ 520 chars        | Long passages / long sentences / complex words |

The app retries up to 3 times for a fitting article, then uses the best available
passage. Treat these as rough levels, not readability grades.

## Wikipedia Integration & Offline Fallback

- Endpoint: `https://en.wikipedia.org/api/rest_v1/page/random/summary` via
  `fetch()` + `async/await`; `response.ok` is checked and `title` / `extract` /
  `content_urls.desktop.page` are validated before use.
- Whitespace is collapsed, a difficulty-sized section is extracted, and repeats of the
  same article are avoided. Simultaneous requests are guarded (stale responses ignored,
  buttons disabled while loading).
- On HTTP 429 (Wikipedia rate-limits rapid requests), the app stops retrying
  immediately and tells you to wait a few seconds before trying **New Passage** again.
- On any failure (offline, blocked request, short/invalid summary), the app shows
  *"Unable to fetch a new passage. Using an offline passage instead."* and serves a
  built-in passage — the test is never left unusable.

## Browser Data Notice

History lives in **this browser only** (LocalStorage). It survives refresh, is not
synced across devices, and disappears if browser data is cleared.

## Syllabus Alignment

HTML tags and semantic layout · text elements and lists · CSS selectors, box model,
positioning and `z-index` (results modal) · Flexbox and Grid · variables and data types ·
functions (`startTest`, `calculateWPM`, `drawPerformanceChart`, …) · objects (results,
timestamps) · loops and conditionals (character comparison) · DOM manipulation and events ·
form inputs (`textarea`, radios, `select`) · HTML Canvas chart.

## Testing Checklist

- [ ] Page opens by double-clicking `index.html`; console shows no errors.
- [ ] Timer starts only on first keystroke; stops at the selected duration.
- [ ] Correct / incorrect / current characters highlight accurately.
- [ ] WPM and accuracy match the formulas above.
- [ ] Finishing the passage ends the test; Restart resets timer and stats.
- [ ] Each completed test saves exactly once; history survives refresh.
- [ ] Dashboard stats and Canvas chart update on save and on clear.
- [ ] New Passage fetches a new article; offline shows the fallback message.
- [ ] Layout works on desktop and mobile widths.
