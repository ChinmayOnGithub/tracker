"use client"

import React from 'react'
import { X, Download } from 'lucide-react'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  activeCollectionId: string | null
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  activeCollectionId,
}) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg shadow-xl w-full max-w-sm animate-fade-in">
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-main)]">Export Bookmarks</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-[var(--color-text-main)] cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-semibold leading-relaxed">
            Choose a format to export your link library. You can import Netscape HTML back into Chrome/Firefox or another Tracker instance.
          </p>
          <div className="grid grid-cols-1 gap-2">
            <a
              href={`/api/links/export?format=html${activeCollectionId ? `&collectionId=${activeCollectionId}` : ''}`}
              download
              onClick={onClose}
              className="w-full flex items-center justify-between p-3 border border-[var(--color-border)] hover:bg-slate-50 dark:hover:bg-zinc-900 rounded-lg text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider cursor-pointer shadow-3xs"
            >
              <span>HTML (Netscape/Chrome)</span>
              <Download size={14} className="text-indigo-500" />
            </a>
            <a
              href={`/api/links/export?format=json${activeCollectionId ? `&collectionId=${activeCollectionId}` : ''}`}
              download
              onClick={onClose}
              className="w-full flex items-center justify-between p-3 border border-[var(--color-border)] hover:bg-slate-50 dark:hover:bg-zinc-900 rounded-lg text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider cursor-pointer shadow-3xs"
            >
              <span>JSON Backup</span>
              <Download size={14} className="text-indigo-500" />
            </a>
            <a
              href={`/api/links/export?format=csv${activeCollectionId ? `&collectionId=${activeCollectionId}` : ''}`}
              download
              onClick={onClose}
              className="w-full flex items-center justify-between p-3 border border-[var(--color-border)] hover:bg-slate-50 dark:hover:bg-zinc-900 rounded-lg text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider cursor-pointer shadow-3xs"
            >
              <span>CSV Spreadsheet</span>
              <Download size={14} className="text-indigo-500" />
            </a>
          </div>
          <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-end">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-bold border border-[var(--color-border)] rounded-md hover:bg-slate-50 dark:hover:bg-zinc-900 text-[var(--color-text-main)] cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
