import type { ButtonHTMLAttributes } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost'
  size?: 'normal' | 'compact'
}

/** An action within the current screen. Navigation uses Link instead. */
export function Button({
  variant = 'outline',
  size = 'normal',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`ui-button ${className}`.trim()}
      data-ui-variant={variant}
      data-ui-size={size}
    />
  )
}
