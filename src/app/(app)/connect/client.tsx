'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api } from '@/lib/client'
import type { Board } from '@/lib/connectors/types'
import { useI18n } from '@/lib/i18n/client'

export function DisconnectButton({ provider }: { provider: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      className="btn danger"
      disabled={busy}
      onClick={async () => {
        if (!confirm(t.connect.disconnectConfirm)) return
        setBusy(true)
        await api(`/api/connectors/${provider}`, { method: 'DELETE' }).catch(() => undefined)
        router.refresh()
      }}
    >
      {t.connect.disconnect}
    </button>
  )
}

export function BoardsList({ provider }: { provider: string }) {
  const { t } = useI18n()
  const [boards, setBoards] = useState<Board[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api<{ boards: Board[] }>(`/api/connectors/${provider}/boards`)
      .then((r) => setBoards(r.boards))
      .catch((e: Error) => setError(e.message))
  }, [provider])

  if (error) return <p className="notice bad">{error}</p>
  if (!boards)
    return (
      <div className="stack" aria-busy="true" aria-label={t.picker.loadingBoards}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton pulse" style={{ height: 28 }} />
        ))}
      </div>
    )
  if (!boards.length) return <p className="empty">{t.common.none}</p>
  return (
    <ul className="list">
      {boards.map((b) => (
        <li key={b.id}>
          <span className="grow truncate">
            <strong>{b.project}</strong> <span className="small">/ {b.name}</span>
          </span>
          <span className="small mono">{b.account}</span>
          {b.url && (
            <a className="icon-btn" href={b.url} target="_blank" rel="noreferrer" aria-label={`${t.common.open} ${b.project}`}>
              ↗
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}
