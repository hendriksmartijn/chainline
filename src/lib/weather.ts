import 'server-only'
import { weatherConfig } from '@/config'
import { isoDate, sumPrecipitation } from '@/core/weather'

/**
 * Neerslag (mm) tijdens de rit op basis van startlocatie en start/eindtijd.
 * Recente ritten via de forecast-API (archive loopt dagen achter), oudere via archive.
 * Coördinaten worden afgerond op 2 decimalen (~1 km): genoeg voor het weergrid, minder locatiedata naar buiten.
 * null = geen data (wordt dan als 'unknown' geclassificeerd en later opnieuw geprobeerd).
 */
export async function fetchRidePrecipitation(lat: number, lng: number, start: Date, end: Date): Promise<number | null> {
  const ageDays = (Date.now() - start.getTime()) / 86_400_000
  const base = ageDays <= weatherConfig.forecastMaxAgeDays ? weatherConfig.forecastUrl : weatherConfig.archiveUrl
  const url = new URL(base)
  url.searchParams.set('latitude', lat.toFixed(2))
  url.searchParams.set('longitude', lng.toFixed(2))
  url.searchParams.set('hourly', 'precipitation')
  url.searchParams.set('timezone', 'GMT')
  url.searchParams.set('start_date', isoDate(start))
  url.searchParams.set('end_date', isoDate(new Date(end.getTime() + 3_600_000)))
  const hourly = await fetchHourly(url.toString())
  return hourly ? sumPrecipitation(hourly, start, end) : null
}

type Hourly = { time: string[]; precipitation: (number | null)[] }
// Kleine cache: bij backfill vallen veel ritten op dezelfde dag en plek.
const cache = new Map<string, Promise<Hourly | null>>()

function fetchHourly(url: string): Promise<Hourly | null> {
  const hit = cache.get(url)
  if (hit) return hit
  const p = fetch(url, { cache: 'no-store' })
    .then(async (res) => (res.ok ? (((await res.json()) as { hourly?: Hourly }).hourly ?? null) : null))
    .catch(() => null)
  if (cache.size > 500) cache.clear()
  cache.set(url, p)
  return p
}
