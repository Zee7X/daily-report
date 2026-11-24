-- Bahasa default akun baru: Inggris (pengguna yang sudah memilih bahasa tidak berubah).
ALTER TABLE users ALTER COLUMN locale SET DEFAULT 'en';
