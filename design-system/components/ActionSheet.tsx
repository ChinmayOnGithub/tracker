'use client'

import React from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './Sheet'

interface ActionSheetItem {
  id: string
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

interface ActionSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  actions: ActionSheetItem[]
}

export const ActionSheet: React.FC<ActionSheetProps> = ({
  isOpen,
  onClose,
  title,
  description,
  actions,
}) => {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-[var(--radius-xl)] pb-8">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex flex-col gap-2 mt-4">
          {actions.map((action) => (
            <button
              key={action.id}
              disabled={action.disabled}
              onClick={() => {
                action.onClick()
                onClose()
              }}
              className={[
                'w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-[var(--radius-md)] text-left transition-colors',
                action.danger
                  ? 'text-[var(--color-overdue)] hover:bg-[var(--color-overdue)]/10'
                  : 'text-[var(--color-text-main)] hover:bg-[var(--color-accent)]',
                action.disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {action.icon && <span className="w-5 h-5 flex items-center justify-center text-[var(--color-text-muted)] shrink-0">{action.icon}</span>}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
