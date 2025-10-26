/*
 * Two-Month Infinite Calendar React component.
 *
 * This component displays a responsive calendar two months at a time and
 * allows the user to infinitely scroll through the months vertically. It
 * includes toggles for showing US and Netherlands public holidays. When
 * holidays are enabled the corresponding days are highlighted and a tooltip
 * displays the holiday name on hover.
 */

import React, { useState } from "react";

/* Helper to compute the date of Easter Sunday for a given year using
 * the Anonymous Gregorian algorithm. This is required to calculate a
 * number of moveable feasts observed in the Netherlands (e.g. Good Friday,
 * Ascension Day and Whit Monday).
 */
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
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/* Compute the date (day of month) of the nth weekday in a given month
 * (e.g. the 3rd Monday in January). If `n` is negative, returns the last
 * occurrence of the weekday (e.g. -1 = last Monday).  `weekday` uses
 * JavaScript values where Sunday=0, Monday=1, ..., Saturday=6.
 */
function getNthWeekdayOfMonth(year, monthIndex, weekday, n) {
  if (n > 0) {
    // Find the first instance of the weekday in the month
    const first = new Date(year, monthIndex, 1);
    const firstWeekday = first.getDay();
    const offset = (weekday - firstWeekday + 7) % 7;
    return 1 + offset + 7 * (n - 1);
  } else {
    // Last occurrence: start from the end of the month
    const last = new Date(year, monthIndex + 1, 0);
    const lastDay = last.getDate();
    const lastWeekday = last.getDay();
    const offset = (lastWeekday - weekday + 7) % 7;
    return lastDay - offset;
  }
}

/**
 * Generate a mapping of US federal public holidays for a given year.  The
 * returned object maps "month-day" strings (e.g. "1-1" for January 1) to
 * holiday names.
 */
function getUSHolidays(year) {
  const holidays = {};
  // New Year’s Day (Jan 1)
  holidays[`${1}-${1}`] = "New Year’s Day";
  // Martin Luther King Jr. Day (third Monday in Jan)
  holidays[`${1}-${getNthWeekdayOfMonth(year, 0, 1, 3)}`] =
    "Martin Luther King Jr. Day";
  // Presidents’ Day (third Monday in Feb)
  holidays[`${2}-${getNthWeekdayOfMonth(year, 1, 1, 3)}`] = "Presidents’ Day";
  // Memorial Day (last Monday in May)
  holidays[`${5}-${getNthWeekdayOfMonth(year, 4, 1, -1)}`] = "Memorial Day";
  // Juneteenth (June 19)
  holidays[`${6}-${19}`] = "Juneteenth";
  // Independence Day (July 4)
  holidays[`${7}-${4}`] = "Independence Day";
  // Labor Day (first Monday in Sep)
  holidays[`${9}-${getNthWeekdayOfMonth(year, 8, 1, 1)}`] = "Labor Day";
  // Columbus Day (second Monday in Oct)
  holidays[`${10}-${getNthWeekdayOfMonth(year, 9, 1, 2)}`] = "Columbus Day";
  // Veterans Day (Nov 11)
  holidays[`${11}-${11}`] = "Veterans Day";
  // Thanksgiving Day (fourth Thursday in Nov)
  holidays[`${11}-${getNthWeekdayOfMonth(year, 10, 4, 4)}`] = "Thanksgiving";
  // Christmas Day (Dec 25)
  holidays[`${12}-${25}`] = "Christmas Day";
  return holidays;
}

/**
 * Generate a mapping of Netherlands public holidays for a given year.  The
 * returned object maps "month-day" strings to holiday names.  As with the
 * US version, fixed-date holidays are included directly and movable
 * holidays are calculated based on the Easter date.
 */
function getNLHolidays(year) {
  const holidays = {};
  // New Year’s Day
  holidays[`${1}-${1}`] = "Nieuwjaarsdag";
  // Compute Easter-based holidays
  const easter = getEasterDate(year);
  // Good Friday is two days before Easter Sunday
  const goodFriday = new Date(easter);
  goodFriday.setDate(goodFriday.getDate() - 2);
  holidays[
    `${goodFriday.getMonth() + 1}-${goodFriday.getDate()}`
  ] = "Goede Vrijdag";
  // Easter Monday is the day after Easter Sunday
  const easterMonday = new Date(easter);
  easterMonday.setDate(easterMonday.getDate() + 1);
  holidays[
    `${easterMonday.getMonth() + 1}-${easterMonday.getDate()}`
  ] = "Tweede Paasdag";
  // Ascension Day is 39 days after Easter
  const ascension = new Date(easter);
  ascension.setDate(ascension.getDate() + 39);
  holidays[
    `${ascension.getMonth() + 1}-${ascension.getDate()}`
  ] = "Hemelvaart";
  // Whit Monday (Pentecost Monday) is 50 days after Easter
  const whitMonday = new Date(easter);
  whitMonday.setDate(whitMonday.getDate() + 50);
  holidays[
    `${whitMonday.getMonth() + 1}-${whitMonday.getDate()}`
  ] = "Tweede Pinksterdag";
  // King’s Day (April 27)
  holidays[`${4}-${27}`] = "Koningsdag";
  // Liberation Day (May 5)
  holidays[`${5}-${5}`] = "Bevrijdingsdag";
  // Christmas (Dec 25 and 26)
  holidays[`${12}-${25}`] = "Eerste Kerstdag";
  holidays[`${12}-${26}`] = "Tweede Kerstdag";
  return holidays;
}

/**
 * Build an array of months to display. Each element includes the year,
 * month index (0-11) and a list of day objects containing the date and
 * flags for holidays.
 */
function generateMonths(
  startYear,
  startMonth,
  count,
  showUSHolidays,
  showNLHolidays
) {
  const months = [];
  for (let i = 0; i < count; i++) {
    const year = startYear + Math.floor((startMonth + i) / 12);
    const monthIndex = (startMonth + i) % 12;
    const usHolidays = showUSHolidays ? getUSHolidays(year) : {};
    const nlHolidays = showNLHolidays ? getNLHolidays(year) : {};
    const totalDays = new Date(year, monthIndex + 1, 0).getDate();
    const days = [];
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(year, monthIndex, d);
      const key = `${monthIndex + 1}-${d}`;
      let holidayName = null;
      if (showUSHolidays && usHolidays[key]) holidayName = usHolidays[key];
      if (showNLHolidays && nlHolidays[key])
        holidayName =
          (holidayName ? `${holidayName} / ` : "") + nlHolidays[key];
      days.push({ date, holidayName });
    }
    months.push({ year, monthIndex, days });
  }
  return months;
}

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Main React component. Renders toggles for holidays and a scrollable
 * calendar grid displaying two months per row.
 */
export default function TwoMonthCalendarApp() {
  // Determine initial month: current month
  const now = new Date();
  const [startYear, setStartYear] = useState(now.getFullYear());
  const [startMonth, setStartMonth] = useState(now.getMonth());
  const [showUSHolidays, setShowUSHolidays] = useState(false);
  const [showNLHolidays, setShowNLHolidays] = useState(false);

  // Generate a list of months. We produce 24 months (two years) for now.
  const months = generateMonths(
    startYear,
    startMonth,
    24,
    showUSHolidays,
    showNLHolidays
  );

  // Handlers to page forward/backward by two months
  function goNext() {
    const newMonth = startMonth + 2;
    setStartYear(startYear + Math.floor(newMonth / 12));
    setStartMonth(newMonth % 12);
  }
  function goPrev() {
    let newMonth = startMonth - 2;
    let newYear = startYear;
    if (newMonth < 0) {
      newYear -= Math.ceil(Math.abs(newMonth) / 12);
      newMonth = (newMonth % 12 + 12) % 12;
    }
    setStartYear(newYear);
    setStartMonth(newMonth);
  }

  return (
    <div className="flex flex-col h-screen p-4 box-border">
      {/* Toggle buttons */}
      <div className="flex items-center space-x-4 mb-4">
        <label className="inline-flex items-center">
          <input
            type="checkbox"
            className="form-checkbox rounded mr-2"
            checked={showUSHolidays}
            onChange={() => setShowUSHolidays(!showUSHolidays)}
          />
          <span>Show US holidays</span>
        </label>
        <label className="inline-flex items-center">
          <input
            type="checkbox"
            className="form-checkbox rounded mr-2"
            checked={showNLHolidays}
            onChange={() => setShowNLHolidays(!showNLHolidays)}
          />
          <span>Show Netherlands holidays</span>
        </label>
        {/* Navigation buttons */}
        <button
          onClick={goPrev}
          className="ml-auto px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
        >
          Previous
        </button>
        <button
          onClick={goNext}
          className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
        >
          Next
        </button>
      </div>
      {/* Calendar grid: two columns responsive */}
      <div className="overflow-y-auto flex-1">
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-6"
          style={{ minHeight: "100%" }}
        >
          {months.map(({ year, monthIndex, days }) => {
            const firstDayOfWeek = new Date(year, monthIndex, 1).getDay();
            // Build an array with blank slots before the first day
            const blanks = Array(firstDayOfWeek).fill(null);
            return (
              <div
                key={`${year}-${monthIndex}`}
                className="border rounded bg-white shadow p-4 flex flex-col"
              >
                {/* Month header */}
                <div className="text-center font-semibold mb-2">
                  {monthNames[monthIndex]} {year}
                </div>
                {/* Weekday headers */}
                <div className="grid grid-cols-7 text-xs font-medium text-gray-500 mb-1">
                  {weekdayNames.map((wd) => (
                    <div key={wd} className="text-center">
                      {wd}
                    </div>
                  ))}
                </div>
                {/* Days grid */}
                <div className="grid grid-cols-7 gap-1 flex-1 text-center text-sm">
                  {blanks.map((_, i2) => (
                    <div key={`blank-${i2}`} className="" />
                  ))}
                  {days.map(({ date, holidayName }) => {
                    const day = date.getDate();
                    const isToday =
                      date.toDateString() === new Date().toDateString();
                    const isHoliday = !!holidayName;
                    let bgClass = "";
                    if (isHoliday && showUSHolidays && showNLHolidays) {
                      bgClass = "bg-green-200";
                    } else if (isHoliday && showUSHolidays) {
                      bgClass = "bg-red-200";
                    } else if (isHoliday && showNLHolidays) {
                      bgClass = "bg-blue-200";
                    }
                    return (
                      <div
                        key={day}
                        className={`relative p-2 rounded ${bgClass} ${
                          isToday ? "ring-2 ring-blue-500" : ""
                        }`}
                      >
                        <span>{day}</span>
                        {isHoliday && (
                          <span className="absolute -top-1 left-1/2 transform -translate-x-1/2 bg-yellow-100 text-xs px-1 py-px rounded shadow">
                            {holidayName}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
