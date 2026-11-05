import type { Metadata, Viewport } from 'next'
import { Header } from '@/components/Header'
import { SwRegister } from '@/components/SwRegister'
import './globals.css'

export const metadata: Metadata = {
  title: 'Chainline',
  description: 'Onderhoudsmeldingen voor je fiets, op basis van je ritten.',
  appleWebApp: { capable: true, title: 'Chainline', statusBarStyle: 'default' },
  icons: { icon: '/icons/192', apple: '/icons/180' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f3f0' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0e0e' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        {children}
        <Header />
        <SwRegister />
      </body>
    </html>
  )
}
