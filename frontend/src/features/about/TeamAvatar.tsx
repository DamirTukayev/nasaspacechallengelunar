/** Decorative illustrations, deliberately not portraits of the participants. */
export function TeamAvatar({ initials, index }: { initials: string; index: number }) {
  const accent = ['var(--brand-primary)', '#526176', '#48668c', '#375b7d', '#64717d', '#354863'][
    index
  ]
  const tilted = index % 2 === 0 ? -5 : 5
  return (
    <svg viewBox="0 0 180 170" aria-hidden="true" focusable="false" className="about-avatar">
      <circle cx="90" cy="82" r="66" fill="#edf0f3" />
      <path
        d="M30 170v-25c0-27 22-48 49-48h22c27 0 49 21 49 48v25"
        fill="#f8f9fa"
        stroke="#a9b3bf"
        strokeWidth="2"
      />
      <path d="M49 127v43m82-43v43" stroke={accent} strokeWidth="11" />
      <path d="M65 111c10 12 40 12 50 0" fill="none" stroke={accent} strokeWidth="5" />
      <g transform={`rotate(${tilted} 90 69)`}>
        <rect
          x="38"
          y="52"
          width="18"
          height="35"
          rx="8"
          fill="#d7dee6"
          stroke="#9aa7b6"
          strokeWidth="2"
        />
        <rect
          x="124"
          y="52"
          width="18"
          height="35"
          rx="8"
          fill="#d7dee6"
          stroke="#9aa7b6"
          strokeWidth="2"
        />
        <ellipse cx="90" cy="65" rx="44" ry="48" fill="#fff" stroke="#a9b3bf" strokeWidth="2" />
        <path
          d="M57 63c0-22 14-35 33-35s33 13 33 35v9c0 20-14 32-33 32S57 92 57 72Z"
          fill="#18232f"
          stroke="#7c8c9d"
          strokeWidth="3"
        />
        <path
          d="M66 56c3-10 10-16 20-18"
          fill="none"
          stroke="#b6c6d5"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      <rect x="70" y="131" width="40" height="28" rx="4" fill="#e4e9ef" stroke="#b4bfcb" />
      <text
        x="90"
        y="150"
        textAnchor="middle"
        fontSize="13"
        fontFamily="system-ui, sans-serif"
        fontWeight="600"
        fill="#34475c"
      >
        {initials}
      </text>
    </svg>
  )
}
