'use client'
import { usePathname } from 'next/navigation'

const ICONS: Record<string, React.ReactNode> = {
  garage: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="6" cy="16" r="3.5" />
      <circle cx="18" cy="16" r="3.5" />
      <path d="M6 16l4-7h5l3 7M10 9l-1.5-3H7M15 9l1-3h2" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" />
    </svg>
  ),
}

export function NavLinks({ links }: { links: { href: string; label: string; icon: keyof typeof ICONS }[] }) {
  const path = usePathname()
  return (
    <div className="tabbar-inner">
      {links.map((l) => {
        const active = l.href === '/' ? path === '/' || path.startsWith('/onderdeel') || path.startsWith('/wax') : path.startsWith(l.href)
        return (
          <a key={l.href} href={l.href} aria-current={active ? 'page' : undefined}>
            {ICONS[l.icon]}
            <span>{l.label}</span>
          </a>
        )
      })}
    </div>
  )
}
