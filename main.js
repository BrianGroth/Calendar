(function () {
  // Determine initial month/year
  let startYear = new Date().getFullYear();
  let startMonth = new Date().getMonth();
  // Always show both US and Netherlands holidays
  let showUSHolidays = true;
  let showNLHolidays = true;

  // Keep track of how many months are currently rendered for infinite scroll.
  let loadedMonths = 24; // start with two years

  const root = document.getElementById('root');

  // Utility: compute Easter Sunday (Gregorian calendar)
  function getEasterDate(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  // Utility: find nth weekday of a month (e.g., third Monday) or last if n<0
  function getNthWeekdayOfMonth(year, monthIndex, weekday, n) {
    if (n > 0) {
      const first = new Date(year, monthIndex, 1);
      const firstWeekday = first.getDay();
      const offset = (weekday - firstWeekday + 7) % 7;
      return 1 + offset + 7 * (n - 1);
    } else {
      const last = new Date(year, monthIndex + 1, 0);
      const lastDay = last.getDate();
      const lastWeekday = last.getDay();
      const offset = (lastWeekday - weekday + 7) % 7;
      return lastDay - offset;
    }
  }

  // US federal holidays mapping
  function getUSHolidays(year) {
    const holidays = {};
    holidays[`${1}-${1}`] = "New Year’s Day";
    holidays[`${1}-${getNthWeekdayOfMonth(year, 0, 1, 3)}`] = "Martin Luther King Jr. Day";
    holidays[`${2}-${getNthWeekdayOfMonth(year, 1, 1, 3)}`] = "Presidents’ Day";
    holidays[`${5}-${getNthWeekdayOfMonth(year, 4, 1, -1)}`] = "Memorial Day";
    holidays[`${6}-${19}`] = "Juneteenth";
    holidays[`${7}-${4}`] = "Independence Day";
    holidays[`${9}-${getNthWeekdayOfMonth(year, 8, 1, 1)}`] = "Labor Day";
    holidays[`${10}-${getNthWeekdayOfMonth(year, 9, 1, 2)}`] = "Columbus Day";
    holidays[`${11}-${11}`] = "Veterans Day";
    holidays[`${11}-${getNthWeekdayOfMonth(year, 10, 4, 4)}`] = "Thanksgiving";
    holidays[`${12}-${25}`] = "Christmas Day";
    return holidays;
  }

  // Netherlands public holidays mapping
  function getNLHolidays(year) {
    const holidays = {};
    holidays[`${1}-${1}`] = "Nieuwjaarsdag";
    const easter = getEasterDate(year);
    const goodFriday = new Date(easter);
    goodFriday.setDate(goodFriday.getDate() - 2);
    holidays[`${goodFriday.getMonth() + 1}-${goodFriday.getDate()}`] = "Goede Vrijdag";
    const easterMonday = new Date(easter);
    easterMonday.setDate(easterMonday.getDate() + 1);
    holidays[`${easterMonday.getMonth() + 1}-${easterMonday.getDate()}`] = "Tweede Paasdag";
    const ascension = new Date(easter);
    ascension.setDate(ascension.getDate() + 39);
    holidays[`${ascension.getMonth() + 1}-${ascension.getDate()}`] = "Hemelvaart";
    const whitMonday = new Date(easter);
    whitMonday.setDate(whitMonday.getDate() + 50);
    holidays[`${whitMonday.getMonth() + 1}-${whitMonday.getDate()}`] = "Tweede Pinksterdag";
    holidays[`${4}-${27}`] = "Koningsdag";
    holidays[`${5}-${5}`] = "Bevrijdingsdag";
    holidays[`${12}-${25}`] = "Eerste Kerstdag";
    holidays[`${12}-${26}`] = "Tweede Kerstdag";
    return holidays;
  }

  // Generate month array from startYear/month and count
  function generateMonths(startYear, startMonth, count) {
    const months = [];
    for (let i = 0; i < count; i++) {
      const year = startYear + Math.floor((startMonth + i) / 12);
      const monthIndex = (startMonth + i) % 12;
      const totalDays = new Date(year, monthIndex + 1, 0).getDate();
      const days = [];
      const usHolidays = showUSHolidays ? getUSHolidays(year) : {};
      const nlHolidays = showNLHolidays ? getNLHolidays(year) : {};
      for (let d = 1; d <= totalDays; d++) {
        const date = new Date(year, monthIndex, d);
        const key = `${monthIndex + 1}-${d}`;
        let holidayName = null;
        if (showUSHolidays && usHolidays[key]) holidayName = usHolidays[key];
        if (showNLHolidays && nlHolidays[key]) {
          holidayName = holidayName ? `${holidayName} / ${nlHolidays[key]}` : nlHolidays[key];
        }
        days.push({ date, holidayName });
      }
      months.push({ year, monthIndex, days });
    }
    return months;
  }

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const weekdayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function createElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  // Render the calendar into the root element.  This function
  // recreates the entire grid based on the current starting month and
  // the number of months loaded.  It does not render any controls
  // because holidays are always shown and navigation is via scrolling.
  function render() {
    // Clear existing content
    root.innerHTML = '';

    // Calendar container with overflow for scrolling
    const container = createElement('div', 'overflow-y-auto flex-1');
    const grid = createElement('div', 'grid grid-cols-1 sm:grid-cols-2 gap-6');
    // Generate months starting from current state
    const months = generateMonths(startYear, startMonth, loadedMonths);
    months.forEach(({ year, monthIndex, days }) => {
      const monthEl = createElement('div', 'border rounded bg-white shadow p-4 flex flex-col');
      // Month header
      const header = createElement('div', 'text-center font-semibold mb-2', `${monthNames[monthIndex]} ${year}`);
      monthEl.appendChild(header);
      // Weekday row
      const weekdaysRow = createElement('div', 'grid grid-cols-7 text-xs font-medium text-gray-500 mb-1');
      weekdayNames.forEach((wd) => {
        const wdEl = createElement('div', 'text-center', wd);
        weekdaysRow.appendChild(wdEl);
      });
      monthEl.appendChild(weekdaysRow);
      // Days grid
      const daysGrid = createElement('div', 'grid grid-cols-7 gap-1 flex-1 text-center text-sm');
      const firstDayOfWeek = new Date(year, monthIndex, 1).getDay();
      // blanks for leading empty cells
      for (let b = 0; b < firstDayOfWeek; b++) {
        daysGrid.appendChild(createElement('div'));
      }
      days.forEach(({ date, holidayName }) => {
        const day = date.getDate();
        const isToday = date.toDateString() === new Date().toDateString();
        const isHoliday = !!holidayName;
        let bgClass = '';
        if (isHoliday && showUSHolidays && showNLHolidays) {
          bgClass = 'bg-green-200';
        } else if (isHoliday && showUSHolidays) {
          bgClass = 'bg-red-200';
        } else if (isHoliday && showNLHolidays) {
          bgClass = 'bg-blue-200';
        }
        const dayEl = createElement('div', `relative p-2 rounded ${bgClass}`);
        if (isToday) {
          dayEl.className += ' ring-2 ring-blue-500';
        }
        const span = createElement('span', null, String(day));
        dayEl.appendChild(span);
        if (isHoliday) {
          const tooltip = createElement('span', 'absolute -top-1 left-1/2 transform -translate-x-1/2 bg-yellow-100 text-xs px-1 py-px rounded shadow');
          tooltip.textContent = holidayName;
          dayEl.appendChild(tooltip);
        }
        daysGrid.appendChild(dayEl);
      });
      monthEl.appendChild(daysGrid);
      grid.appendChild(monthEl);
    });
    container.appendChild(grid);
    root.appendChild(container);

    // Add infinite scroll: append more months when near bottom and prepend when near top
    container.onscroll = function () {
      // Append more months when within 300px of the bottom
      if (container.scrollTop + container.clientHeight > container.scrollHeight - 300) {
        loadedMonths += 12;
        container.onscroll = null;
        render();
      }
      // Prepend earlier months when within 300px of the top.
      // Removing any lower bound on the starting month allows infinite scrolling backwards.
      if (container.scrollTop < 300) {
        const monthsToPrepend = 12;
        let newMonth = startMonth - monthsToPrepend;
        let newYear = startYear;
        if (newMonth < 0) {
          newYear -= Math.ceil(Math.abs(newMonth) / 12);
          newMonth = (newMonth % 12 + 12) % 12;
        }
        startYear = newYear;
        startMonth = newMonth;
        loadedMonths += monthsToPrepend;
        container.onscroll = null;
        const oldHeight = container.scrollHeight;
        render();
        const newHeight = container.scrollHeight;
        container.scrollTop += newHeight - oldHeight;
      }
    };
  }

  // Initial render
  render();
})();