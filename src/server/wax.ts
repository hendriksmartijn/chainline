import 'server-only'
import { recordEvent } from './components'

/** Registreert een waxbeurt. Controleert eigenaarschap; datum mag in het verleden, niet in de toekomst. */
export const recordWaxed = (athleteId: number, componentId: string, at: Date, source: 'user' | 'push') =>
  recordEvent(athleteId, componentId, 'waxed', at, source)
