/*
 * Main application logic for the shared calendar.
 *
 * This module orchestrates month loading, rendering, event CRUD, overlays
 * (TripIt and holidays) and interaction with the GitHub API helper.  It
 * persists user preferences in localStorage via the settings page (see
 * settings.html).  The calendar view uses date‑fns for date arithmetic.
 */

(() => {
  // DOM references
  const calendarContainer = document.getElementById('calendarContainer');
  const monthTitle = document.getElementById('monthTitle');
  const prevMonthBtn = document.getElementById('prevMonth');
  const nextMonthBtn = document.getElementById('nextMonth');
  const settingsButton = document.getElementById('settingsButton');
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modalTitle');
  const eventForm = document.getElementById('eventForm');
  const deleteEventBtn = document.getElementById('deleteEvent');
  const cancelEventBtn = document.getElementById('cancelEvent');
  const toggleHolidayUS = document.getElementById('toggleHolidayUS');
  const toggleHolidayUK = document.getElementById('toggleHolidayUK');
  const toggleHolidayNL = document.getElementById('toggleHolidayNL');

  // Load settings from localStorage or provide defaults
  function loadSettings() {
    const raw = localStorage.getItem('calendarSettings');
    let defaults = {
      owner: '',
      repo: '',
      token: '',
      tripitIcalUrl: '',
      holidays: {
        usUrl: '',
        ukUrl: '',
        nlUrl: ''
      },
      theme: 'light',
      timezone: 'Europe/Amsterdam',
      weekStart: 1, // Monday
      timeFormat: '24h'
    };
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        defaults = { ...defaults, ...parsed };
        // Merge nested holidays
        defaults.holidays = { ...defaults.holidays, ...(parsed.holidays || {}) };
      } catch (e) {
        console.warn('Failed to parse settings', e);
      }
    }
    return defaults;
  }

  const settings = loadSettings();

  // Application state
  const state = {
    currentYear: null,
    currentMonth: null,
    months: [], // array of month objects in order from newest to oldest
    monthMap: {}, // key (YYYY-MM) -> {events: [], sha: string|null, element}
    overlayCache: {}, // key (YYYY-MM) -> {us: {events, ts}, uk: ..., nl: ..., tripit: {events, ts}}
    loading: false
  };

  // Utility: format year-month key
  function formatKey(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  // Utility: fetch and parse JSON from GitHub for a given month
  async function fetchMonthData(year, month) {
    const key = formatKey(year, month);
    if (state.monthMap[key]) return state.monthMap[key];
    const path = `data/${key}.json`;
    let events = [];
    let sha = null;
    try {
      const file = await getFile(settings.owner, settings.repo, path, settings.token);
      if (file) {
        events = JSON.parse(file.content);
        sha = file.sha;
      }
    } catch (err) {
      // If reading fails (network, parse, etc.) we still proceed with empty events
      console.error('Error loading month data', err);
    }
    const monthObj = { events, sha, element: null };
    state.monthMap[key] = monthObj;
    return monthObj;
  }

  // Utility: save events array back to GitHub
  async function saveMonthData(year, month) {
    const key = formatKey(year, month);
    const monthObj = state.monthMap[key];
    if (!monthObj) throw new Error('Month not loaded');
    const path = `data/${key}.json`;
    const content = JSON.stringify(monthObj.events, null, 2);
    const isNew = !monthObj.sha;
    const action = isNew ? 'add' : 'update';
    const count = 1; // commit message references number of events changed (simplified)
    const messagePrefix = isNew ? 'feat(events)' : 'fix(events)';
    const message = `${messagePrefix}: ${action} event${isNew ? 's' : ''} for ${key}`;
    try {
      const result = await putFile(settings.owner, settings.repo, path, content, monthObj.sha || null, settings.token, message);
      monthObj.sha = result.content.sha;
    } catch (err) {
      console.error(err);
      alert('Failed to save events. Please check your GitHub settings and token.');
      throw err;
    }
  }

  // Utility: build and insert a month into the DOM.  Optionally provide overlay
  // events if already fetched.
  function buildMonth(year, month) {
    const key = formatKey(year, month);
    const monthObj = state.monthMap[key];
    // Create month section container
    const section = document.createElement('section');
    section.className = 'month-section';
    section.dataset.year = year;
    section.dataset.month = month;
    // Month header with local holiday toggles
    const header = document.createElement('div');
    header.className = 'month-header';
    const headerTitle = document.createElement('h2');
    headerTitle.textContent = dateFns.format(new Date(year, month - 1, 1), 'MMMM yyyy');
    header.appendChild(headerTitle);
    section.appendChild(header);
    // Calendar grid
    const grid = document.createElement('div');
    grid.className = 'month-grid';
    // Determine range to display: first day of month and start of week (Monday) before
    const firstDay = dateFns.startOfMonth(new Date(year, month - 1));
    const lastDay = dateFns.endOfMonth(new Date(year, month - 1));
    const startDate = dateFns.startOfWeek(firstDay, { weekStartsOn: settings.weekStart });
    const endDate = dateFns.endOfWeek(lastDay, { weekStartsOn: settings.weekStart });
    const days = dateFns.eachDayOfInterval({ start: startDate, end: endDate });
    days.forEach((day) => {
      const cell = document.createElement('div');
      cell.className = 'day-cell';
      cell.tabIndex = 0;
      // Determine if this day belongs to current month
      const isCurrentMonth = dateFns.isSameMonth(day, firstDay);
      if (!isCurrentMonth) cell.classList.add('outside');
      const dateStr = dateFns.format(day, 'yyyy-MM-dd');
      cell.dataset.date = dateStr;
      // Day header (numeric day)
      const headerDiv = document.createElement('div');
      headerDiv.className = 'day-header';
      headerDiv.textContent = dateFns.format(day, 'd');
      cell.appendChild(headerDiv);
      // Container for events
      const eventsContainer = document.createElement('div');
      eventsContainer.className = 'events-container';
      cell.appendChild(eventsContainer);
      // Attach click handler
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        openEventModal({ date: dateStr });
      });
      grid.appendChild(cell);
    });
    section.appendChild(grid);
    // Insert into DOM at the end (for most recent month) or at top (for older months)
    monthObj.element = section;
    calendarContainer.appendChild(section);
    // Render events into this month
    renderEventsForMonth(year, month);
  }

  // Helper to find a day cell by date
  function findDayCell(dateStr) {
    return calendarContainer.querySelector(`.day-cell[data-date="${dateStr}"] .events-container`);
  }

  // Render events and overlays for a given month
  function renderEventsForMonth(year, month) {
    const key = formatKey(year, month);
    const monthObj = state.monthMap[key];
    if (!monthObj || !monthObj.element) return;
    // Clear existing event elements
    const grid = monthObj.element.querySelector('.month-grid');
    grid.querySelectorAll('.events-container').forEach((container) => {
      container.innerHTML = '';
    });
    // Render stored events
    monthObj.events.forEach((ev) => {
      const container = findDayCell(ev.date);
      if (!container) return;
      const item = document.createElement('div');
      item.className = 'event-item';
      item.title = `${ev.startTime}–${ev.endTime} ${ev.title}`;
      item.textContent = `${ev.startTime} ${ev.title}`;
      item.tabIndex = 0;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        openEventModal({ ...ev, monthKey: key });
      });
      container.appendChild(item);
    });
    // Render overlay events (TripIt and holidays)
    const overlay = state.overlayCache[key] || {};
    const overlaysEnabled = {
      us: toggleHolidayUS.checked,
      uk: toggleHolidayUK.checked,
      nl: toggleHolidayNL.checked,
      tripit: true // TripIt overlay is always enabled once URL set
    };
    Object.entries(overlay).forEach(([type, data]) => {
      if (!overlaysEnabled[type]) return;
      (data.events || []).forEach((oev) => {
        const container = findDayCell(oev.date);
        if (!container) return;
        const item = document.createElement('div');
        item.className = 'event-item overlay-event';
        item.title = `${oev.startTime}–${oev.endTime} ${oev.title}`;
        item.textContent = `${oev.startTime} ${oev.title}`;
        item.tabIndex = 0;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          if (oev.url) window.open(oev.url, '_blank');
        });
        container.appendChild(item);
      });
    });
  }

  // Load overlay events for a month if toggled on and not cached or expired
  async function ensureOverlays(year, month) {
    const key = formatKey(year, month);
    if (!state.overlayCache[key]) state.overlayCache[key] = {};
    const cacheEntry = state.overlayCache[key];
    const now = Date.now();
    const ttl = 24 * 60 * 60 * 1000; // 24h
    // Helper to fetch and parse an iCal url
    async function fetchIcal(url) {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to fetch ${url}`);
      const text = await resp.text();
      return parseICS(text);
    }
    // TripIt overlay
    if (settings.tripitIcalUrl) {
      if (!cacheEntry.tripit || (now - cacheEntry.tripit.ts) > ttl) {
        try {
          const events = await fetchIcal(settings.tripitIcalUrl);
          // Filter events to the month
          const filtered = events.filter(ev => ev.date.startsWith(key));
          cacheEntry.tripit = { events: filtered, ts: now };
        } catch (e) {
          console.warn('Failed to fetch TripIt overlay', e);
          cacheEntry.tripit = { events: [], ts: now };
        }
      }
    }
    // Holidays
    const holidayTypes = [
      { id: 'us', url: settings.holidays.usUrl },
      { id: 'uk', url: settings.holidays.ukUrl },
      { id: 'nl', url: settings.holidays.nlUrl }
    ];
    for (const { id, url } of holidayTypes) {
      if (!url) continue;
      if (!cacheEntry[id] || (now - cacheEntry[id].ts) > ttl) {
        try {
          const events = await fetchIcal(url);
          const filtered = events.filter(ev => ev.date.startsWith(key));
          cacheEntry[id] = { events: filtered, ts: now };
        } catch (e) {
          console.warn(`Failed to fetch holidays ${id}`, e);
          cacheEntry[id] = { events: [], ts: now };
        }
      }
    }
  }

  // Open the modal to add or edit an event.
  // If an event object is provided (with id) we edit; otherwise create new.
  function openEventModal(ev) {
    const isEdit = !!ev.id;
    modalTitle.textContent = isEdit ? 'Edit Event' : 'Add Event';
    modal.setAttribute('aria-hidden', 'false');
    // Pre-fill fields
    document.getElementById('eventId').value = ev.id || '';
    document.getElementById('eventTitle').value = ev.title || '';
    document.getElementById('eventDate').value = ev.date || '';
    document.getElementById('eventStart').value = ev.startTime || '';
    document.getElementById('eventEnd').value = ev.endTime || '';
    document.getElementById('eventNotes').value = ev.notes || '';
    document.getElementById('eventUrl').value = ev.url || '';
    deleteEventBtn.hidden = !isEdit;
    // Store month key so save/delete knows where to write
    eventForm.dataset.monthKey = ev.monthKey || formatKey(state.currentYear, state.currentMonth);
  }

  // Close modal helper
  function closeModal() {
    modal.setAttribute('aria-hidden', 'true');
    eventForm.reset();
    deleteEventBtn.hidden = true;
  }

  // Generate a UUID for new events
  function generateId() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback (not cryptographically secure)
    return 'id-' + Math.random().toString(36).substr(2, 9);
  }

  // Event form submission handler
  eventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(eventForm);
    const id = formData.get('id') || generateId();
    const title = formData.get('title').trim();
    const date = formData.get('date');
    const startTime = formData.get('startTime');
    const endTime = formData.get('endTime');
    const notes = formData.get('notes').trim();
    const url = formData.get('url').trim();
    if (!title || !date || !startTime || !endTime) {
      alert('Please fill in all required fields.');
      return;
    }
    // Validate time ordering
    if (endTime < startTime) {
      alert('End time must be after start time.');
      return;
    }
    const monthKey = eventForm.dataset.monthKey;
    const monthObj = state.monthMap[monthKey];
    if (!monthObj) {
      alert('Month data not loaded.');
      return;
    }
    // Check if event exists
    const idx = monthObj.events.findIndex(ev => ev.id === id);
    const eventData = { id, title, date, startTime, endTime, notes, url };
    if (idx >= 0) {
      monthObj.events[idx] = eventData;
    } else {
      monthObj.events.push(eventData);
    }
    try {
      await saveMonthData(parseInt(monthKey.slice(0, 4)), parseInt(monthKey.slice(5, 7)));
      // Re-render the month
      renderEventsForMonth(parseInt(monthKey.slice(0, 4)), parseInt(monthKey.slice(5, 7)));
      closeModal();
    } catch (err) {
      // Error already handled in saveMonthData
    }
  });

  // Delete button handler
  deleteEventBtn.addEventListener('click', async (e) => {
    const id = document.getElementById('eventId').value;
    const monthKey = eventForm.dataset.monthKey;
    const monthObj = state.monthMap[monthKey];
    if (!monthObj) return;
    const idx = monthObj.events.findIndex(ev => ev.id === id);
    if (idx >= 0) {
      monthObj.events.splice(idx, 1);
      try {
        await saveMonthData(parseInt(monthKey.slice(0, 4)), parseInt(monthKey.slice(5, 7)));
        renderEventsForMonth(parseInt(monthKey.slice(0, 4)), parseInt(monthKey.slice(5, 7)));
        closeModal();
      } catch (err) {
        // handled in saveMonthData
      }
    } else {
      closeModal();
    }
  });

  // Cancel button simply closes the modal
  cancelEventBtn.addEventListener('click', (e) => {
    closeModal();
  });

  // Settings button navigates to settings page
  settingsButton.addEventListener('click', () => {
    window.location.href = 'settings.html';
  });

  // Holiday toggle handlers: re-render overlays when toggles change
  [toggleHolidayUS, toggleHolidayUK, toggleHolidayNL].forEach((toggle) => {
    toggle.addEventListener('change', () => {
      // Re-render overlays for all loaded months
      state.months.forEach(({ year, month }) => {
        renderEventsForMonth(year, month);
      });
    });
  });

  // Month navigation handlers (fallback in case infinite scroll is not used)
  prevMonthBtn.addEventListener('click', async () => {
    const prevDate = dateFns.subMonths(new Date(state.currentYear, state.currentMonth - 1, 1), 1);
    await loadAndDisplayMonth(prevDate.getFullYear(), prevDate.getMonth() + 1, { append: false, scrollTo: true });
  });
  nextMonthBtn.addEventListener('click', async () => {
    const nextDate = dateFns.addMonths(new Date(state.currentYear, state.currentMonth - 1, 1), 1);
    await loadAndDisplayMonth(nextDate.getFullYear(), nextDate.getMonth() + 1, { append: true, scrollTo: true });
  });

  // Scroll event: load older months when near top
  calendarContainer.addEventListener('scroll', async () => {
    if (calendarContainer.scrollTop < 100 && !state.loading) {
      const earliest = state.months[state.months.length - 1];
      if (!earliest) return;
      const prevDate = dateFns.subMonths(new Date(earliest.year, earliest.month - 1, 1), 1);
      await loadAndDisplayMonth(prevDate.getFullYear(), prevDate.getMonth() + 1, { append: false, scrollTo: false });
    }
  });

  /**
   * Load the specified month, build the DOM and overlays, and update state.
   *
   * @param {number} year Calendar year
   * @param {number} month Calendar month (1–12)
   * @param {Object} options {append: boolean, scrollTo: boolean}
   */
  async function loadAndDisplayMonth(year, month, options = {}) {
    const key = formatKey(year, month);
    if (state.monthMap[key] && state.monthMap[key].element) {
      // Already loaded: optionally scroll into view
      if (options.scrollTo) {
        state.monthMap[key].element.scrollIntoView({ behavior: 'smooth' });
      }
      // Update current pointers
      state.currentYear = year;
      state.currentMonth = month;
      monthTitle.textContent = dateFns.format(new Date(year, month - 1, 1), 'MMMM yyyy');
      return;
    }
    state.loading = true;
    // Fetch events and overlays in parallel
    await fetchMonthData(year, month);
    await ensureOverlays(year, month);
    // Build month DOM
    buildMonth(year, month);
    // Keep months array sorted: newest at index 0
    if (options.append === false) {
      // Insert at end (older month) -> physically before first child
      const section = state.monthMap[key].element;
      calendarContainer.insertBefore(section, calendarContainer.firstChild);
      state.months.push({ year, month });
      // Adjust scroll position so user remains on same visible portion
      calendarContainer.scrollTop += section.offsetHeight + 16;
    } else {
      state.months.unshift({ year, month });
    }
    // Update current
    state.currentYear = year;
    state.currentMonth = month;
    monthTitle.textContent = dateFns.format(new Date(year, month - 1, 1), 'MMMM yyyy');
    state.loading = false;
  }

  // Initial setup: load current month
  (async function init() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    await loadAndDisplayMonth(year, month, { append: true, scrollTo: false });
    // Preload previous month for smoother scroll
    const prevDate = dateFns.subMonths(new Date(year, month - 1, 1), 1);
    await loadAndDisplayMonth(prevDate.getFullYear(), prevDate.getMonth() + 1, { append: false, scrollTo: false });
  })().catch((err) => console.error(err));

})();