"use client"

import React, { useState } from 'react'
import { X, Check, Loader2 } from 'lucide-react'
import { createLinkCollection, updateLinkCollection } from '@/app/actions/links'
import { LinkCollection } from '../LinkLibraryPanel'

interface CollectionModalProps {
  isOpen: boolean
  onClose: () => void
  editingCollection: LinkCollection | null
  onSaved: (collection: LinkCollection, isNew: boolean) => void
}

const COLLECTION_COLORS = [
  '#6366f1', // Indigo
  '#3b82f6', // Blue
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#eab308', // Yellow
  '#f97316', // Orange
  '#ef4444', // Red
  '#ec4899', // Pink
  '#a855f7', // Purple
  '#64748b', // Slate
]

export const CollectionModal: React.FC<CollectionModalProps> = ({
  isOpen,
  onClose,
  editingCollection,
  onSaved,
}) => {
  const [name, setName] = useState(editingCollection ? editingCollection.name : '')
  const [color, setColor] = useState(editingCollection ? editingCollection.color : COLLECTION_COLORS[0])
  const [emoji, setEmoji] = useState(editingCollection ? (editingCollection.icon || '📁') : '📁')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)

    try {
      if (editingCollection) {
        const res = await updateLinkCollection(editingCollection.id, {
          name: name.trim(),
          color: color,
          icon: emoji || null
        })
        if (res.success && res.collection) {
          const updated: LinkCollection = {
            ...editingCollection,
            name: res.collection.name,
            color: res.collection.color,
            icon: res.collection.icon
          }
          onSaved(updated, false)
          onClose()
        }
      } else {
        const res = await createLinkCollection(name.trim(), color, emoji)
        if (res.success && res.collection) {
          const created: LinkCollection = {
            id: res.collection.id,
            name: res.collection.name,
            color: res.collection.color,
            icon: res.collection.icon,
            sortOrder: res.collection.sortOrder,
            links: []
          }
          onSaved(created, true)
          onClose()
        }
      }
    } catch (err) {
      console.error('Failed to save collection:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg shadow-xl w-full max-w-sm animate-fade-in">
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-main)]">
            {editingCollection ? 'Edit Collection' : 'New Collection'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-[var(--color-text-main)] cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-1.5">Collection Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Travel ideas, Design inspirations"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] focus:outline-hidden focus:border-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-1.5">Collection Icon (Emoji)</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {['📁', '📚', '🎥', '💼', '💻', '🚀', '🎨', '🧠', '🏠', '🛒', '❤️'].map(em => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmoji(em)}
                  className={`w-7 h-7 flex items-center justify-center rounded border transition-all text-sm cursor-pointer ${
                    emoji === em ? 'border-[var(--color-text-main)] bg-slate-100 dark:bg-zinc-800 scale-110' : 'border-[var(--color-border)] hover:bg-slate-50 dark:hover:bg-zinc-905'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
            <input
              type="text"
              maxLength={4}
              placeholder="Or type any emoji..."
              value={emoji}
              onChange={e => setEmoji(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] focus:outline-hidden focus:border-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-2">Accent Color</label>
            <div className="grid grid-cols-5 gap-2.5">
              {COLLECTION_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-full aspect-square rounded-md border transition-all cursor-pointer relative ${
                    color === c ? 'border-[var(--color-text-main)] scale-105' : 'border-transparent hover:scale-102'
                  }`}
                  style={{ backgroundColor: c }}
                >
                  {color === c && (
                    <Check size={11} className="absolute inset-0 m-auto text-white drop-shadow-sm font-bold" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-bold border border-[var(--color-border)] rounded-md hover:bg-slate-50 dark:hover:bg-zinc-900 text-[var(--color-text-main)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 bg-[var(--color-primary)] text-white text-xs font-bold rounded-md hover:opacity-90 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-3xs"
            >
              {loading && <Loader2 size={12} className="animate-spin" />}
              <span>{editingCollection ? 'Save' : 'Create'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
