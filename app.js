/*
  Calendar App — app.js (Regenerated)
  ------------------------------------------------------------
  Key features implemented here:
  - Monthly view (Monday-first), 24h time, Europe/Amsterdam
  - Infinite scroll: loads older months when you scroll upward
  - Add/Edit/Delete one-off events via modal
  - GitHub write-back using fine‑grained PAT from Settings (localStorage)
  - Per-month JSON at data/YYYY-MM.json
  - TripIt iCal overlay (read-only) + Holiday overlays (US/UK/NL), toggled per month
  - Accessibility: focus management, ARIA attributes

  Assumptions about the HTML (ids/classes used):
  - #monthsContainer: scrollable container for stacked month sections
  - #settingsBtn: button to open settings page/route (optional)
  - #status: a polite live region for status messages (aria-live="polite")
  - Modal with id #eventModal containing form fields:
      #eventId (hidden), #eventTitle, #eventDate, #eventStart, #eventEnd, #eventNotes, #eventUrl
      #saveEventBtn, #deleteEventBtn, #cancelEventBtn
  - Month header per section contains 3 toggle buttons with data-country="us|uk|nl" and class .holiday-toggle

  External helpers expected (provided by other files in the repo):
  - window.GitHubAPI.getFile(owner, repo, path, token?) -> Promise<{content, sha} | null>
  - window.GitHubAPI.putFile(owner, repo, path, content, sha, token, message) -> Promise<any>
  - window.ICS.parseICS(text) -> [{ summary, start: Date, end: Date, url, description }]

  All sensitive values (PAT, iCal URLs) are read from localStorage only.
*/

;(() => {
  const TZ = 'Europe/Amsterdam';
  const WEEK_START = 1; // Monday
  const STATUS_EL = () => document.getElementById('status');

  // ---------------------------
  // Settings management
  // ---------------------------
  const SETTINGS_KEY = 'calendar.settings.v1';
  const defaultSettings = {
    owner: '',
    repo: 'Calendar',
    token: '', // fine‑grained PAT; stored locally only
    timeFormat24h: true,
    weekStart: 1,
    timezone: TZ,
    theme: 'light',
    tripitIcalUrl: '',
    holidays: {
      usUrl: '',
      ukUrl: '',
      nlUrl: ''
    }
  };

  function loadSettings() {
    try {
      const j = localStorage.getItem(SETTINGS_KEY);
      if (!j) return { ...defaultSettings };
      const parsed = JSON.parse(j);
      return { ...defaultSettings, ...parsed, holidays: { ...defaultSettings.holidays, ...(parsed.holidays || {}) } };
    } catch (e) {
      consoleWarn('Failed to load settings');
      return { ...defaultSettings };
    }
  }

  function saveSettings(next) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }

  // ---------------------------
  // Utilities
  // ---------------------------
  function pad(n) { return n.toString().padStart(2, '0'); }

  function fmtMonthKey(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }

  function monthStart(date) {
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1));
  }

  function monthEnd(date) {
    // last instant of month
    return new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59));
  }

  function toISODateLocal(d) {
    // Return YYYY-MM-DD in local (Amsterdam) semantics; we use UTC-safe operations to avoid TZ drift
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    return `${year}-${month}-${day}`;
  }

  function parseISODate(s) {
    // s like YYYY-MM-DD (no time)
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatTimeHHMM(d) {
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    return `${hh}:${mm}`;
  }

  function announceStatus(msg) {
    const el = STATUS_EL();
    if (el) { el.textContent = msg; }
    console.log('[status]', msg);
  }

  function consoleWarn(msg, err) {
    const masked = (t) => (typeof t === 'string' ? t.replace(/ghp_[A-Za-z0-9]+/g, '***') : t);
    if (err) {
      console.warn(msg, masked(String(err)));
    } else {
      console.warn(msg);
    }
  }

  function uuid() {
    // RFC4122-ish v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ---------------------------
  // GitHub data access (via helper)
  // ---------------------------
  const GH = {
    async loadMonth(settings, y, m) {
      const path = `data/${y}-${pad(m)}.json`;
      try {
        const res = await window.GitHubAPI.getFile(settings.owner, settings.repo, path, settings.token || undefined);
        if (!res) return { events: [], sha: null };
        const arr = JSON.parse(res.content || '[]');
        return { events: Array.isArray(arr) ? arr : [], sha: res.sha || null };
      } catch (e) {
        consoleWarn('Failed to load month from GitHub', e);
        return { events: [], sha: null };
      }
    },
    async saveMonth(settings, y, m, events, sha) {
      const path = `data/${y}-${pad(m)}.json`;
      const body = JSON.stringify(events, null, 2);
      const msg = `feat(events): update ${y}-${pad(m)} (${events.length} record${events.length===1?'':'s'})`;
      return window.GitHubAPI.putFile(settings.owner, settings.repo, path, body, sha || undefined, settings.token, msg);
    }
  };

  // ---------------------------
  // Overlay fetchers (TripIt + Holidays)
  // ---------------------------
  const OverlayCache = new Map(); // key: `${key}|${YYYY-MM}` -> events

  async function fetchICS(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error('ICS fetch failed: ' + resp.status);
    const text = await resp.text();
    return window.ICS.parseICS(text);
  }

  function filterEventsToMonth(evts, monthDate) {
    const start = monthStart(monthDate);
    const end = monthEnd(monthDate);
    return evts.filter(e => {
      const s = e.start instanceof Date ? e.start : new Date(e.start);
      return s >= start && s <= end;
    }).map(e => ({
      id: e.id || uuid(),
      title: e.summary || e.title || 'Untitled',
      date: toISODateLocal(new Date(e.start)),
      startTime: e.start instanceof Date ? formatTimeHHMM(e.start) : '',
      endTime: e.end instanceof Date ? formatTimeHHMM(e.end) : '',
      notes: e.description || '',
      url: e.url || '' ,
      __overlay: true
    }));
  }

  async function getOverlay(key, url, monthDate) {
    if (!url) return [];
    const k = `${key}|${fmtMonthKey(monthDate)}`;
    if (OverlayCache.has(k)) return OverlayCache.get(k);
    try {
      const raw = await fetchICS(url);
      const monthEvents = filterEventsToMonth(raw, monthDate);
      OverlayCache.set(k, monthEvents);
      return monthEvents;
    } catch (e) {
      consoleWarn(`Overlay fetch failed for ${key}`, e);
      return [];
    }
  }

  // ---------------------------
  // Calendar rendering and interaction
  // ---------------------------
  class CalendarApp {
    constructor(rootId = 'monthsContainer') {
      this.settings = loadSettings();
      this.root = document.getElementById(rootId);
      if (!this.root) {
        throw new Error(`#${rootId} not found. Ensure your HTML has <div id="${rootId}">`);
      }
      this.root.classList.add('calendar-scroll');

      this.loadedKeys = new Set(); // set of YYYY-MM already rendered
      this.monthNodes = []; // keep ordered nodes (newest at bottom)
      this.current = new Date();

      this.observeTopSentinel();
      this.renderInitial();
      this.bindModal();
    }

    observeTopSentinel() {
      // When the top sentinel is visible (user scrolled high), load previous month
      const sentinel = document.createElement('div');
      sentinel.id = 'topSentinel';
      sentinel.style.height = '1px';
      sentinel.style.marginTop = '0';
      this.root.prepend(sentinel);

      const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const firstKey = this.monthNodes[0]?.dataset?.monthKey || fmtMonthKey(this.current);
            const [y, m] = firstKey.split('-').map(Number);
            const prev = new Date(y, m - 2, 1); // previous month
            this.ensureMonth(prev);
          }
        });
      }, { root: this.root, threshold: 0.9 });
      io.observe(sentinel);
    }

    async renderInitial() {
      await this.ensureMonth(new Date());
      // Optionally pre-load the previous month for smoothness
      const now = new Date();
      await this.ensureMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    }

    async ensureMonth(d) {
      const key = fmtMonthKey(d);
      if (this.loadedKeys.has(key)) return;
      this.loadedKeys.add(key);

      const section = await this.renderMonthSection(d);

      // Insert in chronological order (older at top)
      const insertBefore = this.monthNodes.find(n => n.dataset.monthKey > key);
      if (insertBefore) {
        this.root.insertBefore(section, insertBefore);
        this.monthNodes.splice(this.monthNodes.indexOf(insertBefore), 0, section);
      } else {
        this.root.appendChild(section);
        this.monthNodes.push(section);
      }
    }

    async renderMonthSection(date) {
      const y = date.getFullYear();
      const m = date.getMonth() + 1;
      const key = fmtMonthKey(date);

      const wrap = document.createElement('section');
      wrap.className = 'month-section';
      wrap.dataset.monthKey = key;
      wrap.setAttribute('aria-label', `Month ${key}`);

      // Header
      const header = document.createElement('header');
      header.className = 'month-header';
      const title = document.createElement('h2');
      title.textContent = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date);
      title.className = 'month-title';
      header.appendChild(title);

      const toggles = document.createElement('div');
      toggles.className = 'holiday-toggles';
      ['us','uk','nl'].forEach(cc => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'holiday-toggle';
        btn.dataset.country = cc;
        btn.setAttribute('aria-pressed', 'false');
        btn.textContent = cc.toUpperCase();
        btn.addEventListener('click', () => this.toggleHolidayOverlay(cc, date, wrap, btn));
        toggles.appendChild(btn);
      });
      header.appendChild(toggles);
      wrap.appendChild(header);

      // Grid
      const grid = document.createElement('div');
      grid.className = 'month-grid';
      grid.setAttribute('role', 'grid');
      grid.setAttribute('aria-readonly', 'false');
      wrap.appendChild(grid);

      // Load base events (from GitHub) + initial render
      const { events, sha } = await GH.loadMonth(this.settings, y, m);
      wrap.dataset.sha = sha || '';
      wrap.__events = Array.isArray(events) ? events : [];

      await this.renderGrid(date, grid, wrap.__events);

      // TripIt overlay load (not auto-on; user can turn on per month later). Pre-cache for snappiness
      this.precacheOverlays(date).catch(()=>{});
      return wrap;
    }

    async precacheOverlays(d) {
      const s = this.settings;
      const tasks = [];
      if (s.tripitIcalUrl) tasks.push(getOverlay('tripit', s.tripitIcalUrl, d));
      if (s.holidays.usUrl) tasks.push(getOverlay('us', s.holidays.usUrl, d));
      if (s.holidays.ukUrl) tasks.push(getOverlay('uk', s.holidays.ukUrl, d));
      if (s.holidays.nlUrl) tasks.push(getOverlay('nl', s.holidays.nlUrl, d));
      await Promise.allSettled(tasks);
    }

    async toggleHolidayOverlay(country, date, section, btn) {
      const pressed = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', String(!pressed));

      const overlayKeyMap = {
        us: this.settings.holidays.usUrl,
        uk: this.settings.holidays.ukUrl,
        nl: this.settings.holidays.nlUrl
      };
      const url = country === 'us' || country === 'uk' || country === 'nl' ? overlayKeyMap[country] : null;

      if (!url && country !== 'tripit') {
        announceStatus(`${country.toUpperCase()} holiday URL not configured in Settings.`);
        return;
      }

      const grid = section.querySelector('.month-grid');
      if (!grid) return;

      const base = section.__events || [];
      const overlay = !pressed ? await getOverlay(country, country==='tripit'?this.settings.tripitIcalUrl:url, date) : [];

      const combined = base.concat(overlay);
      await this.renderGrid(date, grid, combined);
    }

    async renderGrid(date, grid, events) {
      // Clear grid
      grid.innerHTML = '';

      // Compute the day cells range (Monday-first)
      const first = new Date(date.getFullYear(), date.getMonth(), 1);
      const firstWeekday = (first.getDay() + 6) % 7; // convert Sunday(0) -> 6
      const leading = firstWeekday; // number of days from previous month

      const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

      // Header row for weekdays
      const weekdayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const headerRow = document.createElement('div');
      headerRow.className = 'weekday-row';
      weekdayNames.forEach(n => {
        const h = document.createElement('div');
        h.className = 'weekday';
        h.textContent = n;
        headerRow.appendChild(h);
      });
      grid.appendChild(headerRow);

      const totalCells = leading + daysInMonth + (7 - ((leading + daysInMonth) % 7 || 7));
      const todayISO = toISODateLocal(new Date());

      for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        cell.setAttribute('role', 'gridcell');

        const dayNum = i - leading + 1;
        if (i < leading || dayNum > daysInMonth) {
          cell.classList.add('outside');
          grid.appendChild(cell);
          continue;
        }

        const cellDate = new Date(date.getFullYear(), date.getMonth(), dayNum);
        const iso = toISODateLocal(cellDate);
        cell.dataset.date = iso;

        const label = document.createElement('button');
        label.type = 'button';
        label.className = 'day-label';
        label.textContent = String(dayNum);
        label.setAttribute('aria-label', `Add or view events for ${iso}`);
        label.addEventListener('click', () => this.openEventModal({ date: iso }));
        cell.appendChild(label);

        if (iso === todayISO) cell.classList.add('today');

        // Events for this day
        const dayEvents = events.filter(e => e.date === iso);
        const list = document.createElement('ul');
        list.className = 'event-list';

        dayEvents.forEach(ev => {
          const li = document.createElement('li');
          li.className = 'event-item' + (ev.__overlay ? ' overlay' : '');

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'event-btn';
          const timePrefix = ev.startTime ? `${ev.startTime} ` : '';
          btn.textContent = `${timePrefix}${ev.title}`;
          btn.title = ev.notes || '';
          btn.addEventListener('click', () => {
            if (ev.__overlay && ev.url) {
              window.open(ev.url, '_blank');
            } else {
              this.openEventModal(ev);
            }
          });
          li.appendChild(btn);

          if (ev.url && ev.__overlay) {
            const a = document.createElement('a');
            a.href = ev.url; a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.className = 'event-link';
            a.textContent = '↗';
            li.appendChild(a);
          }

          list.appendChild(li);
        });

        cell.appendChild(list);
        grid.appendChild(cell);
      }
    }

    bindModal() {
      this.modal = document.getElementById('eventModal');
      if (!this.modal) { consoleWarn('No #eventModal found; CRUD disabled'); return; }
      const $ = (id) => this.modal.querySelector(id);
      this.f = {
        id: $('#eventId'),
        title: $('#eventTitle'),
        date: $('#eventDate'),
        start: $('#eventStart'),
        end: $('#eventEnd'),
        notes: $('#eventNotes'),
        url: $('#eventUrl'),
        save: $('#saveEventBtn'),
        del: $('#deleteEventBtn'),
        cancel: $('#cancelEventBtn')
      };

      this.f.save?.addEventListener('click', () => this.onSaveEvent());
      this.f.del?.addEventListener('click', () => this.onDeleteEvent());
      this.f.cancel?.addEventListener('click', () => this.closeModal());

      // Close on Escape
      this.modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeModal();
      });
    }

    openEventModal(ev) {
      if (!this.modal) return;
      const isNew = !ev.id;
      const defaults = { id: '', title: '', date: toISODateLocal(new Date()), startTime: '', endTime: '', notes: '', url: '' };
      const data = { ...defaults, ...ev };
      this.editingMonthKey = data.date.slice(0, 7);

      this.f.id.value = data.id || '';
      this.f.title.value = data.title || '';
      this.f.date.value = data.date || '';
      this.f.start.value = data.startTime || '';
      this.f.end.value = data.endTime || '';
      this.f.notes.value = data.notes || '';
      this.f.url.value = data.url || '';

      if (this.f.del) this.f.del.style.display = isNew ? 'none' : '';

      this.modal.showModal?.();
      this.f.title?.focus();
    }

    closeModal() {
      try { this.modal.close?.(); } catch {}
    }

    findSectionByKey(key) {
      return this.monthNodes.find(n => n.dataset.monthKey === key);
    }

    collectBaseEvents(section) {
      return Array.isArray(section.__events) ? section.__events.filter(e => !e.__overlay) : [];
    }

    async onSaveEvent() {
      const s = this.settings;
      if (!s.token || !s.owner || !s.repo) {
        announceStatus('Configure Owner/Repo and paste your GitHub token in Settings first.');
        return;
      }

      const key = this.editingMonthKey;
      const section = this.findSectionByKey(key);
      if (!section) return;

      // Build event
      const ev = {
        id: this.f.id.value || uuid(),
        title: this.f.title.value.trim(),
        date: this.f.date.value,
        startTime: this.f.start.value,
        endTime: this.f.end.value,
        notes: this.f.notes.value,
        url: this.f.url.value
      };
      if (!ev.title || !ev.date) {
        announceStatus('Title and date are required.');
        return;
      }

      // Update in-memory base events
      let base = this.collectBaseEvents(section);
      const idx = base.findIndex(x => x.id === ev.id);
      if (idx >= 0) base[idx] = ev; else base.push(ev);

      // Persist to GitHub
      try {
        const y = Number(key.slice(0,4));
        const m = Number(key.slice(5,7));
        const res = await GH.saveMonth(this.settings, y, m, base, section.dataset.sha || null);
        // After successful save, refresh sha and base events on section
        section.dataset.sha = res?.content?.sha || res?.sha || section.dataset.sha || '';
        section.__events = base; // overlays will be re-applied from toggles
        announceStatus(`Saved to data/${key}.json`);

        // Re-render the visible grid using base + any active overlays
        const grid = section.querySelector('.month-grid');
        const activeCountries = Array.from(section.querySelectorAll('.holiday-toggle[aria-pressed="true"]')).map(b => b.dataset.country);
        let combined = base.slice();
        for (const cc of activeCountries) {
          const url = cc==='tripit'? this.settings.tripitIcalUrl : (this.settings.holidays[cc+ 'Url'] || null);
          const evts = await getOverlay(cc, cc==='tripit'? this.settings.tripitIcalUrl : url, parseISODate(key+'-01'));
          combined = combined.concat(evts);
        }
        await this.renderGrid(parseISODate(key+'-01'), grid, combined);
      } catch (e) {
        consoleWarn('Save failed', e);
        announceStatus('Save failed. Check token permissions and network.');
      }

      this.closeModal();
    }

    async onDeleteEvent() {
      const key = this.editingMonthKey;
      const section = this.findSectionByKey(key);
      if (!section) return;

      const id = this.f.id.value;
      if (!id) { this.closeModal(); return; }

      let base = this.collectBaseEvents(section);
      base = base.filter(e => e.id !== id);

      try {
        const y = Number(key.slice(0,4));
        const m = Number(key.slice(5,7));
        const res = await GH.saveMonth(this.settings, y, m, base, section.dataset.sha || null);
        section.dataset.sha = res?.content?.sha || res?.sha || section.dataset.sha || '';
        section.__events = base;
        announceStatus(`Deleted. Saved to data/${key}.json`);

        const grid = section.querySelector('.month-grid');
        await this.renderGrid(parseISODate(key+'-01'), grid, base);
      } catch (e) {
        consoleWarn('Delete failed', e);
        announceStatus('Delete failed.');
      }

      this.closeModal();
    }
  }

  // Bootstrapping when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    try {
      new CalendarApp('monthsContainer');
      announceStatus('Calendar ready.');
    } catch (e) {
      consoleWarn('Calendar init failed', e);
      announceStatus('Calendar failed to initialize. Check console.');
    }
  });

})();
