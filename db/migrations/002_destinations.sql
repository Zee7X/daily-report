-- Tujuan webhook (Discord, Slack, Microsoft Teams, JSON umum untuk n8n/Zapier/Make).
-- URL webhook berisi token, jadi disimpan terenkripsi seperti token OAuth.

CREATE TABLE IF NOT EXISTS destinations (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id     VARCHAR(36)  NOT NULL,
  kind        VARCHAR(16)  NOT NULL,
  name        VARCHAR(255) NOT NULL,
  url         TEXT         NOT NULL,
  secret      TEXT         NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_destinations_user (user_id)
);
