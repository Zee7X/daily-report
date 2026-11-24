'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/client'

export type ConfirmOptions = { title: string; body?: string; confirmLabel?: string; danger?: boolean }
type Confirm = (opts: ConfirmOptions) => Promise<boolean>

const Ctx = createContext<Confirm>(() => Promise.resolve(false))

export function useConfirm() {
  return useContext(Ctx)
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const cancelBtn = useRef<HTMLButtonElement>(null)
  const okBtn = useRef<HTMLButtonElement>(null)
  const pending = useRef<((ok: boolean) => void) | null>(null)
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)

  const confirm = useCallback<Confirm>((o) => {
    pending.current?.(false)
    return new Promise<boolean>((resolve) => {
      pending.current = resolve
      setOpts(o)
    })
  }, [])

  useEffect(() => {
    const d = dialog.current
    if (!opts || !d) return
    if (!d.open) d.showModal()
    // Destructive actions start on Cancel so Enter cannot delete by accident.
    ;(opts.danger ? cancelBtn : okBtn).current?.focus()
  }, [opts])

  const settle = (ok: boolean) => {
    pending.current?.(ok)
    pending.current = null
    dialog.current?.close()
  }

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <dialog
        ref={dialog}
        className="sheet confirm"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onCancel={() => settle(false)}
        onClose={() => settle(false)}
        onClick={(e) => e.target === e.currentTarget && settle(false)}
      >
        <div className="sheet-head">
          <h2 className="subtitle" id="confirm-title">
            {opts?.title}
          </h2>
        </div>
        {opts?.body && (
          <div className="sheet-body">
            <p id="confirm-body">{opts.body}</p>
          </div>
        )}
        <div className="sheet-foot">
          <button ref={cancelBtn} type="button" className="btn" onClick={() => settle(false)}>
            {t.common.cancel}
          </button>
          <button ref={okBtn} type="button" className={`btn ${opts?.danger ? 'danger' : 'primary'}`} onClick={() => settle(true)}>
            {opts?.confirmLabel ?? t.confirm.confirm}
          </button>
        </div>
      </dialog>
    </Ctx.Provider>
  )
}
