import type { Metadata, Viewport } from 'next'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import { ConfirmProvider } from '@/components/confirm'
import { ToastProvider } from '@/components/toast'
import { I18nProvider } from '@/lib/i18n/client'
import { dictionaries } from '@/lib/i18n/dict'
import { getLocale } from '@/lib/i18n/server'
import './globals.css'

export async function generateMetadata(): Promise<Metadata> {
  const t = dictionaries[await getLocale()]
  return { title: { default: 'Daily Report', template: '%s · Daily Report' }, description: t.meta.description }
}

export const viewport: Viewport = { themeColor: '#ffffff' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <html lang={locale} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <I18nProvider locale={locale}>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
