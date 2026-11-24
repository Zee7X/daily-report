-- Integrasi satu klik: AI per pengguna (OpenRouter OAuth atau API key sendiri), PKCE untuk OAuth,
-- dan ID kartu yang lebih panjang untuk connector baru (Trello, Jira, GitHub, Linear, ClickUp).

CREATE TABLE IF NOT EXISTS ai_settings (
  user_id     VARCHAR(36)  NOT NULL PRIMARY KEY,
  provider    VARCHAR(16)  NOT NULL,
  api_key     TEXT         NOT NULL,
  model       VARCHAR(128) NOT NULL DEFAULT '',
  label       VARCHAR(255) NOT NULL DEFAULT '',
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

ALTER TABLE oauth_states ADD COLUMN pkce_verifier TEXT NULL;

ALTER TABLE report_targets MODIFY card_id VARCHAR(255) NOT NULL;
ALTER TABLE report_targets MODIFY posted_comment_id VARCHAR(255) NULL;
ALTER TABLE report_sources MODIFY ref_id VARCHAR(255) NOT NULL;
ALTER TABLE connections MODIFY account_id VARCHAR(128) NOT NULL;
