# Shared Calendar

This repository contains a lightweight static web application for a shared
calendar.  The calendar is designed for two people (Brian and his spouse)
to view and manage one‑off events in a GitHub repository without any
backend service.  All data is stored in month‑scoped JSON files within
the `data/` folder and changes are written via the GitHub Contents API
using a personal access token (PAT) provided by the user.

## Features

* **Monthly view** – The calendar defaults to the current month with weeks
  starting on **Monday** and uses 24‑hour time.  You can navigate to
  adjacent months via arrows or by scrolling vertically; older months are
  automatically loaded when you scroll near the top.
* **Event management** – Click a day cell to add a new event or click an
  existing event to edit it.  Events can be deleted via a clear “Delete”
  button.  There are no recurring events; each entry is a single
  occurrence stored as a JSON object.
* **Overlays** – You can overlay events from your personal TripIt
  itinerary and public holiday calendars (US, UK and NL).  These are
  parsed client‑side from configurable iCal URLs and are never written
  back to the repository.
* **Accessibility** – The UI provides large tap targets, keyboard
  navigation, focus outlines and ARIA labels.  All user preferences
  (theme, time format, week start, timezone and overlay sources) are
  configurable on the Settings page and persist locally.
* **Offline friendly** – The app is a simple set of static files: HTML,
  CSS and JavaScript.  There is no build step or server component.

## Quick start

1. **Fork or clone** this repository.
2. **Enable GitHub Pages**: Navigate to your repository on GitHub,
   open **Settings → Pages**, choose **`main` branch** and **`/ (root)`**
   for the source and click **Save**.  If your account is on a paid
   plan you can enable Pages for a private repository.  Otherwise make
   the repository public or host the files yourself.
3. **Configure settings**: Open `index.html` in your browser and click
   the ⚙️ button (or navigate to `settings.html`).  Fill in the following:
   * **Owner** – your GitHub username (`BrianGroth`).
   * **Repository** – the name of this repo (`Calendar`).
   * **Personal Access Token** – generate a PAT at
     <https://github.com/settings/tokens> with the **`repo`** scope.  Copy
     the token and paste it into the field.  The token is stored in
     `localStorage` and sent only when saving events via the GitHub API.
   * Optional: TripIt iCal URL and holiday iCal URLs (US/UK/NL).
   * Adjust timezone, week start or time format if desired.
   Click **Save** to persist these settings.
4. **Use the calendar**: After saving your settings, the calendar will
   load the current month from `data/YYYY-MM.json`.  Click to add events
   or edit existing ones.  Changes are committed back to GitHub with
   descriptive commit messages.

## Data format

Each month’s events live in `data/YYYY-MM.json` and follow this schema:

```json
[
  {
    "id": "uuid-string",
    "title": "string",
    "date": "YYYY-MM-DD",
    "startTime": "HH:mm",
    "endTime": "HH:mm",
    "notes": "string",
    "url": "https://... optional"
  }
]
```

Files are created on demand when you add the first event for a month.
Commit messages follow the convention `feat(events): add events for
YYYY-MM` for new files and `fix(events): update event(s) for
YYYY-MM` for updates or deletions.

## Personal access token (PAT)

The PAT is used to authenticate API requests when saving events.  It
should have the **`repo`** scope.  Store the token in your browser via
the Settings page.  **Never commit or expose your token** – the app
redacts tokens from any error messages and does not log them.  If you
need to rotate your token simply update it in Settings.

## Development notes

* `vendor/date-fns.min.js` bundles the [date‑fns](https://date-fns.org) library
  for date arithmetic.  It exposes a global `dateFns` object and avoids
  the need for external CDNs.
* `lib/github.js` wraps the GitHub Contents API for reading and writing
  files.  It retries on conflicts and hides the PAT from logs.
* `lib/ics.js` provides a minimal `.ics` parser to extract VEVENT
  summaries, start/end times, description and URLs.
* There is **no build step**; deploy this repository directly via
  GitHub Pages or any static file host.

---

Enjoy using your shared calendar!  Feel free to propose improvements via
pull requests or issues.