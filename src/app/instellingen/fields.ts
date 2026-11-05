/** Welke drempels de gebruiker op de instellingenpagina ziet, met UI-teksten. */
export interface SettingField {
  componentType: 'chain' | 'cassette'
  type: 'wax_km' | 'km' | 'measurement'
  resetOn: 'waxed' | 'measured' | null
  title: string
  help: string
  thresholdLabel: string
  marginLabel: string | null
  unit: string
  step: string
  max: number
  /** Toon een schakelaar "Indoor meetellen". */
  indoorToggle?: { label: string; help: string }
}

export const SETTING_FIELDS: SettingField[] = [
  {
    componentType: 'chain', type: 'wax_km', resetOn: 'waxed',
    title: 'Kettingwax',
    help: 'Na hoeveel wax-km opnieuw waxen. Nat telt ×3, indoor ×0,3.',
    thresholdLabel: 'Waxen na', marginLabel: 'Waarschuwing vooraf', unit: 'wax-km', step: '10', max: 5000,
  },
  {
    componentType: 'chain', type: 'measurement', resetOn: null,
    title: 'Ketting vervangen',
    help: 'Rek volgens de kettingmeter. Daarboven slijt je cassette mee; je krijgt direct een melding.',
    thresholdLabel: 'Vervangen bij', marginLabel: 'Waarschuwing vooraf', unit: '%', step: '0.05', max: 2,
  },
  {
    componentType: 'chain', type: 'km', resetOn: 'measured',
    title: 'Ketting meten',
    help: 'Herinnering om de ketting te meten, in echte km sinds de laatste meting.',
    thresholdLabel: 'Meten elke', marginLabel: null, unit: 'km', step: '100', max: 20000,
  },
  {
    componentType: 'cassette', type: 'km', resetOn: null,
    title: 'Cassette vervangen',
    help: 'Levensduur in echte km sinds montage.',
    indoorToggle: { label: 'Indoor meetellen', help: 'Uit bij een direct-drive trainer (zoals Tacx Neo/Flux): daar draait de cassette van de trainer. Aan bij een wheel-on trainer.' },
    thresholdLabel: 'Vervangen na', marginLabel: 'Waarschuwing vooraf', unit: 'km', step: '500', max: 200000,
  },
]

export const fieldName = (f: SettingField, part: 'threshold' | 'margin' | 'indoor') => `${f.componentType}.${f.type}.${f.resetOn ?? 'mount'}.${part}`
