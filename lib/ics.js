/*
 * Minimal iCalendar parser used by the calendar application.
 *
 * This parser extracts VEVENT blocks from a .ics file and returns a list
 * of simplified event objects.  It only looks at a handful of fields
 * (SUMMARY, DTSTART, DTEND, URL, DESCRIPTION).  It gracefully ignores
 * unsupported or malformed lines.  Date/time values are converted into
 * local date and time strings (YYYY‑MM‑DD and HH:mm) based on the
 * browser’s locale.  All‑day events (DTSTART without a time component) are
 * interpreted as starting at 00:00 and ending at 23:59 on the same day.
 */

/**
 * Parse an iCalendar date/time string into a JavaScript Date.
 * Supports date‑only (YYYYMMDD) and date/time with optional Z suffix.
 *
 * @param {string} value Raw DTSTART/DTEND value
 * @returns {Date} Parsed Date in local time
 */
function parseICalDate(value) {
  // Remove any parameters preceding the colon (e.g. DTSTART;TZID=...).  Those
  // should have been handled before passing into this function.
  let v = value.trim();
  // If the value contains 'T' assume date and time, otherwise date only.
  if (/^\d{8}T\d{6}Z?$/i.test(v)) {
    // YYYYMMDDTHHmmss[Z]
    const year = v.slice(0, 4);
    const month = v.slice(4, 6);
    const day = v.slice(6, 8);
    const hour = v.slice(9, 11);
    const minute = v.slice(11, 13);
    const second = v.slice(13, 15);
    const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${v.endsWith('Z') ? 'Z' : ''}`;
    return new Date(iso);
  } else if (/^\d{8}$/i.test(v)) {
    // Date only (all day)
    const year = v.slice(0, 4);
    const month = v.slice(4, 6);
    const day = v.slice(6, 8);
    return new Date(`${year}-${month}-${day}T00:00:00`);
  }
  // Fall back to Date.parse which can handle some ISO formats
  return new Date(v);
}

/**
 * Parse a raw .ics string and return a list of simplified events.
 *
 * @param {string} icsText The raw iCalendar text
 * @returns {Array<{title:string,date:string,startTime:string,endTime:string,notes:string,url:string}>}
 */
export function parseICS(icsText) {
  const events = [];
  if (!icsText) return events;
  // Normalize line endings and unfold folded lines (lines beginning with a space)
  const rawLines = icsText.replace(/\r\n?/g, '\n').split('\n');
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.startsWith(' ') && lines.length) {
      // Continuation of previous line
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  let current = null;
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = {};
      continue;
    }
    if (line.startsWith('END:VEVENT')) {
      if (current) {
        // Finalize event: derive date, times and defaults
        const start = current.dtstart ? parseICalDate(current.dtstart) : null;
        const end = current.dtend ? parseICalDate(current.dtend) : null;
        if (start) {
          const dateStr = start.toISOString().slice(0, 10);
          let startTime = start.toTimeString().slice(0, 5);
          let endTime = end ? end.toTimeString().slice(0, 5) : startTime;
          // If dtend is equal to midnight of the next day (all‑day event), clamp to 23:59.
          if (end && end - start >= 24 * 60 * 60 * 1000) {
            endTime = '23:59';
          }
          events.push({
            title: current.summary || 'Untitled',
            date: dateStr,
            startTime: startTime,
            endTime: endTime,
            notes: current.description || '',
            url: current.url || ''
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const rawKey = line.slice(0, idx);
    const value = line.slice(idx + 1);
    // Strip parameters (after semicolon) from key
    const key = rawKey.split(';')[0].toUpperCase();
    switch (key) {
      case 'SUMMARY':
        current.summary = value.trim();
        break;
      case 'DTSTART':
        current.dtstart = value.trim();
        break;
      case 'DTEND':
        current.dtend = value.trim();
        break;
      case 'URL':
        current.url = value.trim();
        break;
      case 'DESCRIPTION':
        current.description = value.trim();
        break;
      default:
        break;
    }
  }
  return events;
}