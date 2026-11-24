import type { Metadata, Viewport } from 'next'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import { I18nProvider } from '@/lib/i18n/client'
import { getLocale } from '@/lib/i18n/server'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Daily Report', template: '%s · Daily Report' },
  description: 'Susun laporan progres dari kanban, pilih poin dan gambar, lalu posting dalam satu klik.',
}

export const viewport: Viewport = { themeColor: '#ffffff' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <html lang={locale} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  )
}
