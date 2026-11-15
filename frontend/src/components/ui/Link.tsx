import type { AnchorHTMLAttributes } from 'react'

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: 'text' | 'nav' | 'primary' | 'outline'
  size?: 'normal' | 'compact'
  external?: boolean
}

/** A genuine link: supports browser Back, copying the address and opening another tab. */
export function Link({
  variant = 'text',
  size = 'normal',
  external = false,
  className = '',
  children,
  target,
  rel,
  ...props
}: LinkProps) {
  const classes = [
    'ui-link',
    (variant === 'primary' || variant === 'outline') && 'ui-button',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <a
      {...props}
      className={classes}
      data-ui-variant={variant}
      data-ui-size={size}
      target={external ? '_blank' : target}
      rel={external ? `${rel ?? ''} noopener noreferrer`.trim() : rel}
    >
      {children}
      {external && (
        <span className="ui-external-mark" aria-hidden="true">
          ↗
        </span>
      )}
    </a>
  )
}
