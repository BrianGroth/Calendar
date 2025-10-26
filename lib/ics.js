// Very small .ics (iCalendar) parser focused on VEVENTs.
// Extracts: SUMMARY, DTSTART, DTEND, URL, DESCRIPTION.
// Returns { events: [{ summary, start, end, url, description }] }

function parseLine(line) {
  // Handle folded lines per RFC5545 (handled before this function)
  const [rawProp, ...rest] = line.split(':');
  const value = rest.join(':');
  const [prop, ...params] = rawProp.split(';');
  return { prop: prop.toUpperCase(), params, value };
}

function unfold(text) {
  // Lines that begin with a space or tab are continuations of the previous line.
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function parseDate(v) {
  // Accept YYYYMMDD or YYYYMMDDTHHMMSS(Z) forms
  // Return Date object; if ends with Z => UTC; else treat as local.
  if (!v) return null;
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [_, yy, mm, dd, hasTime, hh, min, ss, z] = m;
  if (hasTime) {
    if (z) {
      return new Date(Date.UTC(+yy, +mm - 1, +dd, +hh, +min, +ss));
    }
    return new Date(+yy, +mm - 1, +dd, +hh, +min, +ss);
  }
  return new Date(+yy, +mm - 1, +dd);
}

export function parseICS(text) {
  const events = [];
  const lines = unfold(text).split(/\r?\n/);
  let inEvent = false;
  let cur = {};
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      inEvent = true; cur = {};
    } else if (line.startsWith('END:VEVENT')) {
      if (cur.SUMMARY || cur.URL || cur.DTSTART) {
        events.push({
          summary: cur.SUMMARY || '',
          start: parseDate(cur.DTSTART),
          end: parseDate(cur.DTEND),
          url: cur.URL || '',
          description: cur.DESCRIPTION || '',
        });
      }
      inEvent = false; cur = {};
    } else if (inEvent) {
      const { prop, value } = parseLine(line);
      // Unescape commas and semicolons
      const v = value?.replace(/\\,/, ',').replace(/\\;/, ';').replace(/\\n/g, '\n') ?? '';
      cur[prop] = v;
    }
  }
  return { events };
}
