import { getSessionAthleteId } from '@/lib/session'
import { getAdminAthleteId } from '@/server/admin'
import { NavLinks } from './NavLinks'

/** Menu: alleen voor ingelogde gebruikers. Beheer alleen voor atleten op de allowlist. */
export async function Header() {
  const athleteId = await getSessionAthleteId().catch(() => null)
  if (!athleteId) return null
  const isAdmin = (await getAdminAthleteId().catch(() => null)) !== null
  const links = [
    { href: '/', label: 'Garage' },
    { href: '/instellingen', label: 'Instellingen' },
    ...(isAdmin ? [{ href: '/admin', label: 'Beheer' }] : []),
  ]
  return (
    <header className="topbar">
      <a href="/" className="brand">Chainline</a>
      <NavLinks links={links} />
    </header>
  )
}
