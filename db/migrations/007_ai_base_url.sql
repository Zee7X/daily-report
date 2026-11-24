-- AI lewat endpoint OpenAI-compatible milik pengguna (mis. 9Router, LiteLLM, Ollama, vLLM).
ALTER TABLE ai_settings ADD COLUMN base_url VARCHAR(500) NULL;
