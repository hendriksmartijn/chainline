import { getSessionAthleteId } from '@/lib/session'
import { getAdminAthleteId } from '@/server/admin'
import { NavLinks } from './NavLinks'

/** Tabbalk onderin: alleen voor ingelogde gebruikers. Beheer alleen voor atleten op de allowlist. */
export async function Header() {
  const athleteId = await getSessionAthleteId().catch(() => null)
  if (!athleteId) return null
  const isAdmin = (await getAdminAthleteId().catch(() => null)) !== null
  const links = [
    { href: '/', label: 'Garage', icon: 'garage' as const },
    { href: '/instellingen', label: 'Instellingen', icon: 'settings' as const },
    ...(isAdmin ? [{ href: '/admin', label: 'Beheer', icon: 'admin' as const }] : []),
  ]
  return (
    <nav className="tabbar" aria-label="Hoofdmenu">
      <NavLinks links={links} />
    </nav>
  )
}
