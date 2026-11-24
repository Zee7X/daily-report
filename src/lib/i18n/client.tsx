'use client'

import { createContext, useContext } from 'react'
import { dictionaries, type Dict, type Locale } from './dict'

const Ctx = createContext<{ locale: Locale; t: Dict }>({ locale: 'id', t: dictionaries.id })

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={{ locale, t: dictionaries[locale] }}>{children}</Ctx.Provider>
}

export function useI18n() {
  return useContext(Ctx)
}
