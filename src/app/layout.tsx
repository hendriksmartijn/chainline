import type { Metadata, Viewport } from 'next'
import { SwRegister } from '@/components/SwRegister'
import './globals.css'

export const metadata: Metadata = {
  title: 'Chainline',
  description: 'Onderhoudsmeldingen voor je fiets, op basis van je ritten.',
  appleWebApp: { capable: true, title: 'Chainline', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/192', apple: '/icons/180' },
}

export const viewport: Viewport = {
  themeColor: '#111111',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  )
}
