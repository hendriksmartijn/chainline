// Draait de Drizzle-migraties tijdens een Vercel-productiebuild, zodat je niets lokaal hoeft te doen.
// Preview- en lokale builds slaan dit over: die mogen nooit het productieschema wijzigen.
import { execSync } from 'node:child_process'

if (process.env.VERCEL_ENV !== 'production') {
  console.log(`[migrate] overgeslagen (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'lokaal'})`)
  process.exit(0)
}
if (!process.env.DATABASE_URL_UNPOOLED && !process.env.DATABASE_URL) {
  console.error('[migrate] geen DATABASE_URL(_UNPOOLED) beschikbaar tijdens de build')
  process.exit(1)
}
console.log('[migrate] productie-migraties draaien…')
execSync('pnpm exec drizzle-kit migrate', { stdio: 'inherit' })
