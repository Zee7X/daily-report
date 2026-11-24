// FR-14: teks yang mirip password/token disamarkan sebelum masuk draf dan prompt AI.

export const MASK = '••••••'

const PATTERNS: RegExp[] = [
  // user:password@host di URL
  /(?<=[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+(?=@)/gi,
  // Authorization: Bearer xxx / Basic xxx
  /(?<=\b(?:bearer|basic)\s+)[A-Za-z0-9._~+/=-]{8,}/gi,
  // JWT
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  // Kunci dengan prefiks dikenal (AWS, GitHub, Slack, Stripe, OpenAI/Anthropic, Google)
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}\b/g,
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  // -----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
]

// "password: abc", "pwd = abc", "token: abc", "api key - abc", "kata sandi: abc"
const LABELLED =
  /(\b(?:password|passwd|pass|pwd|kata\s*sandi|sandi|secret|client[_\s-]?secret|token|access[_\s-]?token|api[_\s-]?key|apikey|private[_\s-]?key|pin|otp)\b\s*[:=]\s*|\b(?:password|pass|pwd|sandi|token|api[_\s-]?key)\b\s+(?:nya\s+)?(?:adalah|is)\s+)(["'`]?)([^\s"'`<,;]+)\2/gi

// String acak panjang (hex/base64) yang berdiri sendiri, mis. token tanpa label
const LONG_RANDOM = /\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{32,}={0,2}(?![A-Za-z0-9+/_-])/g

export function maskSecrets(text: string): string {
  if (!text) return text
  let out = text.replace(LABELLED, (_m, label: string, q: string) => `${label}${q}${MASK}${q}`)
  for (const re of PATTERNS) out = out.replace(re, MASK)
  out = out.replace(LONG_RANDOM, (m) => (looksLikePath(m) ? m : MASK))
  return out
}

function looksLikePath(s: string) {
  // Hindari menyamarkan path/slug panjang yang wajar (banyak "/" atau "-" berupa kata)
  return (s.match(/\//g)?.length ?? 0) >= 3 || /^[a-z]+(?:-[a-z]+){3,}$/.test(s)
}
