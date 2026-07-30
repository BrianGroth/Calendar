# Calendar

A clean, static two-month calendar you can host directly on GitHub Pages.

## Features

- **Two-month view** — see the current month and the next side by side.
- **Month navigation** — step forward/back one month at a time, or jump back to today.
- **Per-day details** — click any day to add, view, or delete notes (with optional time and color tag).
- **No backend** — all details are saved to your browser's local storage. Use Export/Import to back up or move your data between browsers.

## Running locally

This is a static site — just open `index.html` in a browser, or serve the folder with any static file server, e.g.:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In the repo settings, enable **GitHub Pages** for the `main` branch (root folder).
3. Your calendar will be live at `https://<username>.github.io/Calendar/`.

## Files

- `index.html` — page structure
- `styles.css` — styling (light/dark mode aware)
- `app.js` — calendar rendering, navigation, and event storage logic
