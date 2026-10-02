import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

import styles from './Input.module.scss'

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> & {
  /** Visible label; pass `hideLabel` to keep it for screen readers only. */
  label?: ReactNode
  hideLabel?: boolean
  /** Explanation shown under the field. */
  hint?: ReactNode
  /** Replaces the hint and marks the field as invalid. */
  error?: ReactNode
}

export function Input({
  label,
  hideLabel = false,
  hint,
  error,
  className,
  id,
  ...rest
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const describedById = `${inputId}-description`
  const description = error ?? hint

  return (
    <div className={className ? `${styles.field} ${className}` : styles.field}>
      {label ? (
        <label className={hideLabel ? styles.labelHidden : styles.label} htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className={error ? `${styles.input} ${styles.invalid}` : styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={description ? describedById : undefined}
        {...rest}
      />
      {description ? (
        <p id={describedById} className={error ? styles.error : styles.hint}>
          {description}
        </p>
      ) : null}
    </div>
  )
}
