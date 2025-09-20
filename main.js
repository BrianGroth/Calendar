(function () {
  // Start at the current year and month
  let startYear = new Date().getFullYear();
  let startMonth = new Date().getMonth();
  // Always show both US and Netherlands holidays
  const showUSHolidays = true;
  const showNLHolidays = true;
  // Initially render two years’ worth of months
  let loadedMonths = 24;
  const root = document.getElementById('root');

  // Calculate Easter Sunday (Gregorian)
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

  // nth weekday of month (n > 0 for nth, n < 0 for last)
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

  // US federal holidays
  function getUSHolidays(year) {
    const holidays = {};
    holidays[`1-1`] = "New Year’s Day";
    holidays[`6-19`] = "Juneteenth";
    holidays[`7-4`] = "Independence Day";
    holidays[`11-11`] = "Veterans Day";
    holidays[`12-25`] = "Christmas Day";
    holidays[`1-${getNthWeekdayOfMonth(year, 0, 1, 3)}`] = "Martin Luther King Jr. Day";
    holidays[`2-${getNthWeekdayOfMonth(year, 1, 1, 3)}`] = "Presidents’ Day";
    holidays[`5-${getNthWeekdayOfMonth(year, 4, 1, -1)}`] = "Memorial Day";
    holidays[`9-${getNthWeekdayOfMonth(year, 8, 1, 1)}`] = "Labor Day";
    holidays[`10-${getNthWeekdayOfMonth(year, 9, 1, 2)}`] = "Columbus Day";
    holidays[`11-${getNthWeekdayOfMonth(year, 10, 4, 4)}`] = "Thanksgiving";
    return holidays;
  }

  // Netherlands holidays
  function getNLHolidays(year) {
    const holidays = {};
    holidays[`1-1`] = "Nieuwjaarsdag";
    holidays[`4-27`] = "Koningsdag";
    holidays[`5-5`] = "Bevrijdingsdag";
    holidays[`12-25`] = "Eerste Kerstdag";
    holidays[`12-26`] = "Tweede Kerstdag";
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
    return holidays;
  }

  // Build months and days with holidays
  function generateMonths(year, monthIndex, count) {
    const months = [];
    for (let i = 0; i < count; i++) {
      const y = year + Math.floor((monthIndex + i) / 12);
      const m = (monthIndex + i) % 12;
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const usHolidays = showUSHolidays ? getUSHolidays(y) : {};
      const nlHolidays = showNLHolidays ? getNLHolidays(y) : {};
      const days = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(y, m, d);
        const key = `${m + 1}-${d}`;
        let holidayName = null;
        if (showUSHolidays && usHolidays[key]) holidayName = usHolidays[key];
        if (showNLHolidays && nlHolidays[key]) {
          holidayName = holidayName ? `${holidayName} / ${nlHolidays[key]}` : nlHolidays[key];
        }
        days.push({ date, holidayName });
      }
      months.push({ year: y, monthIndex: m, days });
    }
    return months;
  }

  // Names for display
  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  const weekdayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // Helper to create an element with optional class and text
  function createElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  // Render the calendar with infinite scroll
  function render() {
    root.innerHTML = '';

    // Full-height wrapper ensures the calendar scrolls correctly
    const wrapper = createElement('div', 'flex flex-col h-screen p-4 box-border');
    const container = createElement('div', 'overflow-y-auto flex-1');
    const grid = createElement('div', 'grid grid-cols-1 sm:grid-cols-2 gap-6');

    const months = generateMonths(startYear, startMonth, loadedMonths);
    months.forEach(({ year, monthIndex, days }) => {
      const monthEl = createElement('div', 'border rounded bg-white shadow p-4 flex flex-col');
      monthEl.appendChild(createElement('div', 'text-center font-semibold mb-2', `${monthNames[monthIndex]} ${year}`));

      // weekday headers
      const weekdaysRow = createElement('div', 'grid grid-cols-7 text-xs font-medium text-gray-500 mb-1');
      weekdayNames.forEach(wd => weekdaysRow.appendChild(createElement('div','text-center', wd)));
      monthEl.appendChild(weekdaysRow);

      // days grid
      const daysGrid = createElement('div', 'grid grid-cols-7 gap-1 flex-1 text-center text-sm');
      const firstDayOfWeek = new Date(year, monthIndex, 1).getDay();
      for (let b = 0; b < firstDayOfWeek; b++) {
        daysGrid.appendChild(createElement('div'));
      }
      days.forEach(({ date, holidayName }) => {
        const day = date.getDate();
        const isToday = date.toDateString() === new Date().toDateString();
        const isHoliday = !!holidayName;
        let bgClass = '';
        if (isHoliday && showUSHolidays && showNLHolidays) bgClass = 'bg-green-200';
        else if (isHoliday && showUSHolidays) bgClass = 'bg-red-200';
        else if (isHoliday && showNLHolidays) bgClass = 'bg-blue-200';
        const dayEl = createElement('div', `relative p-2 rounded ${bgClass}`);
        if (isToday) dayEl.className += ' ring-2 ring-blue-500';
        dayEl.appendChild(createElement('span', null, String(day)));
        if (isHoliday) {
          const tooltip = createElement('span',
            'absolute -top-1 left-1/2 transform -translate-x-1/2 bg-yellow-100 text-xs px-1 py-px rounded shadow'
          );
          tooltip.textContent = holidayName;
          dayEl.appendChild(tooltip);
        }
        daysGrid.appendChild(dayEl);
      });
      monthEl.appendChild(daysGrid);
      grid.appendChild(monthEl);
    });

    container.appendChild(grid);
    wrapper.appendChild(container);
    root.appendChild(wrapper);

    // Infinite scroll logic: load more months when nearing bottom/top
    container.onscroll = function () {
      // near bottom: append future months
      if (container.scrollTop + container.clientHeight > container.scrollHeight - 300) {
        loadedMonths += 12;
        container.onscroll = null;
        render();
      }
      // near top: prepend past months
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