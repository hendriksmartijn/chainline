/**
 * Niet-geheime, domein-brede configuratie. Secrets staan in env (zie src/env.ts).
 * Wijzig je hier wax-factoren of drempels, dan wordt alles opnieuw afgeleid:
 * er zijn geen opgeslagen standen die gemigreerd hoeven te worden.
 */
export interface WaxConfig {
  factors: Record<'dry' | 'wet' | 'indoor' | 'unknown', number>
  wetThresholdMm: number
  indoorSportTypes: readonly string[]
}

export const waxConfig: WaxConfig = {
  factors: {
    dry: 1.0,
    wet: 3.0,
    indoor: 0.3,
    /** Geen startlocatie of weer niet op te halen: behandel als droog, maar label het. */
    unknown: 1.0,
  },
  /** Totale neerslag (mm) over de rituren vanaf waar een rit als nat telt. */
  wetThresholdMm: 0.5,
  /** Sport types die altijd als indoor tellen, ongeacht gekoppelde gear. */
  indoorSportTypes: ['VirtualRide'],
}

export const defaultRules = {
  chain: { type: 'wax_km' as const, threshold: 400, warningMargin: 100 },
}

export const weatherConfig = {
  forecastUrl: 'https://api.open-meteo.com/v1/forecast',
  archiveUrl: 'https://archive-api.open-meteo.com/v1/archive',
  /**
   * De archive-API loopt een paar dagen achter. Ritten jonger dan dit aantal dagen
   * gaan via de forecast-API (die ook recente historische uurwaarden levert).
   */
  forecastMaxAgeDays: 80,
} as const

export const stravaConfig = {
  scope: 'read,activity:read_all,profile:read_all',
  perPage: 200,
  /** Stop met backfillen als het 15-minutengebruik boven dit deel van de limiet komt. */
  backfillUsageCeiling: 0.9,
  /** Ververs het access token als het binnen zoveel seconden verloopt. */
  refreshMarginSeconds: 300,
} as const
