-- Kompatibel MySQL 8 dan TiDB: tanpa stored procedure, trigger, atau foreign key.
-- Relasi dan penghapusan berantai ditangani di kode aplikasi.

CREATE TABLE IF NOT EXISTS users (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  email       VARCHAR(255) NOT NULL,
  name        VARCHAR(255) NOT NULL DEFAULT '',
  locale      VARCHAR(8)   NOT NULL DEFAULT 'id',
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_email (email)
);

CREATE TABLE IF NOT EXISTS connections (
  id             VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id        VARCHAR(36)  NOT NULL,
  provider       VARCHAR(32)  NOT NULL,
  account_id     VARCHAR(64)  NOT NULL,
  account_name   VARCHAR(255) NOT NULL DEFAULT '',
  access_token   TEXT         NOT NULL,
  refresh_token  TEXT         NULL,
  expires_at     DATETIME(3)  NULL,
  meta           JSON         NULL,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_connections_user_provider (user_id, provider),
  KEY idx_connections_provider_account (provider, account_id)
);

CREATE TABLE IF NOT EXISTS templates (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id     VARCHAR(36)  NOT NULL,
  name        VARCHAR(255) NOT NULL,
  kind        VARCHAR(32)  NOT NULL DEFAULT 'custom',
  sections    JSON         NOT NULL,
  rules       JSON         NOT NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_templates_user (user_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id           VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id      VARCHAR(36)  NOT NULL,
  template_id  VARCHAR(36)  NULL,
  title        VARCHAR(255) NOT NULL,
  body         JSON         NOT NULL,
  status       VARCHAR(16)  NOT NULL DEFAULT 'draft',
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_reports_user_created (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS report_sources (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  report_id  VARCHAR(36)  NOT NULL,
  provider   VARCHAR(32)  NOT NULL,
  ref_type   VARCHAR(32)  NOT NULL,
  ref_id     VARCHAR(128) NOT NULL,
  url        TEXT         NULL,
  title      VARCHAR(500) NOT NULL DEFAULT '',
  KEY idx_report_sources_report (report_id)
);

CREATE TABLE IF NOT EXISTS report_images (
  id           VARCHAR(36)  NOT NULL PRIMARY KEY,
  report_id    VARCHAR(36)  NOT NULL,
  position     INT          NOT NULL,
  caption      VARCHAR(500) NOT NULL DEFAULT '',
  storage_key  VARCHAR(500) NOT NULL,
  mime         VARCHAR(64)  NOT NULL,
  byte_size    INT          NOT NULL,
  origin       VARCHAR(16)  NOT NULL,
  source_url   TEXT         NULL,
  selected     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_report_images_report (report_id, position)
);

CREATE TABLE IF NOT EXISTS report_targets (
  id                 VARCHAR(36)  NOT NULL PRIMARY KEY,
  report_id          VARCHAR(36)  NOT NULL,
  provider           VARCHAR(32)  NOT NULL,
  card_id            VARCHAR(128) NOT NULL,
  card_url           TEXT         NULL,
  card_title         VARCHAR(500) NOT NULL DEFAULT '',
  posted_comment_id  VARCHAR(128) NULL,
  posted_url         TEXT         NULL,
  posted_at          DATETIME(3)  NULL,
  last_post_job_id   VARCHAR(36)  NULL,
  UNIQUE KEY uq_report_targets_report_provider (report_id, provider)
);

CREATE TABLE IF NOT EXISTS jobs (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id     VARCHAR(36)  NOT NULL,
  report_id   VARCHAR(36)  NULL,
  type        VARCHAR(16)  NOT NULL,
  payload     JSON         NOT NULL,
  status      VARCHAR(16)  NOT NULL DEFAULT 'queued',
  attempts    INT          NOT NULL DEFAULT 0,
  error       TEXT         NULL,
  result      JSON         NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_jobs_report (report_id, created_at),
  KEY idx_jobs_status (status)
);

CREATE TABLE IF NOT EXISTS edit_logs (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  report_id   VARCHAR(36)  NOT NULL,
  draft_body  JSON         NOT NULL,
  final_body  JSON         NULL,
  diff        JSON         NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_edit_logs_report (report_id)
);
