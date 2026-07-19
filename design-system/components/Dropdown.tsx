'use client'

import React, { useRef, useState, useEffect, useId } from 'react'

export interface DropdownItem {
  id: string
  label: string
  icon?: React.ReactNode
  description?: string
  disabled?: boolean
  danger?: boolean
  separator?: false
}

export interface DropdownSeparator {
  separator: true
  id: string
}

export type DropdownOption = DropdownItem | DropdownSeparator

interface DropdownProps {
  trigger: React.ReactNode
  items: DropdownOption[]
  align?: 'left' | 'right'
  width?: 'sm' | 'md' | 'lg'
  className?: string
}

const widthMap = { sm: 'w-40', md: 'w-52', lg: 'w-64' }

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  items,
  align = 'left',
  width = 'md',
  className = '',
}) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuId = useId()

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', handler)
    }
  }, [open])

  const alignClass = align === 'right' ? 'right-0' : 'left-0'

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      {/* Trigger wrapper */}
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(v => !v)}
      >
        {trigger}
      </div>

      {/* Menu */}
      {open && (
        <div
          id={menuId}
          role="menu"
          className={`
            absolute z-50 mt-1.5 ${alignClass} ${widthMap[width]}
            bg-[var(--color-bg-surface)]
            border border-[var(--color-border)]
            rounded-[var(--radius-lg)]
            shadow-[var(--card-shadow)]
            py-1
            animate-in fade-in-0 zoom-in-95 slide-in-from-top-2
            duration-[var(--motion-duration-fast)]
          `}
        >
          {items.map((item) => {
            if ('separator' in item && item.separator) {
              return (
                <div
                  key={item.id}
                  role="separator"
                  className="my-1 border-t border-[var(--color-border)]"
                />
              )
            }

            const opt = item as DropdownItem
            return (
              <button
                key={opt.id}
                role="menuitem"
                disabled={opt.disabled}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left
                  transition-colors duration-[var(--motion-duration-fast)]
                  ${opt.danger
                    ? 'text-[var(--color-overdue)] hover:bg-[var(--color-overdue)]/10'
                    : 'text-[var(--color-text-main)] hover:bg-[var(--color-accent)]'}
                  ${opt.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                `}
                onClick={() => setOpen(false)}
              >
                {opt.icon && (
                  <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-[var(--color-text-muted)]">
                    {opt.icon}
                  </span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-medium">{opt.label}</span>
                  {opt.description && (
                    <span className="block truncate text-xs text-[var(--color-text-muted)]">
                      {opt.description}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
