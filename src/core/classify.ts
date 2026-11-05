import type { WaxConfig } from '@/config'
import type { ActivityInput, WeatherClass } from './types'

/**
 * Indoor wint altijd, ongeacht gekoppelde gear: je racefiets op de trainer
 * slijt de ketting nauwelijks, ook al staat de rit op die fiets.
 */
export function classifyActivity(a: ActivityInput, config: WaxConfig): WeatherClass {
  if (a.trainer || config.indoorSportTypes.includes(a.sportType)) return 'indoor'
  if (!a.hasLocation || a.precipitationMm === null) return 'unknown'
  return a.precipitationMm >= config.wetThresholdMm ? 'wet' : 'dry'
}

export function waxKmFor(a: ActivityInput, config: WaxConfig): { cls: WeatherClass; km: number; waxKm: number } {
  const cls = classifyActivity(a, config)
  const km = a.distanceM / 1000
  return { cls, km, waxKm: km * config.factors[cls] }
}
