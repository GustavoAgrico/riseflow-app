const pad = n => String(n).padStart(2, '0')
const icsDate = (date, time) => {
  const [y, m, d] = date.split('-')
  if (!time) return `${y}${m}${d}`
  const [h, mi] = time.split(':')
  return `${y}${m}${d}T${pad(h)}${pad(mi)}00`
}

const esc = s => (s || '').replace(/[\\;,\n]/g, c =>
  c === '\n' ? '\\n' : `\\${c}`)

const TYPE_LABELS = { schedule: 'Agendamento', task: 'Tarefa', proposal: 'Proposta' }

export function eventsToICS(events, calName = 'RiseFlow') {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RiseFlow//Agenda//PT',
    `X-WR-CALNAME:${calName}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  for (const e of events) {
    if (!e.date) continue
    const uid = `${e.id}@riseflow`
    const label = TYPE_LABELS[e.type] || ''
    const summary = label ? `[${label}] ${e.title}` : e.title

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`)

    if (e.time) {
      lines.push(`DTSTART:${icsDate(e.date, e.time)}`)
      const [h, m] = e.time.split(':').map(Number)
      const endH = pad(h + 1)
      lines.push(`DTEND:${icsDate(e.date, `${endH}:${pad(m)}`)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.date)}`)
      lines.push(`DTEND;VALUE=DATE:${icsDate(e.date)}`)
    }

    lines.push(`SUMMARY:${esc(summary)}`)
    if (e.time) {
      lines.push('BEGIN:VALARM')
      lines.push('TRIGGER:-PT15M')
      lines.push('ACTION:DISPLAY')
      lines.push(`DESCRIPTION:${esc(summary)} em 15 minutos`)
      lines.push('END:VALARM')
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadICS(events, filename = 'riseflow-agenda') {
  const ics = eventsToICS(events)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

export function googleCalendarUrl(event) {
  const title = encodeURIComponent(event.title || 'Evento RiseFlow')
  let dates
  if (event.time) {
    dates = `${icsDate(event.date, event.time)}/${icsDate(event.date, event.time)}`
  } else {
    dates = `${icsDate(event.date)}/${icsDate(event.date)}`
  }
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}`
}
