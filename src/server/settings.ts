import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { defaultRules, type RuleDefault } from '@/config'
import { db, schema } from '@/db'
import { loadComponentStates } from './state'

export type ConfigurableType = 'chain' | 'cassette'
export type RuleDefaults = Record<ConfigurableType, RuleDefault[]>

/** Een regel is uniek per onderdeeltype op (type, reset-event). */
export const ruleKey = (r: { type: string; resetOn: string | null }) => `${r.type}:${r.resetOn ?? 'mount'}`

/** Eigen drempels van de gebruiker, aangevuld met de app-defaults voor wat (nog) niet is ingesteld. */
export async function getRuleDefaults(athleteId: number): Promise<RuleDefaults> {
  const [row] = await db().select({ ruleDefaults: schema.athletes.ruleDefaults }).from(schema.athletes).where(eq(schema.athletes.id, athleteId))
  const custom = row?.ruleDefaults ?? {}
  const merge = (type: ConfigurableType) =>
    defaultRules[type].map((d) => custom[type]?.find((c) => ruleKey(c) === ruleKey(d)) ?? d)
  return { chain: merge('chain'), cassette: merge('cassette') }
}

const same = (a: number, b: number) => Math.abs(a - b) < 1e-6

/**
 * Slaat nieuwe standaarddrempels op en past ze toe op de huidige onderdelen.
 * Een onderdeel waarvan je de drempel bewust anders hebt gezet (≠ oude standaard),
 * houdt die eigen drempel. Geeft terug hoeveel regels zijn bijgewerkt en overgeslagen.
 */
export async function saveRuleDefaults(athleteId: number, next: RuleDefaults) {
  const prev = await getRuleDefaults(athleteId)
  await db().update(schema.athletes).set({ ruleDefaults: next }).where(eq(schema.athletes.id, athleteId))

  const current = (await loadComponentStates(athleteId)).filter(
    (c): c is typeof c & { type: ConfigurableType } => (c.type === 'chain' || c.type === 'cassette') && c.state.retiredAt === null,
  )
  if (current.length === 0) return { updated: 0, kept: 0 }
  const rules = await db().select().from(schema.rules).where(inArray(schema.rules.componentId, current.map((c) => c.id)))

  let updated = 0
  let kept = 0
  for (const comp of current) {
    for (const rule of rules.filter((r) => r.componentId === comp.id)) {
      const key = ruleKey(rule)
      const old = prev[comp.type].find((d) => ruleKey(d) === key)
      const neu = next[comp.type].find((d) => ruleKey(d) === key)
      if (!old || !neu) continue
      if (same(neu.threshold, rule.threshold) && same(neu.warningMargin, rule.warningMargin)) continue
      if (!same(rule.threshold, old.threshold) || !same(rule.warningMargin, old.warningMargin)) {
        kept++
        continue
      }
      await db()
        .update(schema.rules)
        .set({ threshold: neu.threshold, warningMargin: neu.warningMargin })
        .where(and(eq(schema.rules.id, rule.id), eq(schema.rules.componentId, comp.id)))
      updated++
    }
  }
  return { updated, kept }
}
