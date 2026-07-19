"use client"

import React, { useEffect, useState } from 'react'
import { ExternalLink, Code2, Trophy, Clock, Loader2 } from 'lucide-react'
import { Card } from '@/design-system'

interface Contest {
  id: string
  platform: 'codeforces' | 'leetcode'
  name: string
  startTime: number // unix seconds
  durationSeconds: number
  url: string
}

function formatCountdown(startTime: number): { label: string; urgent: boolean } {
  const nowMs = Date.now()
  const diffMs = startTime * 1000 - nowMs
  if (diffMs <= 0) return { label: 'Live now!', urgent: true }

  const totalMin = Math.floor(diffMs / 60000)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const mins = totalMin % 60

  if (days > 0) return { label: `in ${days}d ${hours}h`, urgent: false }
  if (hours > 0) return { label: `in ${hours}h ${mins}m`, urgent: hours < 3 }
  return { label: `in ${mins}m`, urgent: true }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function formatDate(startTime: number): string {
  return new Date(startTime * 1000).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const PLATFORM_CONFIG = {
  codeforces: {
    label: 'Codeforces',
    icon: Code2,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    dot: 'bg-blue-500',
  },
  leetcode: {
    label: 'LeetCode',
    icon: Trophy,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    dot: 'bg-amber-500',
  },
}

export function ContestsWidget() {
  const [contests, setContests] = useState<Contest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    const fetchContests = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/contests')
        if (!res.ok) throw new Error('Failed')
        const data = await res.json()
        setContests(data.contests ?? [])
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchContests()
  }, [])

  // Update countdown every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(timer)
  }, [])

  if (loading) {
    return (
      <Card compact className="flex-row items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 text-[var(--color-text-muted)] animate-spin" />
        <span className="text-[10px] text-[var(--color-text-muted)] font-medium">Loading upcoming contests…</span>
      </Card>
    )
  }

  if (error || contests.length === 0) {
    return (
      <Card compact>
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Upcoming Contests</span>
        </div>
        <p className="text-[10px] text-[var(--color-text-muted)] italic">
          {error ? 'Could not load contests. Check your connection.' : 'No upcoming contests found.'}
        </p>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
            Upcoming Contests
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span className="text-[9px] font-bold text-[var(--color-text-muted)]">CF</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span className="text-[9px] font-bold text-[var(--color-text-muted)]">LC</span>
          </div>
        </div>
      </div>

      {/* Contest list */}
      <div className="divide-y divide-[var(--color-border)]">
        {contests.map((contest) => {
          const cfg = PLATFORM_CONFIG[contest.platform]
          const PlatformIcon = cfg.icon
          const { label: countdown, urgent } = formatCountdown(contest.startTime)

          return (
            <a
              key={contest.id}
              href={contest.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--color-accent)] transition-colors group"
            >
              {/* Platform badge */}
              <div className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${cfg.bg} ${cfg.border} border`}>
                <PlatformIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[var(--color-text-main)] truncate">
                    {contest.name}
                  </span>
                  <ExternalLink className="w-2.5 h-2.5 text-[var(--color-text-muted)] sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] text-[var(--color-text-muted)] font-medium">
                    {formatDate(contest.startTime)}
                  </span>
                  <span className="text-[9px] text-[var(--color-text-muted)] flex items-center gap-0.5">
                    <Clock className="w-2 h-2" />
                    {formatDuration(contest.durationSeconds)}
                  </span>
                </div>
              </div>

              {/* Countdown */}
              <div className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                urgent 
                  ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                  : 'bg-[var(--color-bg-base)] text-[var(--color-text-muted)] border border-[var(--color-border)]'
              }`}>
                {countdown}
              </div>
            </a>
          )
        })}
      </div>
    </Card>
  )
}

