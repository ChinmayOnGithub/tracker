"use client"

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store/store'
import {
  Search, ArrowLeft, X, BookOpen, FileText, CheckSquare,
  Link2, Folder, Scale, Briefcase, Settings, ExternalLink,
  ChevronRight, AlertCircle, Sparkles
} from 'lucide-react'
import { MasterSearchEngine, SearchResult, SearchCategory } from '@/lib/search/MasterSearchEngine'

export interface MobileSearchModalProps {
  isOpen: boolean
  onClose: () => void
}

const CATEGORY_TABS: { id: SearchCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'journal', label: 'Journal' },
  { id: 'note', label: 'Notes' },
  { id: 'activity', label: 'Activities' },
  { id: 'link', label: 'Links' },
  { id: 'document', label: 'Docs & Vault' },
  { id: 'weight', label: 'Weight' },
  { id: 'leave', label: 'Time Off' },
  { id: 'settings', label: 'Settings' },
]

export const MobileSearchModal: React.FC<MobileSearchModalProps> = ({ isOpen, onClose }) => {
  const router = useRouter()
  const { state, setActiveJournalDateAction } = useStore()
  const [mounted, setMounted] = useState(false)
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  // Prevent React #418 hydration mismatch — modal renders dynamic client-only state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  // Auto focus input on open and lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
      return () => {
        clearTimeout(timer)
        document.body.style.overflow = ''
      }
    }
  }, [isOpen])

  // Escape key closes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  const results = useMemo(() => {
    if (!query.trim()) return []
    return MasterSearchEngine.search(query, state, activeCategory)
  }, [query, state, activeCategory])

  if (!isOpen || !mounted) return null


  const handleSelectResult = (res: SearchResult) => {
    if (res.payload?.externalUrl && (res.payload.externalUrl.startsWith('http://') || res.payload.externalUrl.startsWith('https://'))) {
      window.open(res.payload.externalUrl, '_blank', 'noopener,noreferrer')
    } else if (res.href) {
      if (res.type === 'journal' && res.payload?.date) {
        setActiveJournalDateAction(res.payload.date)
      }
      router.push(res.href)
    }
    onClose()
  }

  const getResultIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'journal':
        return <BookOpen className="w-4 h-4 text-teal-500 shrink-0" />
      case 'note':
        return <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
      case 'activity':
        return <CheckSquare className="w-4 h-4 text-amber-500 shrink-0" />
      case 'link':
        return <Link2 className="w-4 h-4 text-cyan-500 shrink-0" />
      case 'document':
        return <Folder className="w-4 h-4 text-rose-500 shrink-0" />
      case 'weight':
        return <Scale className="w-4 h-4 text-indigo-500 shrink-0" />
      case 'leave':
        return <Briefcase className="w-4 h-4 text-purple-500 shrink-0" />
      case 'settings':
        return <Settings className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
      default:
        return <Search className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg-base)] text-[var(--color-text-main)] animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Universal Mobile Search"
    >
      {/* ── Top Header Search Control Bar (44-48px height minimums) ── */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--color-bg-surface)] border-b border-[var(--color-border)] pt-safe">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to dashboard"
          className="p-2 -ml-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] active:bg-[var(--color-accent)] rounded-[var(--radius-md)] cursor-pointer touch-manipulation flex items-center justify-center min-w-[44px] min-h-[44px]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] focus-within:border-[var(--color-primary)] focus-within:ring-1 focus-within:ring-[var(--color-primary)] h-11 transition-all">
          <Search className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Tracker..."
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            className="flex-1 bg-transparent text-sm font-semibold text-[var(--color-text-main)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              aria-label="Clear search query"
              className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] rounded-full cursor-pointer touch-manipulation"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Category Filter Pills (Horizontal Scroll) ── */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-bg-surface)]/80 backdrop-blur-md border-b border-[var(--color-border)] overflow-x-auto no-scrollbar shrink-0">
        {CATEGORY_TABS.map(tab => {
          const isActive = activeCategory === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveCategory(tab.id)}
              className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-bold whitespace-nowrap transition-all touch-manipulation cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-[var(--color-primary)] text-white shadow-xs'
                  : 'bg-[var(--color-bg-base)] text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] border border-[var(--color-border)]'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Results / Recent / Empty States ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 pb-safe">
        {!query.trim() ? (
          /* Empty Search Initial State */
          <div className="py-12 px-4 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--color-text-main)]">Master Search</h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-xs">
                Search across all your journal entries, notes, habits, bookmarks, vault files, weight logs, and settings.
              </p>
            </div>
          </div>
        ) : results.length === 0 ? (
          /* No Matches State */
          <div className="py-12 px-4 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--color-text-main)]">No matches found</h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                No items matched &ldquo;{query}&rdquo; in {activeCategory === 'all' ? 'any category' : activeCategory}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setActiveCategory('all')
                inputRef.current?.focus()
              }}
              className="px-3.5 py-1.5 text-xs font-bold bg-[var(--color-accent)] hover:bg-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text-main)] cursor-pointer"
            >
              Clear filter
            </button>
          </div>
        ) : (
          /* Results List */
          <div className="divide-y divide-[var(--color-border)]/50 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] overflow-hidden shadow-xs">
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectResult(item)}
                className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-[var(--color-accent)] active:bg-[var(--color-accent)] transition-colors cursor-pointer group min-h-[52px] touch-manipulation"
              >
                <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--color-bg-base)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
                  {getResultIcon(item.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[var(--color-text-main)] truncate">
                      {item.title}
                    </span>
                    {item.payload?.externalUrl && (
                      <ExternalLink className="w-3 h-3 text-[var(--color-text-muted)] shrink-0" />
                    )}
                  </div>

                  {item.subtitle && (
                    <p className="text-[11px] text-[var(--color-primary)] font-semibold truncate mt-0.5">
                      {item.subtitle}
                    </p>
                  )}

                  {item.snippet && (
                    <p className="text-[10px] text-[var(--color-text-muted)] line-clamp-1 mt-0.5">
                      {item.snippet}
                    </p>
                  )}
                </div>

                <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
