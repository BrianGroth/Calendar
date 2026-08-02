# Calendar

A polished, responsive personal calendar you can host directly on GitHub Pages.

## Features

- **Focused month view** — scan the month in a spacious grid with a dedicated upcoming-events rail.
- **Responsive agenda** — switch to a chronological list, with a mobile layout tailored for smaller screens.
- **Fast navigation** — step through months, jump to today, or use the month-and-year picker.
- **Event workflow** — add, edit, search, color-code, and delete events with optional times.
- **Accessible controls** — visible focus states, keyboard calendar navigation, and a focus-managed event dialog.
- **No backend** — events stay in browser storage; Export and Import move them between browsers.

## Running locally

This is a static site — open `index.html` in a browser, or serve the folder with any static file server:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In the repository settings, enable **GitHub Pages** for the `main` branch (root folder).
3. The calendar will be available at `https://<username>.github.io/Calendar/`.

## Files

- `index.html` — page structure and accessible controls
- `styles.css` — responsive visual system and motion
- `app.js` — calendar rendering, navigation, interactions, and browser storage
- `calendar-v2-concept.png` — visual design specification for this version

## Contributors

- **Brian Groth** — project creator and maintainer
- **Codex** — UI/UX research, visual design, implementation, accessibility, and QA
