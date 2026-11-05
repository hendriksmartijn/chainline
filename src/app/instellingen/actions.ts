'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { z } from 'zod'
import { getSessionAthleteId } from '@/lib/session'
import { getRuleDefaults, ruleKey, saveRuleDefaults, type RuleDefaults } from '@/server/settings'
import { evaluateAndNotify } from '@/server/sync'
import { fieldName, SETTING_FIELDS } from './fields'

export async function saveSettings(formData: FormData) {
  const athleteId = await getSessionAthleteId()
  if (!athleteId) redirect('/')

  const current = await getRuleDefaults(athleteId)
  const next: RuleDefaults = { chain: current.chain.map((r) => ({ ...r })), cassette: current.cassette.map((r) => ({ ...r })) }
  const num = (v: FormDataEntryValue | null, max: number) =>
    z.coerce.number().positive().max(max).safeParse(String(v ?? '').replace(',', '.'))

  for (const f of SETTING_FIELDS) {
    const rule = next[f.componentType].find((r) => ruleKey(r) === ruleKey(f))
    if (!rule) continue
    const t = num(formData.get(fieldName(f, 'threshold')), f.max)
    if (!t.success) redirect(`/instellingen?fout=${encodeURIComponent(f.title)}`)
    rule.threshold = t.data
    if (f.marginLabel) {
      const m = num(formData.get(fieldName(f, 'margin')), f.max)
      if (!m.success || m.data >= t.data) redirect(`/instellingen?fout=${encodeURIComponent(f.title)}`)
      rule.warningMargin = m.data
    }
    if (f.indoorToggle) rule.countIndoor = formData.get(fieldName(f, 'indoor')) === 'on'
  }

  const { updated, kept } = await saveRuleDefaults(athleteId, next)
  after(() => evaluateAndNotify(athleteId))
  revalidatePath('/')
  redirect(`/instellingen?opgeslagen=1&bijgewerkt=${updated}&eigen=${kept}`)
}
