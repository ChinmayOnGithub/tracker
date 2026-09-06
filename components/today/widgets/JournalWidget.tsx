"use client"

import React from 'react'
import { BookOpen } from 'lucide-react'
import { Card, CardHeader, CardBody, CardFooter, Button } from '@/design-system'

interface JournalWidgetProps {
  todayJournal: { mood: string | null; content: string } | null
  onOpenJournal: () => void
  gridW?: number
  gridH?: number
}

/**
 * JournalWidget
 * Rewritten to conform strictly to the design system's Card structure
 * and shared typography standards. Smartly adapts when h <= 2.
 */
export const JournalWidget: React.FC<JournalWidgetProps> = ({
  todayJournal,
  onOpenJournal,
  gridW: _gridW = 7,
  gridH = 3,
}) => {
  const stripHtml = (htmlStr: string) => {
    return htmlStr.replace(/<[^>]*>/g, '')
  }

  const isCompactHeight = gridH <= 2

  return (
    <Card className="hover:shadow-[var(--card-hover-shadow)] transition-all duration-200">
      <CardHeader className={`${isCompactHeight ? 'pb-1 mb-1' : 'pb-2 mb-2'} border-b border-[var(--color-border)]/40 flex items-center justify-between`}>
        <span className="text-[10px] uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-[var(--color-personal)]" />
          Journal Today
        </span>
        <div className="flex items-center gap-1.5">
          {todayJournal?.mood && (
            <span className="text-xs px-1.5 py-0.5 bg-[var(--color-accent)] rounded-md" title={`Mood: ${todayJournal.mood}`}>
              {todayJournal.mood}
            </span>
          )}
          {isCompactHeight && (
            <button
              onClick={onOpenJournal}
              className="text-[10px] font-bold text-[var(--color-primary)] hover:underline cursor-pointer ml-1"
            >
              {todayJournal ? 'Open' : 'Write'}
            </button>
          )}
        </div>
      </CardHeader>
      <CardBody className={`${isCompactHeight ? 'py-1 min-h-[30px]' : 'py-2 min-h-[60px]'} flex flex-col justify-center`}>
        {todayJournal ? (
          <p className={`text-xs text-[var(--color-text-main)] leading-relaxed italic ${isCompactHeight ? 'line-clamp-1' : 'line-clamp-3'}`}>
            &ldquo;{stripHtml(todayJournal.content)}&rdquo;
          </p>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)] italic text-center">
            No entry written for today yet.
          </p>
        )}
      </CardBody>
      {!isCompactHeight && (
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
      )}
    </Card>
  )
}
