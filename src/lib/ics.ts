/**
 * Calendar-based reminders: the most reliable way to get a daily alert on iPhone
 * for a web app. iOS Calendar delivers the alarm even when DAYMARK is closed.
 */
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const pad = (n: number) => String(n).padStart(2, '0');

function localStamp(d: Date) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

function utcStamp(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export interface IcsReminder {
  uid: string;
  title: string;
  description: string;
  time: string; // HH:MM
  days: number[];
  durationMin: number;
}

export function buildIcs(reminders: IcsReminder[], url: string, nowDate = new Date()): string {
  // Floating local time (no TZID): the alarm follows the phone's current time zone.
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DAYMARK//Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const r of reminders) {
    if (!r.days.length) continue;
    const [h, m] = r.time.split(':').map(Number);
    // Start on the next matching day so the first alarm is never in the past.
    const start = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), h, m, 0);
    for (let i = 0; i < 8 && (!r.days.includes(start.getDay()) || start <= nowDate); i++) start.setDate(start.getDate() + 1);
    const end = new Date(start.getTime() + r.durationMin * 60000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.uid}`,
      `DTSTAMP:${utcStamp(nowDate)}`,
      `DTSTART:${localStamp(start)}`,
      `DTEND:${localStamp(end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${[...r.days].sort().map((d) => DAY_CODES[d]).join(',')}`,
      `SUMMARY:${esc(r.title)}`,
      `DESCRIPTION:${esc(`${r.description}\n\nOpen DAYMARK: ${url}`)}`,
      `URL:${url}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(r.title)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  // RFC 5545 requires CRLF line endings.
  return lines.join('\r\n') + '\r\n';
}
