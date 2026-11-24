import { FragmentCallback } from './fragment'

export const metadata = { title: 'Menghubungkan…', robots: { index: false } }

// Halaman perantara untuk penyedia yang mengembalikan token di #fragment URL (mis. Trello).
// Fragment tidak pernah dikirim ke server oleh browser, jadi halaman ini membacanya lalu mengirim lewat POST.
export default async function OAuthFragmentPage({ params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', fontFamily: 'var(--font-sans)' }}>
      <FragmentCallback provider={provider} />
    </main>
  )
}
