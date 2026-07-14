// Ссылки «добавить в календарь» для экрана подтверждения записи.
// Время — «плавающее» локальное (как на часах студии), без указания зоны.

export interface CalEvent {
  title: string
  details?: string
  location?: string
  date: string // YYYY-MM-DD
  start: string // HH:MM
  end: string // HH:MM
}

function compact(date: string, time: string): string {
  return date.replace(/-/g, '') + 'T' + time.replace(':', '') + '00'
}
function iso(date: string, time: string): string {
  return `${date}T${time}:00`
}

export function googleCalUrl(e: CalEvent): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${compact(e.date, e.start)}/${compact(e.date, e.end)}`,
    details: e.details || '',
    location: e.location || '',
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

export function outlookCalUrl(e: CalEvent): string {
  const p = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.title,
    startdt: iso(e.date, e.start),
    enddt: iso(e.date, e.end),
    body: e.details || '',
    location: e.location || '',
  })
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`
}

function icsEsc(s: string): string {
  return s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
}

/** data:-URI с .ics — для Apple Calendar и любых приложений, читающих ICS. */
export function icsDataUri(e: CalEvent): string {
  const uid = `${compact(e.date, e.start)}-${Math.random().toString(36).slice(2)}@neba`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NEBA//booking//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${compact(e.date, e.start)}`,
    `DTEND:${compact(e.date, e.end)}`,
    `SUMMARY:${icsEsc(e.title)}`,
    e.details ? `DESCRIPTION:${icsEsc(e.details)}` : '',
    e.location ? `LOCATION:${icsEsc(e.location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lines.join('\r\n'))
}
