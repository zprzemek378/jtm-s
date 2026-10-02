import { useEffect, useId, useRef, type ReactNode } from 'react'

import styles from './Checkbox.module.scss'

type CheckboxProps = {
  checked: boolean
  /** Indeterminate state — only some of the child items are selected. */
  indeterminate?: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  /** Renders the label in bold (e.g. for parent nodes in a tree). */
  strong?: boolean
  disabled?: boolean
  className?: string
}

export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  strong = false,
  disabled = false,
  className,
}: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => {
    if (inputRef.current) {
      // The indeterminate state cannot be set from JSX — only on the DOM element.
      inputRef.current.indeterminate = indeterminate && !checked
    }
  }, [checked, indeterminate])

  const classNames = [
    styles.wrapper,
    strong ? styles.strong : null,
    disabled ? styles.disabled : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <label className={classNames} htmlFor={id}>
      <input
        ref={inputRef}
        id={id}
        type="checkbox"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.label}>{label}</span>
    </label>
  )
}
