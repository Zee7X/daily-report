-- Login email + password (tanpa SMTP) dan serah-terima sesi antar domain.
-- Halaman login & OAuth bisa berjalan di AUTH_URL (mis. *.vercel.app), lalu sesi diserahkan
-- ke APP_URL (domain sendiri) lewat token sekali pakai yang berlaku 60 detik.

ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL;

CREATE TABLE IF NOT EXISTS auth_handoffs (
  token_hash  CHAR(64)     NOT NULL PRIMARY KEY,
  user_id     VARCHAR(36)  NOT NULL,
  audience    VARCHAR(255) NOT NULL,
  expires_at  DATETIME(3)  NOT NULL,
  used_at     DATETIME(3)  NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_auth_handoffs_expires (expires_at)
);
