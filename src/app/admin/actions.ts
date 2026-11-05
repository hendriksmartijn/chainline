'use server'
import { redirect } from 'next/navigation'
import { createSubscription } from '@/lib/strava'
import { getAdminAthleteId } from '@/server/admin'

export async function subscribeWebhook() {
  if (!(await getAdminAthleteId())) redirect('/')
  const r = await createSubscription()
  redirect(r.ok ? `/admin?aangemeld=${r.id}` : `/admin?fout=${encodeURIComponent(r.error)}`)
}
