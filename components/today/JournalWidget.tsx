"use client"

import React from 'react'
import { BookOpen } from 'lucide-react'
import { Card, CardHeader, CardBody, CardFooter, Button } from '@/design-system'

interface JournalWidgetProps {
  todayJournal: { mood: string | null; content: string } | null
  onOpenJournal: () => void
}

/**
 * JournalWidget
 * Rewritten to conform strictly to the design system's Card structure
 * and shared typography standards.
 */
export const JournalWidget: React.FC<JournalWidgetProps> = ({
  todayJournal,
  onOpenJournal,
}) => {
  const stripHtml = (htmlStr: string) => {
    return htmlStr.replace(/<[^>]*>/g, '')
  }

  return (
    <Card className="hover:shadow-[var(--card-hover-shadow)] transition-all duration-200">
      <CardHeader className="pb-2 border-b border-[var(--color-border)]/40 mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-[var(--color-personal)]" />
          Journal Today
        </span>
        {todayJournal?.mood && (
          <span className="text-sm p-1 bg-[var(--color-accent)] rounded-lg animate-pulse" title={`Mood: ${todayJournal.mood}`}>
            {todayJournal.mood}
          </span>
        )}
      </CardHeader>
      <CardBody className="py-2 min-h-[60px] flex flex-col justify-center">
        {todayJournal ? (
          <p className="text-xs text-[var(--color-text-main)] leading-relaxed italic line-clamp-3">
            &ldquo;{stripHtml(todayJournal.content)}&rdquo;
          </p>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)] italic text-center">
            No entry written for today yet.
          </p>
        )}
      </CardBody>
      <CardFooter className="pt-2 border-t border-[var(--color-border)]/40 mt-2">
        <Button
          onClick={onOpenJournal}
          size="sm"
          variant="outline"
          className="w-full text-xs font-semibold"
        >
          {todayJournal ? 'Open Full Journal' : 'Write Entry'}
        </Button>
      </CardFooter>
    </Card>
  )
}
