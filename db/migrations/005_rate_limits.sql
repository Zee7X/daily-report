-- Pencatat kejadian untuk pembatas laju dan kuota per pengguna/IP (login gagal, pendaftaran, draf AI,
-- job, tes webhook). Disimpan di database agar berlaku di semua instance serverless.
-- Kunci disimpan sebagai HMAC, jadi alamat IP dan email tidak tersimpan dalam bentuk asli.

CREATE TABLE IF NOT EXISTS rate_events (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  bucket      VARCHAR(32)  NOT NULL,
  key_hash    CHAR(64)     NOT NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_rate_events_lookup (bucket, key_hash, created_at),
  KEY idx_rate_events_created (created_at)
);
