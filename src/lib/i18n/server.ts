import 'server-only'
import { cookies } from 'next/headers'
import { dictionaries, type Locale } from './dict'

export const LOCALE_COOKIE = 'rt_locale'

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value
  return v === 'id' ? 'id' : 'en'
}

export async function getDict() {
  const locale = await getLocale()
  return { locale, t: dictionaries[locale] }
}
