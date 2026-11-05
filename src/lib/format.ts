export const nl = (n: number, digits = 0) =>
  n.toLocaleString('nl-NL', { maximumFractionDigits: digits, minimumFractionDigits: digits })

const dateFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' })
const dateFmtYear = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Amsterdam' })

export function fmtDate(d: Date) {
  return (d.getFullYear() === new Date().getFullYear() ? dateFmt : dateFmtYear).format(d)
}

export const STATUS_LABEL = {
  ok: 'Goed',
  warning: 'Bijna',
  due: 'Nu',
  no_data: 'Meten',
  not_mounted: 'Niet gemonteerd',
} as const
