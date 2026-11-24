// Ikon garis tipis, dibuat inline agar tidak bergantung pada glyph font.
const base = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true }

export function ImageIcon() {
  return (
    <svg {...base}>
      <rect x="2" y="3" width="12" height="10" />
      <path d="M2 11l3.5-3.5 3 3L11 8l3 3" />
      <circle cx="10.5" cy="5.8" r="0.9" />
    </svg>
  )
}

export function PrintIcon() {
  return (
    <svg {...base}>
      <path d="M4.5 6V2.5h7V6" />
      <rect x="2" y="6" width="12" height="5.5" />
      <path d="M4.5 9.5h7v4h-7z" />
    </svg>
  )
}
