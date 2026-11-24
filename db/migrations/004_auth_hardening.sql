-- Pengerasan autentikasi:
-- - session_version: logout atau pemulihan akun membatalkan semua sesi lama pengguna.
-- - email_verified: akun dari "Login with Basecamp" terbukti memiliki email itu; akun password belum.
-- - nonce pada serah-terima sesi dan state OAuth: token hanya bisa dipakai di browser yang memulai alurnya.
-- - completion_hash: kunci sekali pakai yang hanya diterima browser yang menyetujui di penyedia OAuth.
--   Langkah "complete" butuh keduanya, jadi alur yang dimulai satu orang tidak bisa diselesaikan orang lain.

ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN session_version INT NOT NULL DEFAULT 0;
ALTER TABLE auth_handoffs ADD COLUMN nonce_hash CHAR(64) NULL;

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash    CHAR(64)     NOT NULL PRIMARY KEY,
  provider      VARCHAR(32)  NOT NULL,
  intent        VARCHAR(16)  NOT NULL,
  user_id       VARCHAR(36)  NULL,
  nonce_hash    CHAR(64)     NOT NULL,
  return_base   VARCHAR(255) NOT NULL,
  next_path     VARCHAR(500) NOT NULL DEFAULT '/',
  result        TEXT         NULL,
  completion_hash CHAR(64)   NULL,
  expires_at    DATETIME(3)  NOT NULL,
  used_at       DATETIME(3)  NULL,
  completed_at  DATETIME(3)  NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_oauth_states_expires (expires_at)
);
