'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/client'

type Item = { id: number; msg: string; bad: boolean; leaving: boolean }
type Api = {
  toast: (msg: string, opts?: { bad?: boolean }) => number
  dismiss: (id: number) => void
}

const MAX = 3
const EXIT_MS = 160

const Ctx = createContext<Api>({ toast: () => 0, dismiss: () => undefined })

export function useToast() {
  return useContext(Ctx)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  const [items, setItems] = useState<Item[]>([])
  const next = useRef(1)
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, leaving: true } : i)))
    window.setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), EXIT_MS)
  }, [])

  const toast = useCallback(
    (msg: string, opts?: { bad?: boolean }) => {
      const id = next.current++
      const bad = Boolean(opts?.bad)
      setItems((prev) => [...prev, { id, msg, bad, leaving: false }].slice(-MAX))
      timers.current.set(id, window.setTimeout(() => dismiss(id), bad ? 6000 : 4000))
      return id
    },
    [dismiss],
  )

  useEffect(() => {
    const live = timers.current
    return () => live.forEach((h) => window.clearTimeout(h))
  }, [])

  return (
    <Ctx.Provider value={{ toast, dismiss }}>
      {children}
      <div className="toasts">
        {items.map((i) => (
          <div key={i.id} className={`toast ${i.bad ? 'bad' : ''} ${i.leaving ? 'leaving' : ''}`} role={i.bad ? 'alert' : 'status'} aria-live={i.bad ? 'assertive' : 'polite'}>
            <span>{i.msg}</span>
            <button type="button" aria-label={t.common.close} onClick={() => dismiss(i.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
