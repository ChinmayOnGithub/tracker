"use client"

import React, { useState } from 'react'
import { Check } from 'lucide-react'
import { createLinkCollection, updateLinkCollection } from '@/app/actions/links'
import { LinkCollection } from '../LinkLibraryPanel'
import { Modal, Input, Button } from '@/design-system'

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingCollection ? 'Edit Collection' : 'New Collection'}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Collection Name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Travel ideas, Design inspirations"
          required
        />

        <div>
          <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-1.5">Collection Icon (Emoji)</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {['📁', '📚', '🎥', '💼', '💻', '🚀', '🎨', '🧠', '🏠', '🛒', '❤️'].map(em => (
              <Button
                key={em}
                type="button"
                variant={emoji === em ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setEmoji(em)}
                className="w-7 h-7 p-0 text-sm"
              >
                {em}
              </Button>
            ))}
          </div>
          <Input
            type="text"
            maxLength={4}
            placeholder="Or type any emoji..."
            value={emoji}
            onChange={e => setEmoji(e.target.value)}
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
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={loading}>
            {editingCollection ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
