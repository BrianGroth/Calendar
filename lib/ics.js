/* ==============================================
;(function(){
function unfoldICS(text){
// RFC 5545: lines may be folded with CRLF + space/tab; unfold those
return text.replace(/\r?\n[ \t]/g, '');
}


function parseDate(value, params){
// Handles DATE or DATE-TIME, with optional Z (UTC)
// params may include TZID, VALUE=DATE
if (!value) return null;
// DATE (all-day): YYYYMMDD
if (params && /VALUE=DATE/i.test(params)){
const y = Number(value.slice(0,4));
const m = Number(value.slice(4,6)) - 1;
const d = Number(value.slice(6,8));
return new Date(y, m, d, 0, 0, 0);
}
// DATE-TIME: YYYYMMDDTHHMMSS(Z?)
const y = Number(value.slice(0,4));
const m = Number(value.slice(4,6)) - 1;
const d = Number(value.slice(6,8));
const hh = Number(value.slice(9,11) || 0);
const mm = Number(value.slice(11,13) || 0);
const ss = Number(value.slice(13,15) || 0);
const isUTC = /Z$/i.test(value);
if (isUTC){
return new Date(Date.UTC(y, m, d, hh, mm, ss));
}
// Local time (no timezone specified) — interpret as local browser time
return new Date(y, m, d, hh, mm, ss);
}


function parseICS(text){
const lines = unfoldICS(String(text || '')).split(/\r?\n/);
const events = [];
let inEvent = false;
let cur = {};


for (let raw of lines){
if (raw === 'BEGIN:VEVENT'){
inEvent = true; cur = {};
continue;
}
if (raw === 'END:VEVENT'){
inEvent = false;
if (cur.DTSTART){
events.push({
summary: cur.SUMMARY || '',
start: cur.DTSTART,
end: cur.DTEND || null,
description: cur.DESCRIPTION || '',
url: cur.URL || ''
});
}
cur = {};
continue;
}
if (!inEvent) continue;


// Split name;params:value (the first ':' separates value)
const idx = raw.indexOf(':');
if (idx === -1) continue;
const lhs = raw.slice(0, idx);
const value = raw.slice(idx + 1);


// Separate property name and parameters (e.g., DTSTART;TZID=Europe/Amsterdam;VALUE=DATE)
const [name, ...paramParts] = lhs.split(';');
const params = paramParts.join(';');


const NAME = name.toUpperCase();
switch (NAME){
case 'SUMMARY':
cur.SUMMARY = value.replace(/\\n/g,'\n');
break;
case 'DESCRIPTION':
cur.DESCRIPTION = value.replace(/\\n/g,'\n');
break;
case 'URL':
cur.URL = value;
break;
case 'DTSTART':
cur.DTSTART = parseDate(value, params);
break;
case 'DTEND':
cur.DTEND = parseDate(value, params);
break;
default:
// ignore
break;
}
}


return events;
}


window.ICS = { parseICS };
})();
