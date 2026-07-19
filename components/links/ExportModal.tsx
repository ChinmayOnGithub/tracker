"use client"

import React from 'react'
import { Download } from 'lucide-react'
import { Modal, Button } from '@/design-system'

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
    <Modal isOpen={isOpen} onClose={onClose} title="Export Bookmarks">
      <div className="space-y-4">
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
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
