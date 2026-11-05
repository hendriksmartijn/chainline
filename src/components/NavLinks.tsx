'use client'
import { usePathname } from 'next/navigation'

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname()
  return (
    <nav aria-label="Hoofdmenu">
      {links.map((l) => {
        const active = l.href === '/' ? path === '/' || path.startsWith('/onderdeel') || path.startsWith('/wax') : path.startsWith(l.href)
        return (
          <a key={l.href} href={l.href} aria-current={active ? 'page' : undefined}>
            {l.label}
          </a>
        )
      })}
    </nav>
  )
}
