"use client"

import React from 'react'
import { BookOpen } from 'lucide-react'
import { Card, Button } from '@/design-system'

interface JournalWidgetProps {
  todayJournal: { mood: string | null; content: string } | null
  onOpenJournal: () => void
}

export const JournalWidget: React.FC<JournalWidgetProps> = ({
  todayJournal,
  onOpenJournal,
}) => {
  const stripHtml = (htmlStr: string) => {
    return htmlStr.replace(/<[^>]*>/g, '')
  }

  return (
    <Card className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3.5 hover:shadow-[var(--card-hover-shadow)] transition-all duration-200">
      <div className="flex items-center justify-between border-b border-[var(--color-border)]/50 pb-2">
        <span className="text-xs uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-[var(--color-personal)]" />
          Journal Today
        </span>
        {todayJournal?.mood && (
          <span className="text-sm p-1 bg-[var(--color-accent)] rounded-lg animate-bounce" title={`Mood: ${todayJournal.mood}`}>
            {todayJournal.mood}
          </span>
        )}
      </div>
      {todayJournal ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-text-main)] leading-relaxed line-clamp-3 italic">
            &ldquo;{stripHtml(todayJournal.content)}&rdquo;
          </p>
          <Button
            onClick={onOpenJournal}
            size="sm"
            className="w-full text-center"
          >
            Open Full Journal
          </Button>
        </div>
      ) : (
        <div className="space-y-2 text-center py-2">
          <p className="text-xs text-[var(--color-text-muted)] italic">No entry written for today yet.</p>
          <Button
            onClick={onOpenJournal}
            size="sm"
            className="w-full"
          >
            Write Entry
          </Button>
        </div>
      )}
    </Card>
  )
}
