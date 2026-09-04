"use client"

import React, { useEffect, useState } from 'react'
import { Code2, ArrowUpRight, RefreshCw, AlertCircle } from 'lucide-react'
import { DailyCodingProblem } from '@/modules/coding/types'
import { getDailyCodingProblemAction } from '@/app/actions/coding'

interface DailyCodingWidgetProps {
  platform: 'leetcode' | 'gfg'
  todayStr?: string
}

export const DailyCodingWidget: React.FC<DailyCodingWidgetProps> = ({
  platform,
  todayStr,
}) => {
  const [problem, setProblem] = useState<DailyCodingProblem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isLeetCode = platform === 'leetcode'
  const platformLabel = isLeetCode ? 'LeetCode' : 'GFG'
  const accentBorder = isLeetCode
    ? 'hover:border-amber-500/40 dark:hover:border-amber-400/40'
    : 'hover:border-emerald-500/40 dark:hover:border-emerald-400/40'
  const iconColor = isLeetCode ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-500 dark:text-emerald-400'
  const platformBadgeBg = isLeetCode
    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'

  const fetchProblem = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getDailyCodingProblemAction(platform, todayStr)
      if (res.success && res.problem) {
        setProblem(res.problem)
      } else {
        setError(res.error || 'Problem unavailable')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await getDailyCodingProblemAction(platform, todayStr)
        if (active) {
          if (res.success && res.problem) {
            setProblem(res.problem)
            setError(null)
          } else {
            setError(res.error || 'Problem unavailable')
          }
          setLoading(false)
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Network error')
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      active = false
    }
  }, [platform, todayStr])

  const getDifficultyPill = (difficulty?: string) => {
    if (!difficulty) return null
    const d = difficulty.toLowerCase()
    let pillColor = 'bg-slate-500/10 text-slate-500 dark:text-slate-400'
    if (d.includes('easy')) {
      pillColor = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    } else if (d.includes('medium')) {
      pillColor = 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
    } else if (d.includes('hard')) {
      pillColor = 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
    }

    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${pillColor}`}>
        {difficulty}
      </span>
    )
  }

  // Loading skeleton state
  if (loading) {
    return (
      <div className="p-3.5 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--card-radius)] shadow-[var(--card-shadow)] space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="h-4 w-20 bg-slate-200 dark:bg-zinc-800 rounded-full animate-pulse" />
          <div className="h-4 w-12 bg-slate-200 dark:bg-zinc-800 rounded-full animate-pulse" />
        </div>
        <div className="h-4 w-3/4 bg-slate-200 dark:bg-zinc-800 rounded animate-pulse" />
      </div>
    )
  }

  // Error compact recovery state
  if (error || !problem) {
    return (
      <div className="p-3.5 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--card-radius)] shadow-[var(--card-shadow)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] truncate">
          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span className="truncate text-[11px] font-medium">{platformLabel} POTD: {error || 'Unavailable'}</span>
        </div>
        <button
          type="button"
          onClick={fetchProblem}
          title="Retry"
          className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-accent)] rounded-[var(--radius-md)] transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
    )
  }

  // Minimal interactive card
  return (
    <a
      href={problem.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group block p-3.5 bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-subtle)] border border-[var(--color-border)] ${accentBorder} rounded-[var(--card-radius)] shadow-[var(--card-shadow)] hover:shadow-[var(--card-hover-shadow)] transition-all duration-200 cursor-pointer select-none`}
    >
      {/* Header Row: Platform Tag + Difficulty + Quick Open Arrow */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-pill)] text-[10px] font-extrabold uppercase tracking-wider border ${platformBadgeBg}`}>
            <Code2 className={`w-3 h-3 ${iconColor}`} />
            {platformLabel}
          </span>
          {getDifficultyPill(problem.difficulty)}
        </div>

        <div className="w-6 h-6 rounded-full bg-[var(--color-accent)] text-[var(--color-text-muted)] group-hover:text-[var(--color-text-main)] group-hover:bg-[var(--color-primary)]/10 group-hover:text-[var(--color-primary)] flex items-center justify-center transition-all duration-200">
          <ArrowUpRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </div>

      {/* Problem Title & Number */}
      <div className="flex items-baseline gap-1.5 min-w-0">
        {problem.problemNumber && (
          <span className="text-xs font-mono font-bold text-[var(--color-text-muted)] shrink-0">
            #{problem.problemNumber}
          </span>
        )}
        <h4 className="text-xs font-bold text-[var(--color-text-main)] group-hover:text-[var(--color-primary)] transition-colors truncate">
          {problem.title}
        </h4>
      </div>

      {/* Topic Tags Preview */}
      {problem.topicTags && problem.topicTags.length > 0 && (
        <div className="flex items-center gap-1 pt-1.5 overflow-hidden">
          {problem.topicTags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="text-[9px] px-1.5 py-0.5 bg-[var(--color-accent)]/70 text-[var(--color-text-muted)] rounded-md font-medium truncate max-w-[100px]"
            >
              {tag}
            </span>
          ))}
          {problem.topicTags.length > 2 && (
            <span className="text-[9px] text-[var(--color-text-muted)] font-medium">
              +{problem.topicTags.length - 2}
            </span>
          )}
        </div>
      )}
    </a>
  )
}
