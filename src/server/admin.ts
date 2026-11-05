import 'server-only'
import { allowedAthleteIds } from '@/env'
import { getSessionAthleteId } from '@/lib/session'

/** Alleen atleten op ALLOWED_ATHLETE_IDS. Zonder allowlist is er geen beheer (veilig standaardgedrag). */
export async function getAdminAthleteId(): Promise<number | null> {
  const id = await getSessionAthleteId()
  const allowed = allowedAthleteIds()
  return id && allowed?.has(String(id)) ? id : null
}
