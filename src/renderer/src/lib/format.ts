/** Shared presentational helpers — dates, phone, initials, relative time. */

const RELATIVE = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' })

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(iso))
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(iso))
}

/** Time-only variant for high-frequency ledgers (payments, check-ins). */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(iso))
}

/** Coarse relative time: "3d ago", "2h ago", "in 1d". */
export function timeAgo(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  const abs = Math.abs(diff)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000]
  ]
  for (const [unit, ms] of units) {
    if (abs >= ms) return RELATIVE.format(Math.round(diff / ms), unit)
  }
  return 'just now'
}

/** Relative label for a follow-up due date. */
export function dueLabel(iso: string): { text: string; overdue: boolean } {
  const t = new Date(iso).getTime()
  const overdue = t < Date.now()
  return { text: timeAgo(iso), overdue }
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

/** Show the phone as stored (keeps the natural formatting variance). */
export function displayPhone(phone?: string): string {
  return phone?.trim() || '—'
}
