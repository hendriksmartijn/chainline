import 'server-only'
import { env } from '@/env'

/** Extra CSRF-check naast de SameSite-cookie: state-wijzigende API-calls alleen vanaf onze eigen origin. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  return origin !== null && origin === new URL(env().APP_URL).origin
}
