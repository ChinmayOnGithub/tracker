"use client"

import React from 'react'
import { Keyboard, X } from 'lucide-react'

interface ShortcutsHelpModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ShortcutsHelpModal: React.FC<ShortcutsHelpModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg shadow-xl w-full max-w-sm animate-fade-in p-5">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3 mb-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-main)] flex items-center gap-1.5">
            <Keyboard size={14} />
            <span>Keyboard Shortcuts</span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-[var(--color-text-main)] cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs border-b border-[var(--color-border)]/30 pb-2">
            <span className="font-bold text-[var(--color-text-muted)]">Focus Search Bar</span>
            <kbd className="px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-zinc-800 text-[9px] font-mono shadow-3xs">Ctrl + K</kbd>
          </div>
          <div className="flex items-center justify-between text-xs border-b border-[var(--color-border)]/30 pb-2">
            <span className="font-bold text-[var(--color-text-muted)]">Focus Add Link Input</span>
            <kbd className="px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-zinc-800 text-[9px] font-mono shadow-3xs">Ctrl + V</kbd>
          </div>
          <div className="flex items-center justify-between text-xs border-b border-[var(--color-border)]/30 pb-2">
            <span className="font-bold text-[var(--color-text-muted)]">Toggle Shortcuts List</span>
            <kbd className="px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-zinc-800 text-[9px] font-mono shadow-3xs">Ctrl + ?</kbd>
          </div>
          <div className="flex items-center justify-between text-xs pb-1">
            <span className="font-bold text-[var(--color-text-muted)]">Dismiss Modals / Warnings</span>
            <kbd className="px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-zinc-800 text-[9px] font-mono shadow-3xs">Esc</kbd>
          </div>
        </div>
        <div className="pt-4 mt-4 border-t border-[var(--color-border)] flex justify-end">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-bold bg-[var(--color-primary)] text-white rounded-md hover:opacity-90 cursor-pointer shadow-3xs"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
