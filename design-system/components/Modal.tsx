import React, { useEffect } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md'
}) => {
  // Capture escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      // Block body scrolling when modal is active
      document.body.style.overflow = 'hidden'
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizes = {
    sm: 'max-w-md',
    md: 'w-[90vw] max-w-xl',
    lg: 'w-[90vw] max-w-3xl'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay Background */}
      <div
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/70 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Modal Dialog Container */}
      <div className={`relative w-full ${sizes[size]} bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden z-10 animate-in fade-in zoom-in-[0.98] slide-in-from-bottom-4 duration-300 ease-out`}>
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between gap-4">
          <h3 className="text-base font-semibold text-[var(--color-text-main)]">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-accent)] hover:text-[var(--color-text-main)] transition-colors duration-150 focus:outline-none"
            aria-label="Close dialog"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 text-sm text-[var(--color-text-main)]">
          {children}
        </div>
      </div>
    </div>
  )
}
