<p align="center">
  <img src="assets/logo.png" alt="Daily Report Logo" width="120" />
</p>

# Daily Report — Report Tool

Web untuk menyusun laporan progres dari kanban (pertama: **Basecamp**). Ambil bahan dari kartu, centang poin dan gambar yang perlu, lalu posting ke kartu tujuan dalam satu klik. Gambar terlampir sebagai file asli Basecamp, bukan tempelan yang bisa hilang.

Satu repo Next.js, dua mode:

| | Mode lokal (clone repo) | Mode cloud |
| --- | --- | --- |
| Aplikasi | `npm start` / `docker compose up` di `localhost:3000` | Vercel + domain pribadi |
| Database | MySQL 8 (Docker) atau TiDB lokal | TiDB Cloud |
| Storage | folder `./storage` | Cloudflare R2 (S3-compatible) |
| Job queue | runner di proses yang sama | Upstash QStash |
| Screenshot/PDF | worker Python Playwright di komputer sendiri, **termasuk `localhost`** | worker yang sama di Railway/Render/Fly, hanya URL publik |
| Login | opsional (`SINGLE_USER=true`) | wajib, "Login with Basecamp" |

Perbedaan mode hanya ada di `.env`.

## Tampilan

**Beranda**: status koneksi, laporan terakhir, template, dan pemeriksaan sistem.

![Beranda](assets/screenshots/home.png)

**Laporan baru**: pilih template, kartu sumber, dan kartu tujuan.

![Laporan baru](assets/screenshots/new-report.png)

**Editor draf**: centang bagian, poin, dan gambar, lalu ubah urutannya. Gambar ditempel ke poin dan dinomori otomatis.

![Editor draf](assets/screenshots/editor.png)

<details>
<summary>Pratinjau, dialog posting, riwayat, template, mobile</summary>

**Pratinjau**: isi komentar persis seperti yang akan diposting.

![Pratinjau](assets/screenshots/preview.png)

**Post ke Basecamp**: konfirmasi kartu tujuan dan centang subtask.

![Dialog posting](assets/screenshots/post-dialog.png)

**Riwayat**

![Riwayat](assets/screenshots/history.png)

**Template**

![Template](assets/screenshots/templates.png)

**Mobile**

<img src="assets/screenshots/mobile.png" alt="Tampilan mobile" width="320" />

</details>

## Fitur

- **Connect Basecamp** (OAuth Launchpad). Token dienkripsi AES-256-GCM dan diperbarui otomatis sebelum kedaluwarsa. Disconnect menghapus token.
- **Pilih kartu** dengan menelusuri project → card table → kolom → kartu, atau menempel URL kartu. Kartu sumber dan tujuan boleh berbeda.
- **Draf dari template**: AI (Anthropic/OpenAI, dipilih lewat `.env`) menyusun poin per bagian dari deskripsi, step, komentar, dan catatanmu. Tanpa API key, draf disusun dari step dan komentar.
- **Penyamaran kredensial**: teks mirip password/token di kartu dan komentar disamarkan sebelum masuk draf maupun prompt AI.
- **Editor**: centang bagian/poin/gambar (yang tidak dicentang tidak ikut terposting), edit teks, ubah urutan, tempel gambar ke poin. Tersimpan otomatis.
- **Gambar**: upload PNG/JPG (maks. 10 MB) atau screenshot dari daftar URL (default 1440×900). Urutkan dengan drag; nomor "Gambar N" menyesuaikan otomatis.
- **Post ke Basecamp**: gambar diupload sebagai lampiran (`attachable_sgid` → `<bc-attachment>`), posisinya sama dengan draf. Opsional mencentang subtask. Posting ulang menawarkan *Update komentar lama* atau *Posting baru*, jadi tidak ada posting dobel.
- **Cadangan**: unduh PDF, salin HTML (rich text, gambar ikut), salin Markdown, atau tampilan cetak.
- **Riwayat** laporan dengan status dan tautan komentar. Diff draf awal vs versi terposting disimpan untuk analisis pola edit.
- UI **Indonesia / English**, navigasi keyboard, kontras WCAG AA.

## Mulai cepat (mode lokal)

### 1. Daftarkan integrasi Basecamp

1. Buka <https://launchpad.37signals.com/integrations> → *Register another application*.
2. Redirect URI: `http://localhost:3000/api/connectors/basecamp/callback`
3. Simpan **Client ID** dan **Client Secret**.

### 2. Siapkan `.env`

```bash
git clone https://github.com/Zee7X/daily-report.git
cd daily-report
cp .env.example .env
```

Isi minimal:

```bash
ENCRYPTION_KEY=        # npm run gen:key  atau  openssl rand -base64 32
BASECAMP_CLIENT_ID=
BASECAMP_CLIENT_SECRET=
BASECAMP_USER_AGENT=Daily Report (email-kamu@example.com)
AI_PROVIDER=anthropic  # atau openai / none
AI_API_KEY=
```

> Simpan `ENCRYPTION_KEY`. Kalau kunci berganti, token Basecamp yang tersimpan tidak bisa dibuka dan kamu perlu connect ulang.

### 3a. Dengan Docker (satu perintah)

```bash
docker compose up --build
```

Ini menyalakan MySQL 8, worker screenshot/PDF, dan aplikasi. Buka <http://localhost:3000>. Migrasi database jalan otomatis.
Screenshot `http://localhost:xxxx` diarahkan ke komputer host lewat `host.docker.internal`, jadi dev server yang jalan di laptopmu tetap bisa difoto (dev server perlu listen di `0.0.0.0` bila tidak terjangkau).

### 3b. Tanpa Docker

Butuh Node.js 22+, Python 3.10+, dan MySQL 8 (atau TiDB lokal: `tiup playground`).

```bash
npm install
npm run db:migrate        # membuat database report_tool bila belum ada
npm run build && npm start

# terminal lain: worker screenshot/PDF
python3 -m venv worker/.venv
worker/.venv/bin/pip install -r worker/requirements.txt
worker/.venv/bin/python -m playwright install chromium
worker/.venv/bin/python worker/main.py
```

Untuk pengembangan, pakai `npm run dev` sebagai ganti `build && start`. Worker bersifat opsional: tanpa worker, upload gambar tetap jalan dan PDF dibuat lewat tampilan cetak browser.

## Konfigurasi

| Variabel | Keterangan |
| --- | --- |
| `APP_MODE` | `local` atau `cloud` |
| `APP_URL` | URL publik aplikasi (OAuth dan callback job) |
| `SINGLE_USER` | `true` = tanpa halaman login (hanya mode lokal) |
| `DATABASE_URL` | `mysql://user:pass@host:port/db` (MySQL 8 atau TiDB) |
| `DATABASE_SSL` | `true` untuk TiDB Cloud |
| `STORAGE_DRIVER` | `local` (`STORAGE_PATH`) atau `s3` (`S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) |
| `QUEUE_DRIVER` | `local` atau `qstash` (`QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`) |
| `JOBS_SECRET` | Bearer token bila worker/cron memanggil `POST /api/jobs/:type` langsung |
| `BROWSER_DRIVER` | `local-worker`, `remote-worker`, atau `none` |
| `BROWSER_WORKER_URL` / `BROWSER_WORKER_TOKEN` | alamat worker dan token (sama dengan `WORKER_TOKEN` di worker) |
| `BASECAMP_*` | Client ID/Secret, Redirect URI, User-Agent (wajib berisi kontak) |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` | `anthropic` (default model `claude-sonnet-5-5`), `openai` (`AI_MODEL` wajib), atau `none` |
| `ENCRYPTION_KEY` | 32 byte base64 untuk enkripsi token dan tanda tangan sesi/URL |

## Mode cloud

1. **Database**: buat cluster TiDB Cloud (region Singapore), lalu
   `DATABASE_URL=mysql://<user>:<pass>@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/report_tool` dan `DATABASE_SSL=true`.
   Jalankan `npm run db:migrate` sekali dari komputermu dengan `.env` yang sama.
2. **Storage**: bucket Cloudflare R2 privat, `STORAGE_DRIVER=s3`. Gambar dibaca lewat presigned URL.
3. **Queue**: Upstash QStash, `QUEUE_DRIVER=qstash`. QStash memanggil `https://<domain>/api/jobs/:type` dan mengulang job yang gagal (maks. 3 percobaan).
4. **Worker**: deploy folder `worker/` (ada `Dockerfile`) ke Railway/Render/Fly dengan `WORKER_TOKEN=<acak>` dan `BLOCK_PRIVATE_NETWORKS=true`. Isi `BROWSER_DRIVER=remote-worker`, `BROWSER_WORKER_URL`, `BROWSER_WORKER_TOKEN` di Vercel.
5. **Vercel**: import repo, isi semua variabel, `APP_MODE=cloud`, `APP_URL=https://<domain>`, dan daftarkan `https://<domain>/api/connectors/basecamp/callback` di Launchpad. Paket Pro diperlukan untuk pemakaian kerja/komersial.

## Arsitektur

```
Browser
  │
  ▼
Next.js (halaman + app/api)
  ├─► Database      MySQL 8 / TiDB          src/lib/db.ts, db/migrations
  ├─► Storage       folder lokal / R2       src/lib/storage.ts
  ├─► Job queue     lokal / QStash          src/lib/jobs
  │        └─► Worker Python Playwright     worker/main.py
  ├─► Basecamp API  OAuth per pengguna      src/lib/connectors/basecamp.ts
  └─► AI API        Anthropic / OpenAI      src/lib/ai.ts
```

```
src/
  app/(app)/          halaman: beranda, laporan baru, editor, riwayat, template, koneksi, login
  app/api/            route API (connectors, reports, templates, jobs, files, locale)
  app/print/[id]/     tampilan cetak
  components/         shell, card picker, ikon
  lib/connectors/     antarmuka Connector + implementasi Basecamp
  lib/report/         format netral laporan, renderer (HTML Basecamp, Markdown, PDF), draf, diff
  lib/repo/           akses database per tabel
worker/               worker screenshot + PDF
db/migrations/        skema SQL (tanpa stored procedure, trigger, atau foreign key)
```

### Menambah connector

Implementasikan antarmuka `Connector` di `src/lib/connectors/types.ts` (OAuth, `listBoards`, `listColumns`, `listCards`, `getCard`, `parseCardUrl`, `renderReport`, `postReport`, dan opsional `uploadImage`, `updateReport`, `setChecklist`), lalu daftarkan di `src/lib/connectors/index.ts`. Halaman dan API tidak perlu diubah.

## Keamanan

- Token OAuth dienkripsi AES-256-GCM. Client Secret hanya dipakai di server.
- Cookie sesi dan state OAuth ditandatangani HMAC, `HttpOnly`, `SameSite=Lax`, dan `Secure` di mode cloud.
- Request yang mengubah data dari Origin lain ditolak.
- Gambar privat, hanya bisa dibuka lewat URL bertanda tangan yang kedaluwarsa dalam 1 jam.
- Jenis file upload dicek dari isinya (magic bytes), bukan dari nama file.
- Mode cloud menolak screenshot ke localhost dan alamat jaringan privat, di aplikasi dan di worker.
- Request ke Basecamp dibatasi 40 per 10 detik per akun, dengan retry dan backoff untuk 429/5xx.

## Lisensi

MIT (c) [Zee7X](https://github.com/Zee7X)
