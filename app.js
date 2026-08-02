/*
  Calendar App — app.js
  Single-month view with an "Upcoming" agenda sidebar, agenda-only view,
  search, quick month/year jump, and per-day event add/edit/delete.
  Events are persisted to localStorage; no backend required.
*/

const STORAGE_KEY = "calendar.events.v1";
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_LABELS_SHORT = MONTH_LABELS.map((m) => m.slice(0, 3));
const UPCOMING_LIMIT = 8;

let events = loadEvents();
let anchorYear = new Date().getFullYear();
let anchorMonth = new Date().getMonth(); // 0-based
let pickerYear = anchorYear;
let activeDateKey = null;
let editingEventId = null;
let viewMode = "month"; // "month" | "agenda"
let searchQuery = "";
let lastFocusedElement = null;

const gridViewportEl = document.getElementById("calendarGrid");
let currentGridEl = null;
const weekdayRowEl = document.getElementById("weekdayRow");
const rangeLabelEl = document.getElementById("rangeLabel");
const titleBtn = document.getElementById("titleBtn");
const datePickerEl = document.getElementById("datePicker");
const yearLabelEl = document.getElementById("yearLabel");
const monthGridEl = document.getElementById("monthGrid");
const agendaPanelEl = document.getElementById("agendaPanel");
const agendaListEl = document.getElementById("agendaList");
const agendaFullPanelEl = document.getElementById("agendaFullPanel");
const agendaFullListEl = document.getElementById("agendaFullList");
const monthPanelEl = document.getElementById("monthPanel");
const monthViewBtn = document.getElementById("monthViewBtn");
const agendaViewBtn = document.getElementById("agendaViewBtn");
const searchInput = document.getElementById("searchInput");
const menuBtn = document.getElementById("menuBtn");
const menuDropdown = document.getElementById("menuDropdown");
const agendaDateEl = document.getElementById("agendaDate");
const mobileMonthBtn = document.getElementById("mobileMonthBtn");
const mobileAgendaBtn = document.getElementById("mobileAgendaBtn");

const modalEl = document.getElementById("dayModal");
const modalTitleEl = document.getElementById("modalTitle");
const eventListEl = document.getElementById("eventList");
const eventFormEl = document.getElementById("eventForm");
const eventTitleInput = document.getElementById("eventTitle");
const eventTimeInput = document.getElementById("eventTime");
const eventColorSelect = document.getElementById("eventColor");
const eventColorOptions = Array.from(document.querySelectorAll(".color-option"));
const eventDateDisplay = document.getElementById("eventDateDisplay");
const modalDateLabel = document.getElementById("modalDateLabel");
const submitEventBtn = document.getElementById("submitEventBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");

document.getElementById("prevBtn").addEventListener("click", () => shiftMonth(-1));
document.getElementById("nextBtn").addEventListener("click", () => shiftMonth(1));
document.getElementById("todayBtn").addEventListener("click", goToToday);
document.getElementById("newEventBtn").addEventListener("click", openNewEventForToday);
document.getElementById("closeModal").addEventListener("click", closeModal);
document.getElementById("cancelModalBtn").addEventListener("click", closeModal);
modalEl.addEventListener("click", (e) => {
  if (e.target === modalEl) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!modalEl.hidden) closeModal();
    if (!datePickerEl.hidden) closeDatePicker();
    if (!menuDropdown.hidden) closeMenu();
  }
  if (e.key === "Tab" && !modalEl.hidden) trapModalFocus(e);
});
eventFormEl.addEventListener("submit", handleSubmitEvent);
cancelEditBtn.addEventListener("click", exitEditMode);
eventColorOptions.forEach((button) => {
  button.addEventListener("click", () => selectEventColor(button.dataset.color));
});
document.getElementById("exportBtn").addEventListener("click", exportEvents);
document.getElementById("importInput").addEventListener("change", importEvents);

titleBtn.addEventListener("click", toggleDatePicker);
document.getElementById("yearPrev").addEventListener("click", () => {
  pickerYear -= 1;
  renderMonthPickerGrid();
});
document.getElementById("yearNext").addEventListener("click", () => {
  pickerYear += 1;
  renderMonthPickerGrid();
});
document.addEventListener("click", (e) => {
  if (!datePickerEl.hidden && !datePickerEl.contains(e.target) && e.target !== titleBtn && !titleBtn.contains(e.target)) {
    closeDatePicker();
  }
  if (!menuDropdown.hidden && !menuDropdown.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) {
    closeMenu();
  }
});

menuBtn.addEventListener("click", toggleMenu);

monthViewBtn.addEventListener("click", () => setViewMode("month"));
agendaViewBtn.addEventListener("click", () => setViewMode("agenda"));
mobileMonthBtn.addEventListener("click", () => setViewMode("month"));
mobileAgendaBtn.addEventListener("click", () => setViewMode("agenda"));

searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value.trim().toLowerCase();
  render();
});

buildWeekdayRow();
render();

function loadEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveEvents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayKey() {
  const now = new Date();
  return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

function monthIndex(year, month) {
  return year * 12 + month;
}

function shiftMonth(delta) {
  anchorMonth += delta;
  if (anchorMonth < 0) {
    anchorMonth = 11;
    anchorYear -= 1;
  } else if (anchorMonth > 11) {
    anchorMonth = 0;
    anchorYear += 1;
  }
  render(delta > 0 ? "next" : "prev");
}

function goToToday() {
  const now = new Date();
  const before = monthIndex(anchorYear, anchorMonth);
  anchorYear = now.getFullYear();
  anchorMonth = now.getMonth();
  const after = monthIndex(anchorYear, anchorMonth);
  render(after === before ? null : after > before ? "next" : "prev");
}

function setViewMode(mode) {
  viewMode = mode;
  monthViewBtn.classList.toggle("is-active", mode === "month");
  monthViewBtn.setAttribute("aria-selected", String(mode === "month"));
  agendaViewBtn.classList.toggle("is-active", mode === "agenda");
  agendaViewBtn.setAttribute("aria-selected", String(mode === "agenda"));
  mobileMonthBtn.classList.toggle("is-active", mode === "month");
  mobileAgendaBtn.classList.toggle("is-active", mode === "agenda");
  render();
}

function openNewEventForToday() {
  const now = new Date();
  anchorYear = now.getFullYear();
  anchorMonth = now.getMonth();
  render();
  openModal(todayKey(), anchorYear, anchorMonth, now.getDate());
}

function selectEventColor(color) {
  eventColorSelect.value = color;
  eventColorOptions.forEach((button) => {
    const selected = button.dataset.color === color;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

/* ---------- Header: title / date picker / menu ---------- */

function toggleDatePicker() {
  if (datePickerEl.hidden) openDatePicker();
  else closeDatePicker();
}

function openDatePicker() {
  pickerYear = anchorYear;
  renderMonthPickerGrid();
  datePickerEl.hidden = false;
  void datePickerEl.offsetWidth;
  datePickerEl.classList.add("is-open");
  titleBtn.setAttribute("aria-expanded", "true");
}

function closeDatePicker() {
  datePickerEl.classList.remove("is-open");
  titleBtn.setAttribute("aria-expanded", "false");
  window.setTimeout(() => {
    if (!datePickerEl.classList.contains("is-open")) datePickerEl.hidden = true;
  }, 150);
}

function renderMonthPickerGrid() {
  yearLabelEl.textContent = pickerYear;
  monthGridEl.innerHTML = "";
  MONTH_LABELS_SHORT.forEach((label, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "month-pick-btn";
    if (pickerYear === anchorYear && idx === anchorMonth) btn.classList.add("is-selected");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      const before = monthIndex(anchorYear, anchorMonth);
      anchorYear = pickerYear;
      anchorMonth = idx;
      const after = monthIndex(anchorYear, anchorMonth);
      closeDatePicker();
      render(after === before ? null : after > before ? "next" : "prev");
    });
    monthGridEl.appendChild(btn);
  });
}

function toggleMenu() {
  if (menuDropdown.hidden) openMenu();
  else closeMenu();
}

function openMenu() {
  menuDropdown.hidden = false;
  void menuDropdown.offsetWidth;
  menuDropdown.classList.add("is-open");
  menuBtn.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  menuDropdown.classList.remove("is-open");
  menuBtn.setAttribute("aria-expanded", "false");
  window.setTimeout(() => {
    if (!menuDropdown.classList.contains("is-open")) menuDropdown.hidden = true;
  }, 150);
}

/* ---------- Rendering ---------- */

function buildWeekdayRow() {
  weekdayRowEl.innerHTML = "";
  WEEKDAY_LABELS.forEach((label) => {
    const cell = document.createElement("div");
    cell.className = "weekday-cell";
    cell.textContent = label;
    weekdayRowEl.appendChild(cell);
  });
}

function render(direction) {
  rangeLabelEl.textContent = `${MONTH_LABELS[anchorMonth]} ${anchorYear}`;
  agendaDateEl.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "short", month: "short", day: "numeric",
  }).format(new Date());
  animateLabelChange(direction);

  const isAgenda = viewMode === "agenda";
  monthPanelEl.hidden = isAgenda;
  agendaPanelEl.hidden = isAgenda;
  agendaFullPanelEl.hidden = !isAgenda;

  if (isAgenda) {
    renderAgendaFull();
  } else {
    renderMonthGrid(direction);
    renderUpcoming();
  }
}

function animateLabelChange(direction) {
  if (!direction) return;
  rangeLabelEl.classList.remove("label-anim-next", "label-anim-prev");
  void rangeLabelEl.offsetWidth; // restart animation
  rangeLabelEl.classList.add(direction === "prev" ? "label-anim-prev" : "label-anim-next");
}

function allEventsSorted(fromTodayOnly) {
  const todayK = todayKey();
  const list = [];
  Object.keys(events).forEach((key) => {
    if (fromTodayOnly && key < todayK) return;
    (events[key] || []).forEach((ev) => {
      list.push({ ...ev, dateKey: key });
    });
  });
  list.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
    return (a.time || "").localeCompare(b.time || "");
  });
  return list;
}

function matchesSearch(ev) {
  if (!searchQuery) return true;
  return ev.title.toLowerCase().includes(searchQuery);
}

function renderMonthGrid(direction) {
  const grid = document.createElement("div");
  grid.className = "day-grid";
  grid.setAttribute("role", "grid");
  grid.setAttribute("aria-label", `${MONTH_LABELS[anchorMonth]} ${anchorYear}`);
  if (direction) {
    grid.classList.add(direction === "prev" ? "day-grid-anim-prev" : "day-grid-anim-next");
  } else {
    grid.classList.add("day-grid-anim-fade");
  }

  const firstOfMonth = new Date(anchorYear, anchorMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(anchorYear, anchorMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(anchorYear, anchorMonth, 0).getDate();
  const todayK = todayKey();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startWeekday + 1;
    let cellYear = anchorYear;
    let cellMonth = anchorMonth;
    let cellDay = dayNum;
    let otherMonth = false;

    if (dayNum < 1) {
      cellMonth = anchorMonth - 1;
      cellYear = anchorMonth === 0 ? anchorYear - 1 : anchorYear;
      cellDay = daysInPrevMonth + dayNum;
      otherMonth = true;
    } else if (dayNum > daysInMonth) {
      cellMonth = anchorMonth + 1;
      cellYear = anchorMonth === 11 ? anchorYear + 1 : anchorYear;
      cellDay = dayNum - daysInMonth;
      otherMonth = true;
    }
    if (cellMonth < 0) cellMonth = 11;
    if (cellMonth > 11) cellMonth = 0;

    const key = dateKey(cellYear, cellMonth, cellDay);
    const cell = document.createElement("div");
    cell.className = "day-cell" + (otherMonth ? " other-month" : "") + (key === todayK ? " today" : "");
    cell.dataset.dateKey = key;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("tabindex", key === todayK ? "0" : "-1");
    cell.setAttribute("aria-label", formatFullDate(key));

    const numberEl = document.createElement("div");
    numberEl.className = "day-number";
    numberEl.textContent = cellDay;
    cell.appendChild(numberEl);

    let dayEvents = (events[key] || []).slice().sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const hasSearch = Boolean(searchQuery);
    if (hasSearch) {
      const matchCount = dayEvents.filter(matchesSearch).length;
      if (matchCount === 0) {
        cell.classList.add("search-dim");
      } else {
        cell.classList.add("search-match");
      }
    }

    if (dayEvents.length) {
      const eventsWrap = document.createElement("div");
      eventsWrap.className = "day-events";
      const visible = dayEvents.slice(0, 3);
      visible.forEach((ev) => {
        const pill = document.createElement("div");
        const isMatch = !hasSearch || matchesSearch(ev);
        pill.className = `day-event-pill pill-${ev.color || "blue"}` + (hasSearch && !isMatch ? " pill-dim" : "");
        pill.textContent = ev.time ? `${formatTime(ev.time)} ${ev.title}` : ev.title;
        eventsWrap.appendChild(pill);
      });
      if (dayEvents.length > visible.length) {
        const more = document.createElement("div");
        more.className = "day-event-more";
        more.textContent = `+${dayEvents.length - visible.length} more`;
        eventsWrap.appendChild(more);
      }
      cell.appendChild(eventsWrap);
    }

    cell.addEventListener("click", () => openModal(key, cellYear, cellMonth, cellDay));
    cell.addEventListener("keydown", (event) => handleGridKeydown(event, cell, key, cellYear, cellMonth, cellDay));
    grid.appendChild(cell);
  }

  if (!grid.querySelector('[tabindex="0"]') && grid.firstElementChild) {
    grid.firstElementChild.tabIndex = 0;
  }

  if (currentGridEl) currentGridEl.remove();
  gridViewportEl.appendChild(grid);
  currentGridEl = grid;
}

function handleGridKeydown(event, cell, key, year, month, day) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openModal(key, year, month, day);
    return;
  }

  const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  if (!(event.key in deltas)) return;
  event.preventDefault();
  const cells = Array.from(currentGridEl.querySelectorAll(".day-cell"));
  const next = cells[cells.indexOf(cell) + deltas[event.key]];
  if (!next) return;
  cell.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
}

function renderUpcoming() {
  agendaListEl.innerHTML = "";
  let list = allEventsSorted(true).filter(matchesSearch).slice(0, UPCOMING_LIMIT);

  if (!list.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = searchQuery ? "No matching events." : "Nothing coming up.";
    agendaListEl.appendChild(empty);
    return;
  }

  list.forEach((ev) => agendaListEl.appendChild(buildAgendaItem(ev)));
}

function renderAgendaFull() {
  agendaFullListEl.innerHTML = "";
  const list = allEventsSorted(false).filter(matchesSearch);

  if (!list.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = searchQuery ? "No matching events." : "No events yet. Switch to Month view to add some.";
    agendaFullListEl.appendChild(empty);
    return;
  }

  let lastDateKey = null;
  list.forEach((ev) => {
    if (ev.dateKey !== lastDateKey) {
      lastDateKey = ev.dateKey;
      const header = document.createElement("li");
      header.className = "agenda-date-header";
      header.textContent = formatFullDate(ev.dateKey);
      agendaFullListEl.appendChild(header);
    }
    agendaFullListEl.appendChild(buildAgendaItem(ev, true));
  });
}

function buildAgendaItem(ev, skipDateLabel) {
  const li = document.createElement("li");
  li.className = "agenda-item";
  li.style.setProperty("--event-color", `var(--tag-${ev.color || "blue"})`);
  li.tabIndex = 0;
  li.setAttribute("role", "button");

  const dot = document.createElement("span");
  dot.className = "event-color-dot";
  dot.style.background = `var(--tag-${ev.color || "blue"})`;
  li.appendChild(dot);

  const textWrap = document.createElement("div");
  textWrap.className = "agenda-item-text";
  const titleEl = document.createElement("div");
  titleEl.className = "agenda-item-title";
  titleEl.textContent = ev.title;
  textWrap.appendChild(titleEl);

  const metaBits = [];
  if (!skipDateLabel) metaBits.push(formatShortDate(ev.dateKey));
  if (ev.time) metaBits.push(formatTime(ev.time));
  if (metaBits.length) {
    const metaEl = document.createElement("div");
    metaEl.className = "agenda-item-meta";
    metaEl.textContent = metaBits.join(" · ");
    textWrap.appendChild(metaEl);
  }
  li.appendChild(textWrap);

  li.addEventListener("click", () => {
    const [y, m, d] = ev.dateKey.split("-").map(Number);
    openModal(ev.dateKey, y, m - 1, d);
  });
  li.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      li.click();
    }
  });

  return li;
}

/* ---------- Day modal ---------- */

function openModal(key, year, month, day) {
  lastFocusedElement = document.activeElement;
  activeDateKey = key;
  exitEditMode();
  modalTitleEl.textContent = "New event";
  modalDateLabel.textContent = `${MONTH_LABELS[month]} ${day}, ${year}`;
  eventDateDisplay.value = `${String(month + 1).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`;
  renderEventList();
  modalEl.hidden = false;
  void modalEl.offsetWidth; // restart transition
  modalEl.classList.add("is-open");
  eventTitleInput.focus();
}

function closeModal() {
  modalEl.classList.remove("is-open");
  activeDateKey = null;
  exitEditMode();
  window.setTimeout(() => {
    if (!modalEl.classList.contains("is-open")) {
      modalEl.hidden = true;
      if (lastFocusedElement?.isConnected) lastFocusedElement.focus();
    }
  }, 180);
}

function trapModalFocus(event) {
  const controls = Array.from(modalEl.querySelectorAll('button:not([hidden]), input:not([hidden]), select:not([hidden])'));
  if (!controls.length) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function renderEventList() {
  eventListEl.innerHTML = "";
  const dayEvents = (events[activeDateKey] || []).slice().sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  if (!dayEvents.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No details yet for this day.";
    eventListEl.appendChild(empty);
    return;
  }

  dayEvents.forEach((ev) => {
    const item = document.createElement("li");
    item.className = "event-item" + (ev.id === editingEventId ? " is-editing" : "");

    const dot = document.createElement("span");
    dot.className = "event-color-dot";
    dot.style.background = `var(--tag-${ev.color || "blue"})`;
    item.appendChild(dot);

    const textWrap = document.createElement("div");
    textWrap.className = "event-item-text";
    const titleEl = document.createElement("div");
    titleEl.className = "event-item-title";
    titleEl.textContent = ev.title;
    textWrap.appendChild(titleEl);
    if (ev.time) {
      const timeEl = document.createElement("div");
      timeEl.className = "event-item-time";
      timeEl.textContent = formatTime(ev.time);
      textWrap.appendChild(timeEl);
    }
    item.appendChild(textWrap);

    const actions = document.createElement("div");
    actions.className = "event-item-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "event-edit-btn";
    editBtn.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 13.5-.5 3 3-.5L15 7.5 12.5 5 4 13.5Z"/><path d="m11.5 6 2.5 2.5"/></svg>';
    editBtn.setAttribute("aria-label", "Edit detail");
    editBtn.addEventListener("click", () => enterEditMode(ev));
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "event-delete-btn";
    deleteBtn.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg>';
    deleteBtn.setAttribute("aria-label", "Delete detail");
    deleteBtn.addEventListener("click", () => deleteEvent(ev.id));
    actions.appendChild(deleteBtn);

    item.appendChild(actions);
    eventListEl.appendChild(item);
  });
}

function enterEditMode(ev) {
  editingEventId = ev.id;
  eventTitleInput.value = ev.title;
  eventTimeInput.value = ev.time || "";
  eventColorSelect.value = ev.color || "blue";
  selectEventColor(ev.color || "blue");
  modalTitleEl.textContent = "Edit event";
  submitEventBtn.textContent = "Save changes";
  cancelEditBtn.hidden = false;
  renderEventList();
  eventTitleInput.focus();
}

function exitEditMode() {
  editingEventId = null;
  modalTitleEl.textContent = "New event";
  submitEventBtn.textContent = "Save event";
  cancelEditBtn.hidden = true;
  eventFormEl.reset();
  selectEventColor("green");
  if (activeDateKey) {
    const [year, month, day] = activeDateKey.split("-");
    eventDateDisplay.value = `${month}/${day}/${year}`;
  }
  if (activeDateKey) renderEventList();
}

function formatTime(time) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatShortDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return `${MONTH_LABELS_SHORT[m - 1]} ${d}`;
}

function formatFullDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return `${MONTH_LABELS[m - 1]} ${d}, ${y}`;
}

function handleSubmitEvent(e) {
  e.preventDefault();
  const title = eventTitleInput.value.trim();
  if (!title || !activeDateKey) return;

  if (editingEventId) {
    const list = events[activeDateKey] || [];
    const ev = list.find((item) => item.id === editingEventId);
    if (ev) {
      ev.title = title;
      ev.time = eventTimeInput.value || "";
      ev.color = eventColorSelect.value;
    }
  } else {
    const newEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      time: eventTimeInput.value || "",
      color: eventColorSelect.value,
    };
    if (!events[activeDateKey]) events[activeDateKey] = [];
    events[activeDateKey].push(newEvent);
  }

  saveEvents();
  exitEditMode();
  renderEventList();
  render();
  eventTitleInput.focus();
}

function deleteEvent(id) {
  if (!activeDateKey || !events[activeDateKey]) return;
  if (editingEventId === id) exitEditMode();
  events[activeDateKey] = events[activeDateKey].filter((ev) => ev.id !== id);
  if (!events[activeDateKey].length) delete events[activeDateKey];
  saveEvents();
  renderEventList();
  render();
}

/* ---------- Import / Export ---------- */

function exportEvents() {
  closeMenu();
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "calendar-events.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importEvents(e) {
  closeMenu();
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (imported && typeof imported === "object") {
        events = imported;
        saveEvents();
        render();
        if (activeDateKey) renderEventList();
      }
    } catch {
      alert("Could not import that file — please select a valid calendar-events.json export.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}
