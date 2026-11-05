/**
 * Open-Meteo levert uurwaarden waarbij de neerslag op tijdstip T de som is over
 * het voorgaande uur (T−1h, T]. Een uur telt mee als dat interval overlapt met de rit.
 */
export function sumPrecipitation(
  hourly: { time: string[]; precipitation: (number | null)[] },
  start: Date,
  end: Date,
): number | null {
  const s = start.getTime()
  const e = Math.max(end.getTime(), s + 1)
  let total = 0
  let found = false
  hourly.time.forEach((t, i) => {
    const hourEnd = Date.parse(t.endsWith('Z') ? t : `${t}Z`)
    const hourStart = hourEnd - 3_600_000
    if (hourEnd > s && hourStart < e) {
      const v = hourly.precipitation[i]
      if (v !== null && v !== undefined) {
        total += v
        found = true
      }
    }
  })
  return found ? Math.round(total * 100) / 100 : null
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
