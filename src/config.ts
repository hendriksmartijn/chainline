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

export interface RuleDefault {
  type: 'wax_km' | 'km' | 'measurement'
  threshold: number
  warningMargin: number
  resetOn: 'waxed' | 'measured' | null
  /** Standaard true. */
  countIndoor?: boolean
}

/**
 * Standaardregels per onderdeeltype. Per onderdeel aan te passen in de app.
 * - Ketting: wax-km sinds laatste wax, meetherinnering in echte km sinds laatste meting,
 *   slijtage via kettingmeter (0,5% = vervangen; gangbare grens voor 11/12-speed).
 * - Cassette: echte km sinds montage. 20.000 km is een startwaarde, geen norm: stel zelf bij.
 */
export const defaultRules: Record<'chain' | 'cassette', RuleDefault[]> = {
  chain: [
    { type: 'wax_km', threshold: 400, warningMargin: 100, resetOn: 'waxed' },
    { type: 'measurement', threshold: 0.5, warningMargin: 0.1, resetOn: null },
    { type: 'km', threshold: 1000, warningMargin: 100, resetOn: 'measured' },
  ],
  // Indoor telt niet: op een direct-drive trainer draait de cassette van de trainer.
  cassette: [{ type: 'km', threshold: 20000, warningMargin: 2000, resetOn: null, countIndoor: false }],
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
