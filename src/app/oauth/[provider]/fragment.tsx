'use client'

import { useEffect, useState } from 'react'

export function FragmentCallback({ provider }: { provider: string }) {
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const query = new URLSearchParams(window.location.search)
    // Hapus token dari address bar & riwayat sebelum melakukan apa pun.
    window.history.replaceState(null, '', window.location.pathname)
    fetch(`/api/connectors/${encodeURIComponent(provider)}/callback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: query.get('state'), token: hash.get('token'), error: hash.get('error') ?? query.get('error') }),
    })
      .then((r) => r.json())
      .then((d: { redirect?: string }) => (d.redirect ? window.location.replace(d.redirect) : setError('Gagal menghubungkan.')))
      .catch(() => setError('Gagal menghubungkan.'))
  }, [provider])
  return <p className="label">{error ?? 'Menghubungkan…'}</p>
}
