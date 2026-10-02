import type { ButtonHTMLAttributes } from 'react'

import { ButtonVariant } from './buttonVariant'
import styles from './Button.module.scss'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  small?: boolean
  /** Fills the width of its container — used for stacked choices. */
  block?: boolean
  iconOnly?: boolean
  /** Bigger hit area for the controls used mid-round. */
  large?: boolean
  /** Highlights the button as the current choice (e.g. in the language switcher). */
  active?: boolean
}

export function Button({
  variant = ButtonVariant.Secondary,
  small = false,
  block = false,
  iconOnly = false,
  large = false,
  active = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classNames = [
    styles.button,
    styles[variant],
    active ? styles.active : null,
    small ? styles.small : null,
    large ? styles.large : null,
    block ? styles.block : null,
    iconOnly ? styles.iconOnly : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <button type={type} className={classNames} {...rest} />
}
