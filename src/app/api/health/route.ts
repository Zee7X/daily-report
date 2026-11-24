import { NextResponse } from 'next/server'
import { health } from '@/lib/health'

// GET /api/health — dipakai docker compose. Detail konfigurasi hanya ditampilkan di dashboard.
export async function GET() {
  const h = await health()
  const ok = h.database && h.encryptionKey
  return NextResponse.json({ ok, database: h.database }, { status: ok ? 200 : 503 })
}
