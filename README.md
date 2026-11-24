<p align="center">
  <img src="assets/logo.png" alt="Daily Report Logo" width="120" />
</p>

# Daily Report

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

Dengan Daily Report, pekerjaan setelah testing pindah ke satu halaman:

1. **Bahan**: pilih kartu Basecamp (deskripsi, step, komentar dibaca otomatis), dan/atau tempel catatan sendiri. Ringkasan hasil testing dari Claude bisa langsung ditempel di sini, tidak perlu dijadikan HTML dulu.
2. **Gambar**: upload screenshot hasil testing, atau ambil screenshot dari daftar URL. Mode lokal bisa memotret `localhost` (fitur yang belum di-deploy); mode cloud hanya URL publik, jadi screenshot localhost diupload.
3. **Draf**: bahan disusun ke bagian-bagian template (Selesai, Sedang dikerjakan, Kendala, Siap diuji QA). Dengan API key AI, kalimatnya dirapikan AI; tanpa API key, poin diambil apa adanya.
4. **Pilih**: centang poin dan gambar yang ikut, urutkan, tempel gambar ke poin. Yang tidak dicentang tidak terkirim.
5. **Kirim**: *Post ke Basecamp* (gambar jadi lampiran asli, subtask bisa dicentang), kirim ke webhook (Discord/Slack/Teams/n8n), atau salin untuk WhatsApp. PDF tetap ada sebagai cadangan.

Claude tetap dipakai untuk testing dan merangkum hasilnya; Daily Report mengambil alih bagian merapikan dan mengirim.

## Fitur

- **Sumber bahan**: kartu kanban (deskripsi, step, komentar) atau tulisan sendiri. Tanpa kanban, laporan tetap bisa dibuat penuh.
- **Kanban satu klik**: Basecamp, Trello, Jira, GitHub Issues, Linear, dan ClickUp. Token dienkripsi AES-256-GCM dan diperbarui otomatis. Disconnect menghapus token.
- **Pilih kartu** dengan menelusuri board → kolom → kartu, atau menempel URL kartu. Kartu sumber dan tujuan boleh berbeda.
- **AI satu klik**: "Connect OpenRouter" (Claude, GPT, Gemini, DeepSeek; biaya ke saldo pengguna sendiri), tempel API key Anthropic/OpenAI, atau hubungkan **9Router** / endpoint OpenAI-compatible lain (LiteLLM, Ollama, vLLM) dengan base URL. Tanpa AI, draf disusun dari step kartu dan catatanmu.
- **Penyamaran kredensial**: teks mirip password/token disamarkan sebelum masuk draf maupun prompt AI.
- **Editor**: centang bagian/poin/gambar (yang tidak dicentang tidak ikut), edit teks, ubah urutan, tempel gambar ke poin. Tersimpan otomatis.
- **Gambar**: upload PNG/JPG (maks. 10 MB) atau screenshot dari daftar URL (default 1440×900). Urutkan dengan drag; nomor "Gambar N" menyesuaikan otomatis.
- **Tujuan posting**, dipilih per laporan:
  - *Kartu kanban*: komentar dengan gambar sebagai lampiran (lihat tabel connector), opsional centang subtask. Posting ulang menawarkan *Update komentar lama* atau *Posting baru*.
  - *Webhook*: lihat tabel di bawah.
  - *Salin saja*: tanpa posting.
- **Format salin**: WhatsApp (`*tebal*`, bullet `•`), Slack (mrkdwn), Teams (rich text + teks biasa), HTML dengan gambar, Markdown, PDF, dan tampilan cetak.
- **Riwayat** laporan dengan status dan tautan. Diff draf awal vs versi terkirim disimpan untuk analisis pola edit.
- UI **Indonesia / English**, navigasi keyboard, kontras WCAG AA.

### AI lewat 9Router

[9Router](https://github.com/decolua/9router) menyediakan endpoint OpenAI-compatible (`/v1/chat/completions`) yang meneruskan ke langganan atau model gratis/murah. Di halaman Koneksi → AI → *Pakai API key sendiri* → **9Router / custom**:

1. Isi **Base URL**, mis. `http://localhost:20128/v1` (mode lokal) atau URL publik 9Router-mu (mode online).
2. Isi **API key** dari dashboard 9Router.
3. Klik **Muat model**, pilih model atau combo (mis. `kr/claude-sonnet-4.5`), lalu **Simpan & tes**.

Versi online (Vercel) tidak bisa membuka `localhost` di komputermu. Untuk memakai 9Router dari versi online, jalankan 9Router di server yang bisa diakses lewat https (VPS, Hugging Face Space, atau tunnel). Alamat localhost dan jaringan privat ditolak di mode cloud. Base URL dan API key disimpan terenkripsi; browser hanya melihat host dan 4 karakter terakhir key.

### Connector kanban

| Tool | Board → kolom → kartu | Gambar | Subtask yang bisa dicentang | Login | Token pribadi |
| --- | --- | --- | --- | --- | --- |
| Basecamp | project/card table → kolom → kartu | lampiran `<bc-attachment>` | step kartu | ya | tidak (hanya OAuth) |
| Trello | board → list → kartu | lampiran kartu | item checklist | – | ya |
| Jira Cloud | project → status → issue | lampiran issue (komentar ADF) | sub-task (transisi ke Done) | – | ya |
| GitHub Issues | repository → Open/Closed → issue | rujukan teks (API GitHub tidak bisa upload gambar) | task list `- [ ]` di issue | ya | ya |
| Linear | team → workflow state → issue | gambar tampil di komentar | sub-issue (pindah ke Completed) | – | ya |
| ClickUp | list → status → task | lampiran task | item checklist | – | ya |

Pengguna cukup klik **Connect**. Pemilik instalasi mendaftarkan aplikasi OAuth sekali per tool. Langkah, variabel environment, dan Redirect URI-nya tampil di halaman Koneksi (bagian *Cara mengaktifkan*) dan di `.env.example`.

**Token pribadi (tanpa OAuth di server).** Trello, Jira Cloud, GitHub, Linear, dan ClickUp juga bisa dihubungkan dengan token yang ditempel sendiri di halaman Koneksi (*Pakai token pribadi*), jadi tidak perlu `TRELLO_API_KEY`, `JIRA_*`, `GITHUB_*`, `LINEAR_*`, atau `CLICKUP_*` terisi. Yang ditempel: Trello = API key + token; Jira = URL situs `https://nama.atlassian.net` + email + API token; GitHub = personal access token (fine-grained dengan izin Issues read/write, atau classic dengan scope `repo`); Linear = personal API key; ClickUp = token pribadi `pk_…`. Token diperiksa ke tool dulu, disimpan terenkripsi, dan tidak pernah dikirim balik ke browser (hanya 4 karakter terakhir yang tampil). Koneksi token tidak bisa dipakai untuk login (login tetap lewat OAuth dengan email terverifikasi). Basecamp tidak punya token pribadi: admin situs perlu mendaftarkan integrasi Launchpad sekali.

### Webhook

**Discord** dan **Slack** bisa satu klik: pengguna memilih channel, lalu webhook dibuat otomatis (butuh `DISCORD_CLIENT_ID/SECRET` atau `SLACK_CLIENT_ID/SECRET`). Teams dan JSON tetap memakai URL webhook.

| Jenis | Cara mendapatkan URL (manual) | Gambar |
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
| `SIGNUP_ALLOWED_EMAILS` | `*` = siapa saja, atau email/`@domain` dipisah koma; kosong = hanya akun pertama |
| `ADMIN_EMAILS` | email admin dipisah koma; hanya admin yang melihat panduan pendaftaran OAuth di `/connect`. Kosong = akun tertua (pemilik) |
| `QUOTA_AI_PER_DAY`, `QUOTA_REPORTS_PER_DAY`, `QUOTA_JOBS_PER_HOUR`, `QUOTA_STORAGE_MB` | kuota per pengguna; default 30, 50, 60, 200 |
| `SINGLE_USER` | `true` = tanpa halaman login (hanya mode lokal) |
| `DATABASE_URL` | `mysql://user:pass@host:port/db` (MySQL 8 atau TiDB) |
| `DATABASE_SSL` | otomatis `true` untuk host `tidbcloud.com` |
| `STORAGE_DRIVER` | `local` (`STORAGE_PATH`), `vercel-blob` (store privat), atau `s3` (`S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) |
| `QUEUE_DRIVER` | `local` atau `qstash` (`QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`) |
| `JOBS_SECRET` | Bearer token bila worker/cron memanggil `POST /api/jobs/:type` langsung |
| `BROWSER_DRIVER` | `local-worker`, `remote-worker`, atau `none` |
| `BROWSER_WORKER_URL` / `BROWSER_WORKER_TOKEN` | alamat worker dan token (sama dengan `WORKER_TOKEN` di worker) |
| `BASECAMP_*` | Client ID/Secret, Redirect URI, User-Agent (wajib berisi kontak) |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` | AI bawaan instalasi: `anthropic` (default `claude-sonnet-5-5`), `openai` (`AI_MODEL` wajib), `openrouter`, atau `none`. Pengguna yang menghubungkan AI sendiri tidak memakai ini. |
| `TRELLO_API_KEY`, `GITHUB_*`, `JIRA_*`, `LINEAR_*`, `CLICKUP_*` | aktifkan connector kanban lain |
| `DISCORD_CLIENT_*`, `SLACK_CLIENT_*` | aktifkan webhook satu klik |
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
| `SIGNUP_ALLOWED_EMAILS` | `*` untuk semua orang, atau daftar email/`@domain`, mis. `rizick076@gmail.com,@kantor.com`; kosong = hanya akun pertama |
| `ADMIN_EMAILS` | opsional: email admin; kosong = akun tertua. Pengguna lain hanya melihat tombol Connect |
| `BASECAMP_CLIENT_ID`, `BASECAMP_CLIENT_SECRET` | dari Launchpad |
| `BASECAMP_USER_AGENT` | `Daily Report (email-kamu@example.com)` |
| `AI_PROVIDER`, `AI_API_KEY` | opsional |

Fungsi berjalan di region Singapura (`vercel.json`), dekat dengan TiDB `ap-southeast-1`, supaya perpindahan halaman cepat. Di Vercel, nilai default berikut sudah otomatis: `APP_MODE=cloud`, `STORAGE_DRIVER=vercel-blob`, `QUEUE_DRIVER=local` (job berjalan di fungsi yang sama lewat `after()`), `BROWSER_DRIVER=none`.

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
- Setelah login berhasil, sesi diserahkan ke `APP_URL` lewat token sekali pakai yang berlaku 60 detik, hanya sah untuk domain tujuan dan browser yang memulai login, dan hanya hash-nya yang disimpan.
- "Login with Basecamp" dan "Connect Basecamp" dimulai di domain lumelo; Basecamp mengembalikan ke callback di `AUTH_URL`, lalu alur diselesaikan kembali di domain lumelo.
- Domain login tidak menyimpan sesi sama sekali. Halaman aplikasi yang dibuka di domain `.vercel.app` dialihkan ke `APP_URL`.

Peringatan merah di domain baru biasanya salah satu dari dua hal: sertifikat HTTPS belum terbit (tunggu beberapa menit setelah DNS benar), atau Google Safe Browsing menandai domain baru yang punya halaman login sebagai phishing. Memindahkan semua form login ke domain `.vercel.app` mengurangi risiko yang kedua, tapi tidak menjaminnya. Bila tetap muncul, verifikasi domain di Google Search Console lalu minta peninjauan ulang.

### Screenshot dan PDF di cloud

Vercel tidak menjalankan browser, jadi di cloud screenshot diupload manual dan PDF dibuat lewat *Tampilan cetak → Save as PDF*. Untuk screenshot otomatis, deploy folder `worker/` (ada `Dockerfile`) ke Railway/Render/Fly dengan `WORKER_TOKEN` dan `BLOCK_PRIVATE_NETWORKS=true`, lalu isi `BROWSER_DRIVER=remote-worker`, `BROWSER_WORKER_URL`, dan `BROWSER_WORKER_TOKEN` di Vercel.

Alternatif storage dan antrean untuk instalasi lain: Cloudflare R2 (`STORAGE_DRIVER=s3`) dan Upstash QStash (`QUEUE_DRIVER=qstash`).

### Keep warm (opsional)

Fungsi Vercel dibekukan saat tidak ada traffic, dan gateway TiDB Cloud Starter memutus koneksi yang idle sehingga cluster perlu "bangun" lagi. Akibatnya request pertama setelah lama sepi bisa lambat atau gagal. Workflow `.github/workflows/keep-warm.yml` memanggil URL kesehatan dan menjalankan `SELECT 1` ke database tiap 10 menit supaya keduanya tetap hangat. Database aplikasi lain (di cluster yang sama atau berbeda) bisa ikut ditambahkan.

Isi dua secret di GitHub → *Settings → Secrets and variables → Actions → New repository secret*. Keduanya boleh dikosongkan; langkah yang secret-nya kosong dilewati.

| Secret | Isi |
| --- | --- |
| `KEEPWARM_URLS` | URL `https`, satu per baris atau dipisah koma, mis. `https://daily-report.lumelo.my.id/api/health` |
| `KEEPWARM_DATABASE_URLS` | satu URL per **cluster**, satu per baris, format `mysql://user:password@host:4000` (tanpa nama database; password di-URL-encode) |

Untuk database, buat user khusus per cluster yang hanya perlu login dan menjalankan `SELECT 1`, bukan `root` cluster:

```sql
CREATE USER '<prefix>.keepwarm'@'%' IDENTIFIED BY '<password-panjang-acak>';
GRANT USAGE ON *.* TO '<prefix>.keepwarm'@'%';
```

TiDB Starter tidur per cluster, bukan per database, jadi satu baris per cluster sudah cukup: database lain di cluster yang sama (mis. aplikasi lain) ikut hangat bersamaan. URL tanpa nama database sengaja dipakai karena user di atas tidak punya hak ke database mana pun, dan menyambung ke database default yang tidak boleh diakses gagal dengan `ER_DBACCESS_DENIED_ERROR`.

Log run hanya menampilkan host, status, dan waktu respons (`host OK 123ms`); password di-mask. Run merah bila semua URL gagal atau ada database yang tidak bisa dihubungi. Jalankan manual lewat tab *Actions → Keep warm → Run workflow*.

Catatan:

- Cron GitHub bisa terlambat beberapa menit, jadi jedanya tidak persis 10 menit.
- Workflow terjadwal di repo publik dinonaktifkan otomatis setelah 60 hari tanpa aktivitas di repo. Aktifkan lagi di tab *Actions*.
- Vercel Cron di paket Hobby hanya jalan sekali sehari, jadi tidak dipakai.
- Biayanya kecil: sekitar 4,3 ribu `SELECT 1` per database per bulan, jauh di bawah kuota gratis 50 juta RU/bulan.
- Alternatif tanpa GitHub: cron-job.org yang memanggil URL kesehatan yang sama tiap 5 sampai 10 menit.

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

## Keamanan dan privasi

**Pemisahan data antar pengguna**
- Setiap laporan, gambar, template, webhook, koneksi Basecamp, dan job terikat ke satu pengguna. Semua route API memeriksa sesi, lalu query database selalu memakai `user_id` pengguna itu. Pengguna lain mendapat 404, bukan data.
- Token Basecamp, URL webhook, dan secret HMAC disimpan terenkripsi AES-256-GCM dan hanya dibuka di server saat dipakai. Tidak ada endpoint yang mengirimkannya ke browser; daftar webhook hanya menampilkan host-nya.
- Gambar privat. URL gambar ditandatangani dan kedaluwarsa dalam 1 jam, dan tetap butuh sesi pemilik laporan, jadi URL yang tersebar tidak bisa dibuka orang lain.
- Teks mirip password/token dari kartu Basecamp disamarkan sebelum masuk draf maupun prompt AI.
- Di mode cloud, pesan error internal tidak dikirim ke browser.

**Login dan sesi**
- Password disimpan sebagai hash scrypt.
- Cookie sesi ditandatangani HMAC, `HttpOnly`, `SameSite=Lax`, dan `Secure` di mode cloud. Logout membatalkan semua sesi pengguna di semua perangkat.
- Mode tanpa login (`SINGLE_USER`) tidak pernah aktif di Vercel.
- Domain login (`AUTH_URL`) tidak menyimpan sesi. Hasil login diserahkan ke `APP_URL` lewat token acak sekali pakai (60 detik, terikat domain tujuan) yang juga harus cocok dengan cookie nonce di browser yang memulai login. Link serah-terima milik orang lain tidak bisa dipakai.
- OAuth Basecamp menyimpan state di server. Hasilnya baru dipakai di browser yang memulai alur, dan untuk "Connect" hanya oleh pengguna yang sama, jadi token Basecamp tidak bisa "dibelokkan" ke akun lain.
- Email belum diverifikasi saat daftar dengan password (tidak ada SMTP). Bila pemilik asli email itu kemudian "Login with Basecamp", password yang dibuat orang lain dihapus dan semua sesinya dibatalkan. Untuk `SIGNUP_ALLOWED_EMAILS` berbasis domain (`@kantor.com`), sarankan pengguna memakai "Login with Basecamp".

**Pendaftaran terbuka (`SIGNUP_ALLOWED_EMAILS=*`)**
- Maksimal 5 pendaftaran per IP per hari, plus field jebakan untuk bot.
- Login gagal dibatasi 10 kali per email dan 30 kali per IP dalam 15 menit, berlaku di semua instance (dicatat di database sebagai HMAC, bukan IP/email asli).
- Kuota per pengguna: 30 draf AI per hari (setelah itu draf disusun tanpa AI), 50 laporan per hari, 60 posting/screenshot per jam, 10 tes webhook per jam, 200 MB gambar, 50 gambar per laporan. Semua bisa diubah lewat `QUOTA_*`.

**Lainnya**
- Request yang mengubah data dari Origin lain ditolak.
- Jenis file upload dicek dari isinya (magic bytes), bukan dari nama file.
- Mode cloud menolak screenshot dan webhook ke localhost atau jaringan privat.
- Request ke Basecamp dibatasi 40 per 10 detik per akun, dengan retry dan backoff untuk 429/5xx.
- Bila AI diaktifkan, isi bahan laporan (setelah penyamaran) dikirim ke provider AI yang dipilih. API key AI pengguna disimpan terenkripsi dan tidak pernah dikirim ke browser (hanya 4 karakter terakhir).
- Semua koneksi (kanban, Discord/Slack, OpenRouter) memakai alur yang sama: state di server, nonce di browser pemulai, dan kunci sekali pakai dari callback, jadi token tidak bisa diarahkan ke akun lain. OpenRouter memakai PKCE.

## Lisensi

MIT (c) [Zee7X](https://github.com/Zee7X)
