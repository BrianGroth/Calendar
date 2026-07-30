/*
  Calendar App — app.js
  Two-month view with month-by-month navigation and per-day details.
  Events are persisted to localStorage; no backend required.
*/

const STORAGE_KEY = "calendar.events.v1";
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

let events = loadEvents();
let anchorYear = new Date().getFullYear();
let anchorMonth = new Date().getMonth(); // 0-based, left-hand month of the pair
let activeDateKey = null;

const gridEl = document.getElementById("calendarGrid");
const rangeLabelEl = document.getElementById("rangeLabel");
const modalEl = document.getElementById("dayModal");
const modalTitleEl = document.getElementById("modalTitle");
const eventListEl = document.getElementById("eventList");
const eventFormEl = document.getElementById("eventForm");
const eventTitleInput = document.getElementById("eventTitle");
const eventTimeInput = document.getElementById("eventTime");
const eventColorSelect = document.getElementById("eventColor");

document.getElementById("prevBtn").addEventListener("click", () => shiftMonth(-1));
document.getElementById("nextBtn").addEventListener("click", () => shiftMonth(1));
document.getElementById("todayBtn").addEventListener("click", goToToday);
document.getElementById("closeModal").addEventListener("click", closeModal);
modalEl.addEventListener("click", (e) => {
  if (e.target === modalEl) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalEl.hidden) closeModal();
});
eventFormEl.addEventListener("submit", handleAddEvent);
document.getElementById("exportBtn").addEventListener("click", exportEvents);
document.getElementById("importInput").addEventListener("change", importEvents);

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

function shiftMonth(delta) {
  anchorMonth += delta;
  if (anchorMonth < 0) {
    anchorMonth = 11;
    anchorYear -= 1;
  } else if (anchorMonth > 11) {
    anchorMonth = 0;
    anchorYear += 1;
  }
  render();
}

function goToToday() {
  const now = new Date();
  anchorYear = now.getFullYear();
  anchorMonth = now.getMonth();
  render();
}

function render() {
  gridEl.innerHTML = "";
  const first = buildMonth(anchorYear, anchorMonth);
  let secondMonth = anchorMonth + 1;
  let secondYear = anchorYear;
  if (secondMonth > 11) {
    secondMonth = 0;
    secondYear += 1;
  }
  const second = buildMonth(secondYear, secondMonth);
  gridEl.appendChild(first);
  gridEl.appendChild(second);

  rangeLabelEl.textContent = `${MONTH_LABELS[anchorMonth]} ${anchorYear} – ${MONTH_LABELS[secondMonth]} ${secondYear}`;
}

function buildMonth(year, month) {
  const monthEl = document.createElement("section");
  monthEl.className = "month";

  const title = document.createElement("h2");
  title.className = "month-title";
  title.textContent = `${MONTH_LABELS[month]} ${year}`;
  monthEl.appendChild(title);

  const weekdayRow = document.createElement("div");
  weekdayRow.className = "weekday-row";
  WEEKDAY_LABELS.forEach((label) => {
    const cell = document.createElement("div");
    cell.className = "weekday-cell";
    cell.textContent = label;
    weekdayRow.appendChild(cell);
  });
  monthEl.appendChild(weekdayRow);

  const dayGrid = document.createElement("div");
  dayGrid.className = "day-grid";

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startWeekday + 1;
    let cellYear = year;
    let cellMonth = month;
    let cellDay = dayNum;
    let otherMonth = false;

    if (dayNum < 1) {
      cellMonth = month - 1;
      cellYear = month === 0 ? year - 1 : year;
      cellDay = daysInPrevMonth + dayNum;
      otherMonth = true;
    } else if (dayNum > daysInMonth) {
      cellMonth = month + 1;
      cellYear = month === 11 ? year + 1 : year;
      cellDay = dayNum - daysInMonth;
      otherMonth = true;
    }
    if (cellMonth < 0) cellMonth = 11;
    if (cellMonth > 11) cellMonth = 0;

    const key = dateKey(cellYear, cellMonth, cellDay);
    const cell = document.createElement("div");
    cell.className = "day-cell" + (otherMonth ? " other-month" : "") + (key === todayKey ? " today" : "");
    cell.dataset.dateKey = key;

    const numberEl = document.createElement("div");
    numberEl.className = "day-number";
    numberEl.textContent = cellDay;
    cell.appendChild(numberEl);

    const dayEvents = (events[key] || []).slice().sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    if (dayEvents.length) {
      const eventsWrap = document.createElement("div");
      eventsWrap.className = "day-events";
      const visible = dayEvents.slice(0, 3);
      visible.forEach((ev) => {
        const pill = document.createElement("div");
        pill.className = `day-event-pill pill-${ev.color || "blue"}`;
        pill.textContent = ev.time ? `${ev.time} ${ev.title}` : ev.title;
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
    dayGrid.appendChild(cell);
  }

  monthEl.appendChild(dayGrid);
  return monthEl;
}

function openModal(key, year, month, day) {
  activeDateKey = key;
  modalTitleEl.textContent = `${MONTH_LABELS[month]} ${day}, ${year}`;
  renderEventList();
  eventFormEl.reset();
  modalEl.hidden = false;
  eventTitleInput.focus();
}

function closeModal() {
  modalEl.hidden = true;
  activeDateKey = null;
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
    item.className = "event-item";

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

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "event-delete-btn";
    deleteBtn.innerHTML = "&times;";
    deleteBtn.setAttribute("aria-label", "Delete detail");
    deleteBtn.addEventListener("click", () => deleteEvent(ev.id));
    item.appendChild(deleteBtn);

    eventListEl.appendChild(item);
  });
}

function formatTime(time) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function handleAddEvent(e) {
  e.preventDefault();
  const title = eventTitleInput.value.trim();
  if (!title || !activeDateKey) return;

  const newEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    time: eventTimeInput.value || "",
    color: eventColorSelect.value,
  };

  if (!events[activeDateKey]) events[activeDateKey] = [];
  events[activeDateKey].push(newEvent);
  saveEvents();

  eventFormEl.reset();
  renderEventList();
  render();
  eventTitleInput.focus();
}

function deleteEvent(id) {
  if (!activeDateKey || !events[activeDateKey]) return;
  events[activeDateKey] = events[activeDateKey].filter((ev) => ev.id !== id);
  if (!events[activeDateKey].length) delete events[activeDateKey];
  saveEvents();
  renderEventList();
  render();
}

function exportEvents() {
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "calendar-events.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importEvents(e) {
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
