<p align="center">
  <img src="assets/logo.png" alt="Daily Report Logo" width="120" />
</p>

# Daily Report — Report Tool

Web untuk menyusun laporan progres kerja. Ambil bahan dari kartu kanban (pertama: **Basecamp**) atau tulis sendiri, centang poin dan gambar yang perlu, lalu kirim dalam satu klik:

- **ke kartu kanban**: komentar dengan gambar sebagai lampiran asli, bukan tempelan yang bisa hilang;
- **lewat webhook**: Discord, Slack, Microsoft Teams, atau JSON untuk n8n/Zapier/Make;
- **atau salin saja**: format siap tempel untuk WhatsApp, Slack, Teams, HTML, Markdown, dan PDF.

Tidak memakai kanban? Tetap bisa dipakai penuh: tulis bahannya, susun, lalu salin atau kirim lewat webhook.

Satu repo Next.js, dua mode:

| | Mode lokal (clone repo) | Mode cloud |
| --- | --- | --- |
| Aplikasi | `npm start` / `docker compose up` di `localhost:3000` | Vercel + domain pribadi |
| Database | MySQL 8 (Docker) atau TiDB lokal | TiDB Cloud |
| Storage | folder `./storage` | Vercel Blob privat (atau Cloudflare R2) |
| Job queue | runner di proses yang sama | runner di fungsi Vercel (`after()`), atau Upstash QStash |
| Screenshot/PDF | worker Python Playwright di komputer sendiri, **termasuk `localhost`** | worker yang sama di Railway/Render/Fly, hanya URL publik |
| Login | opsional (`SINGLE_USER=true`) | wajib: email + password atau "Login with Basecamp", bisa di domain terpisah |

Perbedaan mode hanya ada di `.env`.

## Tampilan

**Beranda**: koneksi dan webhook, laporan terakhir, template, dan pemeriksaan sistem.

![Beranda](assets/screenshots/home.png)

**Laporan baru, dari kartu**: pilih template, kartu sumber, dan tujuan.

![Laporan baru dari kartu](assets/screenshots/new-report.png)

**Laporan baru, tulis sendiri**: tanpa kanban. Baris yang sama dengan judul bagian (mis. `Sedang dikerjakan:`) memindahkan poin berikutnya ke bagian itu. Tujuan bisa webhook atau *Salin saja*.

![Laporan baru tulis sendiri](assets/screenshots/new-report-write.png)

**Editor draf**: centang bagian, poin, dan gambar, lalu ubah urutannya. Gambar ditempel ke poin dan dinomori otomatis. Tombol `WA`, `SL`, dan `TM` menyalin format WhatsApp, Slack, dan Teams.

![Editor draf](assets/screenshots/editor.png)

**Koneksi**: connector kanban dan daftar webhook.

![Koneksi dan webhook](assets/screenshots/connect.png)

<details>
<summary>Pratinjau, dialog posting, kirim ke webhook, riwayat, template, mobile</summary>

**Pratinjau**: isi komentar persis seperti yang akan diposting.

![Pratinjau](assets/screenshots/preview.png)

**Post ke Basecamp**: konfirmasi kartu tujuan dan centang subtask.

![Dialog posting](assets/screenshots/post-dialog.png)

**Editor dengan tujuan webhook**

![Editor dengan webhook](assets/screenshots/editor-webhook.png)

**Kirim ke Discord**

![Dialog kirim webhook](assets/screenshots/send-dialog.png)

**Riwayat**

![Riwayat](assets/screenshots/history.png)

**Template**

![Template](assets/screenshots/templates.png)

**Mobile**

<img src="assets/screenshots/mobile.png" alt="Tampilan mobile" width="320" />

</details>

## Cara kerja

Alur lama: agen AI di laptop mengetes fitur, lalu membuat HTML + PDF di `Pictures\Report\<MODUL>\`. Setelah itu teks masih diedit, disalin ke Basecamp, gambar dilampirkan ulang, dan subtask dicentang manual.

Dengan Report Tool, pekerjaan setelah testing pindah ke satu halaman:

1. **Bahan**: pilih kartu Basecamp (deskripsi, step, komentar dibaca otomatis), dan/atau tempel catatan sendiri. Ringkasan hasil testing dari Claude bisa langsung ditempel di sini, tidak perlu dijadikan HTML dulu.
2. **Gambar**: upload screenshot hasil testing, atau ambil screenshot dari daftar URL. Mode lokal bisa memotret `localhost` (fitur yang belum di-deploy); mode cloud hanya URL publik, jadi screenshot localhost diupload.
3. **Draf**: bahan disusun ke bagian-bagian template (Selesai, Sedang dikerjakan, Kendala, Siap diuji QA). Dengan API key AI, kalimatnya dirapikan AI; tanpa API key, poin diambil apa adanya.
4. **Pilih**: centang poin dan gambar yang ikut, urutkan, tempel gambar ke poin. Yang tidak dicentang tidak terkirim.
5. **Kirim**: *Post ke Basecamp* (gambar jadi lampiran asli, subtask bisa dicentang), kirim ke webhook (Discord/Slack/Teams/n8n), atau salin untuk WhatsApp. PDF tetap ada sebagai cadangan.

Claude tetap dipakai untuk testing dan merangkum hasilnya; Report Tool mengambil alih bagian merapikan dan mengirim.

## Fitur

- **Sumber bahan**: kartu kanban (deskripsi, step, komentar) atau tulisan sendiri. Tanpa kanban, laporan tetap bisa dibuat penuh.
- **Connect Basecamp** (OAuth Launchpad). Token dienkripsi AES-256-GCM dan diperbarui otomatis sebelum kedaluwarsa. Disconnect menghapus token.
- **Pilih kartu** dengan menelusuri project → card table → kolom → kartu, atau menempel URL kartu. Kartu sumber dan tujuan boleh berbeda.
- **Draf dari template**: AI (Anthropic/OpenAI, dipilih lewat `.env`) menyusun poin per bagian. Tanpa API key, draf disusun dari step kartu dan catatanmu.
- **Penyamaran kredensial**: teks mirip password/token disamarkan sebelum masuk draf maupun prompt AI.
- **Editor**: centang bagian/poin/gambar (yang tidak dicentang tidak ikut), edit teks, ubah urutan, tempel gambar ke poin. Tersimpan otomatis.
- **Gambar**: upload PNG/JPG (maks. 10 MB) atau screenshot dari daftar URL (default 1440×900). Urutkan dengan drag; nomor "Gambar N" menyesuaikan otomatis.
- **Tujuan posting**, dipilih per laporan:
  - *Kartu kanban*: gambar diupload sebagai lampiran (`<bc-attachment>` di Basecamp), opsional centang subtask. Posting ulang menawarkan *Update komentar lama* atau *Posting baru*.
  - *Webhook*: lihat tabel di bawah.
  - *Salin saja*: tanpa posting.
- **Format salin**: WhatsApp (`*tebal*`, bullet `•`), Slack (mrkdwn), Teams (rich text + teks biasa), HTML dengan gambar, Markdown, PDF, dan tampilan cetak.
- **Riwayat** laporan dengan status dan tautan. Diff draf awal vs versi terkirim disimpan untuk analisis pola edit.
- UI **Indonesia / English**, navigasi keyboard, kontras WCAG AA.

### Webhook

| Jenis | Cara mendapatkan URL | Gambar |
| --- | --- | --- |
| Discord | Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL | ikut sebagai file (maks. 10 per pesan, 10 MB) |
| Slack | api.slack.com/apps → Incoming Webhooks → Add New Webhook | ditulis sebagai rujukan `[Gambar N: …]` |
| Microsoft Teams | channel → ••• → Workflows → "Send webhook alerts to a channel" | ditulis sebagai rujukan |
| JSON (n8n/Zapier/Make) | URL webhook dari tool otomasimu | base64 di payload (total maks. 20 MB) |

Payload JSON berisi `report`, `formats.markdown`, `formats.html`, `formats.whatsapp`, `formats.slack`, `body`, dan `images[]`. Bila secret diisi, header `x-daily-report-signature: sha256=<hmac>` bisa dipakai untuk memverifikasi pengirim.

URL webhook disimpan terenkripsi dan tidak pernah dikirim balik ke browser. Webhook tidak bisa mengedit pesan lama, jadi kirim ulang selalu menjadi pesan baru. Di mode cloud, webhook hanya boleh mengarah ke alamat publik.

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
| `APP_URL` | URL publik aplikasi |
| `AUTH_URL` | opsional: domain khusus login dan OAuth (lihat bagian Vercel) |
| `SIGNUP_ALLOWED_EMAILS` | email atau `@domain` yang boleh mendaftar; kosong = hanya akun pertama |
| `SINGLE_USER` | `true` = tanpa halaman login (hanya mode lokal) |
| `DATABASE_URL` | `mysql://user:pass@host:port/db` (MySQL 8 atau TiDB) |
| `DATABASE_SSL` | otomatis `true` untuk host `tidbcloud.com` |
| `STORAGE_DRIVER` | `local` (`STORAGE_PATH`), `vercel-blob` (store privat), atau `s3` (`S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) |
| `QUEUE_DRIVER` | `local` atau `qstash` (`QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`) |
| `JOBS_SECRET` | Bearer token bila worker/cron memanggil `POST /api/jobs/:type` langsung |
| `BROWSER_DRIVER` | `local-worker`, `remote-worker`, atau `none` |
| `BROWSER_WORKER_URL` / `BROWSER_WORKER_TOKEN` | alamat worker dan token (sama dengan `WORKER_TOKEN` di worker) |
| `BASECAMP_*` | Client ID/Secret, Redirect URI, User-Agent (wajib berisi kontak) |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` | `anthropic` (default model `claude-sonnet-5-5`), `openai` (`AI_MODEL` wajib), atau `none` |
| `ENCRYPTION_KEY` | 32 byte base64 untuk enkripsi token dan tanda tangan sesi/URL |

## Online di Vercel + TiDB Cloud

Contoh di bawah memakai domain `daily-report.lumelo.my.id` dan cluster TiDB yang sudah ada. Database lain di cluster yang sama tidak disentuh: aplikasi hanya membuat dan mengubah tabel di database miliknya sendiri, dan migrasi tidak pernah menjalankan `DROP`.

### 1. Database di TiDB (sekali saja)

Di DBeaver, buka koneksi TiDB sebagai user `root` cluster, lalu jalankan:

```sql
CREATE DATABASE IF NOT EXISTS daily_report;

-- <prefix> = bagian sebelum ".root" pada username root-mu, mis. 4AbCdEfGh
CREATE USER '<prefix>.daily_report'@'%' IDENTIFIED BY '<password-panjang-acak>';
GRANT ALL PRIVILEGES ON daily_report.* TO '<prefix>.daily_report'@'%';
```

User ini hanya punya akses ke `daily_report`, jadi aplikasi tidak bisa membaca atau mengubah database lain di cluster. Tabel dibuat otomatis saat deploy (lihat langkah 3).

`DATABASE_URL` untuk aplikasi (host sesuai dialog *Connect* di TiDB Cloud; karakter khusus di password harus di-URL-encode):

```
mysql://<prefix>.daily_report:<password>@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/daily_report
```

TLS aktif otomatis untuk host `tidbcloud.com`.

### 2. Project Vercel

1. *Add New → Project*, import repo `Zee7X/daily-report`. Framework terdeteksi sebagai Next.js.
2. *Storage → Create → Blob*, pilih akses **Private**, lalu hubungkan ke project. Gambar laporan disimpan di sini dan hanya bisa dibuka lewat aplikasi.
3. *Settings → Environment Variables*:

| Variabel | Nilai |
| --- | --- |
| `APP_URL` | `https://daily-report.lumelo.my.id` |
| `AUTH_URL` | domain `.vercel.app` project-mu, mis. `https://daily-report.vercel.app` |
| `DATABASE_URL` | dari langkah 1 |
| `ENCRYPTION_KEY` | hasil `npm run gen:key` (simpan baik-baik) |
| `SIGNUP_ALLOWED_EMAILS` | email yang boleh mendaftar, mis. `rizick076@gmail.com,@kantor.com`; kosong = hanya akun pertama |
| `BASECAMP_CLIENT_ID`, `BASECAMP_CLIENT_SECRET` | dari Launchpad |
| `BASECAMP_USER_AGENT` | `Daily Report (email-kamu@example.com)` |
| `AI_PROVIDER`, `AI_API_KEY` | opsional |

Di Vercel, nilai default berikut sudah otomatis: `APP_MODE=cloud`, `STORAGE_DRIVER=vercel-blob`, `QUEUE_DRIVER=local` (job berjalan di fungsi yang sama lewat `after()`), `BROWSER_DRIVER=none`.

### 3. Deploy

Script `vercel-build` menjalankan migrasi database lalu `next build`, jadi setiap deploy otomatis membuat atau memperbarui tabel di `daily_report`.

### 4. Domain

*Settings → Domains → Add* `daily-report.lumelo.my.id`, lalu buat record DNS `CNAME daily-report` ke nilai yang ditampilkan Vercel. Tunggu sampai status domain *Valid Configuration* dan sertifikat HTTPS terbit sebelum membukanya.

### 5. Basecamp

Di integrasi Launchpad, isi Redirect URI dengan domain login (bukan domain lumelo):

```
https://daily-report.vercel.app/api/connectors/basecamp/callback
```

### Login di domain Vercel, aplikasi di domain sendiri

Bila `AUTH_URL` diisi:

- `/login` di `daily-report.lumelo.my.id` dialihkan ke `AUTH_URL`. Form email/password, "Login with Basecamp", dan callback OAuth hanya berjalan di sana.
- Setelah login berhasil, sesi diserahkan ke `APP_URL` lewat token sekali pakai yang berlaku 60 detik, hanya sah untuk domain tujuan, dan hanya hash-nya yang disimpan.
- "Connect Basecamp" dari domain lumelo juga mampir ke `AUTH_URL` dengan cara yang sama, lalu kembali ke halaman Koneksi.
- Sesi di domain login hanya berlaku 15 menit. Logout menghapus sesi di kedua domain.
- Halaman aplikasi yang dibuka di domain `.vercel.app` dialihkan ke `APP_URL`.

Peringatan merah di domain baru biasanya salah satu dari dua hal: sertifikat HTTPS belum terbit (tunggu beberapa menit setelah DNS benar), atau Google Safe Browsing menandai domain baru yang punya halaman login sebagai phishing. Memindahkan semua form login ke domain `.vercel.app` mengurangi risiko yang kedua, tapi tidak menjaminnya. Bila tetap muncul, verifikasi domain di Google Search Console lalu minta peninjauan ulang.

### Screenshot dan PDF di cloud

Vercel tidak menjalankan browser, jadi di cloud screenshot diupload manual dan PDF dibuat lewat *Tampilan cetak → Save as PDF*. Untuk screenshot otomatis, deploy folder `worker/` (ada `Dockerfile`) ke Railway/Render/Fly dengan `WORKER_TOKEN` dan `BLOCK_PRIVATE_NETWORKS=true`, lalu isi `BROWSER_DRIVER=remote-worker`, `BROWSER_WORKER_URL`, dan `BROWSER_WORKER_TOKEN` di Vercel.

Alternatif storage dan antrean untuk instalasi lain: Cloudflare R2 (`STORAGE_DRIVER=s3`) dan Upstash QStash (`QUEUE_DRIVER=qstash`).

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
  ├─► Webhook       Discord/Slack/Teams/JSON src/lib/webhooks.ts
  └─► AI API        Anthropic / OpenAI      src/lib/ai.ts
```

```
src/
  app/(app)/          halaman: beranda, laporan baru, editor, riwayat, template, koneksi, login
  app/api/            route API (connectors, destinations, reports, templates, jobs, files, locale)
  app/print/[id]/     tampilan cetak
  components/         shell, pemilih kartu, pemilih tujuan, ikon
  lib/connectors/     antarmuka Connector + implementasi Basecamp
  lib/report/         format netral laporan, renderer (HTML Basecamp, Markdown, chat, PDF), draf, diff, tujuan
  lib/webhooks.ts     pengirim Discord, Slack, Teams, JSON
  lib/repo/           akses database per tabel
worker/               worker screenshot + PDF
db/migrations/        skema SQL (tanpa stored procedure, trigger, atau foreign key)
```

### Menambah connector

Implementasikan antarmuka `Connector` di `src/lib/connectors/types.ts` (OAuth, `listBoards`, `listColumns`, `listCards`, `getCard`, `parseCardUrl`, `renderReport`, `postReport`, dan opsional `uploadImage`, `updateReport`, `setChecklist`, `supportsLogin`), lalu daftarkan di `src/lib/connectors/index.ts`. Halaman beranda, koneksi, login, pemilih kartu, dan tombol posting membaca daftar connector dan kemampuannya sendiri, jadi tidak perlu diubah. Contoh: connector tanpa `setChecklist` otomatis tidak menampilkan opsi centang subtask.

## Keamanan

- Token OAuth dienkripsi AES-256-GCM. Client Secret hanya dipakai di server.
- Password disimpan sebagai hash scrypt; percobaan login dibatasi 10 kali per 15 menit per email.
- Cookie sesi dan state OAuth ditandatangani HMAC, `HttpOnly`, `SameSite=Lax`, dan `Secure` di mode cloud.
- Serah-terima sesi antar domain memakai token acak sekali pakai (60 detik, terikat domain tujuan); parameter `next` hanya menerima path di aplikasi ini.
- Request yang mengubah data dari Origin lain ditolak.
- Gambar privat, hanya bisa dibuka lewat URL bertanda tangan yang kedaluwarsa dalam 1 jam.
- Jenis file upload dicek dari isinya (magic bytes), bukan dari nama file.
- Mode cloud menolak screenshot ke localhost dan alamat jaringan privat, di aplikasi dan di worker.
- Request ke Basecamp dibatasi 40 per 10 detik per akun, dengan retry dan backoff untuk 429/5xx.

## Lisensi

MIT (c) [Zee7X](https://github.com/Zee7X)
