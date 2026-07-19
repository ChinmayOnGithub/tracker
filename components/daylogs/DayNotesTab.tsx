"use client"

import React, { useState } from 'react'
import { Edit2, Trash2 } from 'lucide-react'
import { Input, Textarea, Button } from '@/design-system'
import { createNote, updateNote, deleteNote } from '@/app/actions/note'
import { useRouter } from 'next/navigation'

interface Note {
  id: string
  title: string | null
  content: string
  createdAt: string | Date
  updatedAt: string | Date
}

interface DayNotesTabProps {
  note: Note | null
  dateStr: string
}

export const DayNotesTab: React.FC<DayNotesTabProps> = ({ note, dateStr }) => {
  const router = useRouter()
  const [title, setTitle] = useState(note?.title || '')
  const [content, setContent] = useState(note?.content || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(!note)

  const handleSave = async () => {
    if (!content.trim()) return
    setIsSaving(true)
    try {
      if (note) {
        await updateNote(note.id, content.trim(), title.trim() || null)
        setIsEditing(false)
      } else {
        await createNote(dateStr, content.trim(), title.trim() || null)
        setIsEditing(false)
      }
      router.refresh()
    } catch (err) {
      console.error('Failed to save note:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!note) return
    if (confirm('Are you sure you want to delete this note?')) {
      setIsSaving(true)
      try {
        await deleteNote(note.id)
        setTitle('')
        setContent('')
        setIsEditing(true)
        router.refresh()
      } catch (err) {
        console.error('Failed to delete note:', err)
      } finally {
        setIsSaving(false)
      }
    }
  }

  return (
    <div className="space-y-4">
      {isEditing ? (
        <div className="space-y-4">
          <Input
            label="Note Title (Optional)"
            placeholder="e.g. Brainstorming session"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          <Textarea
            label="Content *"
            placeholder="Write your note here..."
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={8}
          />
          <div className="flex justify-end gap-2">
            {note && (
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </Button>
            )}
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !content.trim()}
              isLoading={isSaving}
            >
              Save Note
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 dark:bg-zinc-955 border border-slate-200 dark:border-zinc-800 p-5 rounded-xl space-y-4 shadow-xs">
          <div className="flex justify-between items-start border-b border-slate-200 dark:border-zinc-900 pb-3">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                {note?.title || 'Daily Freeform Note'}
              </h3>
              <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">Saved standalone note</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 bg-slate-100 hover:bg-slate-205 dark:bg-zinc-900 dark:hover:bg-zinc-850 border border-slate-200 dark:border-zinc-850 rounded text-slate-650 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white cursor-pointer"
                title="Edit Note"
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={handleDelete}
                className="p-1.5 bg-slate-100 hover:bg-slate-205 dark:bg-zinc-900 dark:hover:bg-zinc-850 border border-slate-200 dark:border-zinc-850 rounded text-slate-650 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-450 cursor-pointer"
                title="Delete Note"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <p className="text-slate-800 dark:text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed">
            {note?.content}
          </p>
        </div>
      )}
    </div>
  )
}
