import { useId } from 'react'

export function MoonLogo({ className = 'logo' }: { className?: string }) {
  const id = useId()
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="35%" cy="35%" r="70%">
          <stop offset="0" stopColor="#e9ecf2" />
          <stop offset="1" stopColor="#8a93a6" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="15" fill={`url(#${id})`} />
      <circle cx="14" cy="16" r="3" fill="#7a8396" opacity="0.6" />
      <circle cx="24" cy="25" r="4" fill="#7a8396" opacity="0.5" />
      <circle cx="25" cy="13" r="1.8" fill="#7a8396" opacity="0.5" />
    </svg>
  )
}
