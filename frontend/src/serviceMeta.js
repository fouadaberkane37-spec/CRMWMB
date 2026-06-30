// Estimated time to complete each service (minutes). Used to show clients/staff
// roughly when a job will finish. These are planning estimates — adjust freely.
export const SERVICE_DURATIONS = {
  // Window-cleaning side
  'window-ext':       60,
  'window-int':       60,
  'window-both':      120,
  'gutters':          90,
  'pressure-washing': 90,
  'roof':             120,
  'screens':          45,
  'solar':            90,
  // Landscape side
  'pavers-pressure':  120,
  'pavers-relevel':   240,
  'pavers-install':   480,
}

const DEFAULT_SERVICE_MINUTES = 90

// Total estimated minutes for a set of service keys (array or comma string).
export function estimateMinutes(services) {
  const list = Array.isArray(services)
    ? services
    : String(services || '').split(',').map(s => s.trim()).filter(Boolean)
  if (list.length === 0) return 0
  return list.reduce((sum, key) => sum + (SERVICE_DURATIONS[key] ?? DEFAULT_SERVICE_MINUTES), 0)
}

// "150" -> "2h30", "90" -> "1h30", "45" -> "45min"
export function fmtDuration(min) {
  if (!min) return ''
  const h = Math.floor(min / 60), m = min % 60
  if (h && m) return `${h}h${String(m).padStart(2, '0')}`
  if (h)      return `${h}h`
  return `${m}min`
}

// Add `min` minutes to a "HH:MM" start time -> "HH:MM" (same-day clock).
export function addMinutesToTime(timeStr, min) {
  if (!timeStr || !min) return ''
  const [h, m] = timeStr.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return ''
  const total = h * 60 + m + Number(min)
  const eh = Math.floor((total % 1440) / 60), em = total % 60
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
}

// End clock time from an ISO datetime + duration minutes -> "HH:MM".
export function endTimeFromIso(iso, min) {
  if (!iso || !min) return ''
  const d = new Date(new Date(iso).getTime() + Number(min) * 60000)
  return d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
}
