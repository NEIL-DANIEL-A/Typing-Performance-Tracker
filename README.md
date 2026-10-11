# Typing Performance Tracker

A responsive web application for practising typing and measuring typing speed,
accuracy, and overall performance. Typing passages are fetched from Wikipedia,
with built-in passages used automatically when the network is unavailable.

## Features

- Typing tests with Easy, Medium, and Hard difficulty levels
- Test durations of 30, 60, or 120 seconds
- Live character highlighting and current-position indicator
- Live statistics: time remaining, words per minute, accuracy, and character counts
- Results summary with a performance message on test completion
- Performance history with personal best and average speed
- Line chart of recent typing speeds drawn with HTML Canvas
- LocalStorage persistence (data stays in the current browser)

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript
- Wikipedia REST API (no API key required)
- Browser LocalStorage

## Getting Started

No build step or installation is required.

1. Clone or download this repository.
2. Open `index.html` in a modern web browser.

```bash
git clone <repository-url>
cd TypingPerformanceTracker
```

Then open `index.html`, or serve the folder locally:

```bash
python -m http.server 8000
```

## Usage

1. Select a difficulty level and test duration.
2. Click **Start Typing Test** to fetch a passage.
3. Click inside the text area and begin typing. The timer starts on the first keystroke.
4. The test ends when the timer expires or the passage is completed.
5. Use **Restart Test** to retry the same passage or **New Passage** to fetch another one.
6. View past attempts and progress under **Performance History**.

Typing speed is calculated as `(correct characters / 5) / elapsed minutes`.
Accuracy is calculated as `(correct characters / total characters typed) × 100`.

## Project Structure

```
TypingPerformanceTracker/
├── index.html   # Page structure and interface elements
├── style.css    # Styling and responsive layout
├── script.js    # Application logic, scoring, history, and chart
└── logo.svg     # Header logo and browser tab icon
```
