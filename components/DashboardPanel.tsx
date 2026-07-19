"use client"

import React, { useState } from 'react'
import { ActivityTemplate, ActivityLog, Tag, RecurrenceAnalysis } from '@/types'
import { markComplete, deleteLog } from '@/app/actions/log'
import { getTodayDateStr, addUTCDays, parseUTCDate, formatUTCDate } from '@/lib/recurrence'
import { Icon } from './Icon'
import { Search, Flame, Calendar, RefreshCcw, Check, Sparkles, Scissors, ShieldAlert, X } from 'lucide-react'
import { getTemplateColorClasses } from '@/lib/colors'
import { Card, Input, Select, SearchInput, Button, EmptyState } from '@/design-system'

interface AnalyzedTemplate {
  template: ActivityTemplate
  analysis: RecurrenceAnalysis
}

interface DashboardPanelProps {
  analyzedTemplates: AnalyzedTemplate[]
  recentLogs: ActivityLog[]
  allTags: Tag[]
  onOpenLogger: (template: ActivityTemplate, log?: ActivityLog) => void
}

export const DashboardPanel: React.FC<DashboardPanelProps> = ({
  analyzedTemplates,
  recentLogs,
  allTags,
  onOpenLogger,
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedTag, setSelectedTag] = useState<string>('all')
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'due' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('due')

  const todayStr = getTodayDateStr()
  const endOfWeekStr = addUTCDays(todayStr, 7)
  
  // Calculate end of current month
  const todayDate = parseUTCDate(todayStr)
  const lastDayOfMonth = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth() + 1, 0))
  const endOfMonthStr = formatUTCDate(lastDayOfMonth)

  // Filter templates based on search & filters
  const filteredTemplates = analyzedTemplates.filter(({ template }) => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (template.notes && template.notes.toLowerCase().includes(searchTerm.toLowerCase()))
    
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory
    
    const matchesTag = selectedTag === 'all' || template.tags.some(t => t.name === selectedTag)

    return matchesSearch && matchesCategory && matchesTag && template.isActive
  })

  // Grouping logic
  const dueToday: AnalyzedTemplate[] = []
  const dueThisWeek: AnalyzedTemplate[] = []
  const dueThisMonth: AnalyzedTemplate[] = []
  const milestones: AnalyzedTemplate[] = []
  const upcomingYearly: AnalyzedTemplate[] = []

  filteredTemplates.forEach(item => {
    const { template, analysis } = item
    const { nextDueDate } = analysis

    if (template.recurrenceType === 'milestone') {
      milestones.push(item)
    } else if (template.recurrenceType === 'yearly') {
      upcomingYearly.push(item)
    } else if (nextDueDate) {
      if (nextDueDate <= todayStr) {
        dueToday.push(item)
      } else if (nextDueDate <= endOfWeekStr) {
        dueThisWeek.push(item)
      } else if (nextDueDate <= endOfMonthStr) {
        dueThisMonth.push(item)
      }
    }
  })

  // Sort helper
  const sortByDueDate = (a: AnalyzedTemplate, b: AnalyzedTemplate) => {
    const dateA = a.analysis.nextDueDate || '9999-12-31'
    const dateB = b.analysis.nextDueDate || '9999-12-31'
    return dateA.localeCompare(dateB)
  }

  dueToday.sort(sortByDueDate)
  dueThisWeek.sort(sortByDueDate)
  dueThisMonth.sort(sortByDueDate)
  upcomingYearly.sort(sortByDueDate)

  // Quick mark complete
  const handleQuickComplete = async (template: ActivityTemplate) => {
    setIsProcessing(template.id)
    const status = template.category === 'finance' ? 'paid' : 'done'
    const amount = template.amount
    
    await markComplete(template.id, todayStr, status, amount, null)
    setIsProcessing(null)
  }

  // Undo log completion
  const handleUndoLog = async (logId: string) => {
    setIsProcessing(logId)
    await deleteLog(logId)
    setIsProcessing(null)
  }

  const getUrgencyBadgeColor = (analysis: RecurrenceAnalysis, remindDays: number | null) => {
    if (analysis.overdue) {
      return 'bg-red-500/10 text-red-500 dark:text-red-400 border border-red-500/30'
    }
    
    if (analysis.nextDueDate && remindDays !== null) {
      const daysDiff = diffUTCDays(analysis.nextDueDate, todayStr)
      if (daysDiff <= remindDays) {
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30'
      }
    }

    return 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700'
  }

  function diffUTCDays(dateStr1: string, dateStr2: string): number {
    const d1 = parseUTCDate(dateStr1)
    const d2 = parseUTCDate(dateStr2)
    return Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24))
  }

  const uniqueCategories = Array.from(new Set(analyzedTemplates.map(t => t.template.category)))

  const dailyTemplates = filteredTemplates.filter(({ template }) => template.recurrenceType === 'daily')
  const weeklyTemplates = filteredTemplates.filter(({ template }) => template.recurrenceType === 'weekly')
  const monthlyTemplates = filteredTemplates.filter(({ template }) => template.recurrenceType === 'monthly')
  const yearlyTemplates = filteredTemplates.filter(
    ({ template }) => template.recurrenceType === 'yearly' || template.recurrenceType === 'milestone'
  )
  const totalDueCount = dueToday.length + dueThisWeek.length + dueThisMonth.length + upcomingYearly.filter(x => x.analysis.overdue).length

  const getGoogleCalendarUrl = (template: ActivityTemplate, targetDateStr: string) => {
    const cleanDate = targetDateStr.replace(/-/g, '')
    const [y, m, d] = targetDateStr.split('-').map(Number)
    const nextDate = new Date(Date.UTC(y, m - 1, d + 1))
    const cleanEndDate = nextDate.toISOString().split('T')[0].replace(/-/g, '')
    
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(template.name)}&dates=${cleanDate}/${cleanEndDate}&details=${encodeURIComponent(template.notes || '')}&sf=true&output=xml`
  }

  const renderTemplateCard = (item: AnalyzedTemplate) => {
    const { template, analysis } = item
    const isCompletedToday = analysis.lastCompletedDate === todayStr
    const eventDate = analysis.nextDueDate || todayStr
    const calendarUrl = getGoogleCalendarUrl(template, eventDate)

    return (
      <Card
        key={template.id}
        compact
        className={`flex-row items-center justify-between gap-4 transition-all duration-200 ${
          isCompletedToday ? 'opacity-60 bg-slate-50/50 dark:bg-zinc-900/10' : ''
        }`}
      >
        <div className="flex items-center gap-3">
          {(() => {
            const colorClasses = getTemplateColorClasses(template.color, template.isActive)
            return (
              <div
                onClick={() => onOpenLogger(template)}
                className={`w-8.5 h-8.5 rounded-lg flex items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors border ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`}
                title="Detailed log options"
              >
                <Icon name={template.icon} size={16} />
              </div>
            )
          })()}
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`font-semibold text-slate-800 dark:text-zinc-200 ${isCompletedToday ? 'line-through text-slate-400 dark:text-zinc-500' : ''}`}>{template.name}</span>
              {analysis.streak > 0 && (
                <span className="flex items-center gap-0.5 text-orange-500 dark:text-orange-400 text-xs font-bold font-mono" title="Daily streak">
                  <Flame size={12} className="fill-orange-500/20" /> {analysis.streak}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[9px]">
              <span className={`px-1.5 py-0.5 rounded-full font-semibold inline-flex items-center justify-center leading-none ${getUrgencyBadgeColor(analysis, template.remindBeforeDays)}`}>
                {isCompletedToday ? 'Completed Today ✓' : analysis.statusMessage}
              </span>
              {analysis.daysSinceLast !== null ? (
                <span className="text-slate-500 dark:text-zinc-400 font-medium bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/60 px-1.5 py-0.5 rounded-full">
                  Last done: {analysis.daysSinceLast === 0 ? 'Today' : `${analysis.daysSinceLast}d ago`}
                </span>
              ) : (
                <span className="text-slate-400 dark:text-zinc-550 font-medium bg-slate-50 dark:bg-zinc-850/50 border border-slate-200/50 dark:border-zinc-800/60 px-1.5 py-0.5 rounded-full italic">
                  Never completed
                </span>
              )}
              {template.amount !== null && (
                <span className="text-xs text-green-600 dark:text-green-400 font-semibold font-mono flex items-center gap-0.5">
                  ₹{template.amount.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {!isCompletedToday && (
            <a
              href={calendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-7 h-7 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-950 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
              title="Add to Google Calendar"
            >
              <Calendar size={12} />
            </a>
          )}

          <button
            onClick={() => handleQuickComplete(template)}
            disabled={isProcessing === template.id || isCompletedToday}
            className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center transition-all disabled:opacity-50 cursor-pointer shadow-xs ${
              isCompletedToday
                ? 'bg-green-100 border border-green-200 text-green-600 dark:bg-green-950/20 dark:border-green-900 dark:text-green-400 cursor-not-allowed'
                : 'bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 border border-slate-800 dark:border-zinc-200'
            }`}
            title={isCompletedToday ? 'Completed' : 'Mark complete'}
          >
            {isProcessing === template.id ? (
              <RefreshCcw size={12} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
          </button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6 text-sm">
      
      <Card className="p-5 space-y-4 bg-gradient-to-br from-[var(--color-bg-surface)] to-transparent">
        <div className="relative w-full">
          <Search className="absolute left-3 top-[13px] text-slate-400 dark:text-zinc-500" size={16} />
          <Input
            type="text"
            placeholder="Search activities..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
        
        <div className="flex flex-wrap gap-2 text-xs">
          <Select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="text-xs py-1.5 px-2.5 max-w-[150px]"
            options={[
              { value: 'all', label: 'All Categories' },
              ...uniqueCategories.map(cat => ({ value: cat, label: cat.toUpperCase() }))
            ]}
          />

          <Select
            value={selectedTag}
            onChange={e => setSelectedTag(e.target.value)}
            className="text-xs py-1.5 px-2.5 max-w-[150px]"
            options={[
              { value: 'all', label: 'All Tags' },
              ...allTags.map(tag => ({ value: tag.name, label: `#${tag.name}` }))
            ]}
          />
          
          {(selectedCategory !== 'all' || selectedTag !== 'all' || searchTerm !== '') && (
            <button
              onClick={() => {
                setSearchTerm('')
                setSelectedCategory('all')
                setSelectedTag('all')
              }}
              className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] flex items-center gap-1 ml-auto font-medium transition-colors cursor-pointer"
            >
              <X size={12} /> Clear Filters
            </button>
          )}
        </div>
      </Card>

      <div className="flex border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-1 rounded-xl gap-1">
        {(['due', 'daily', 'weekly', 'monthly', 'yearly'] as const).map(tab => {
          const isActive = activeTab === tab
          let label = ''
          let count = 0
          switch (tab) {
            case 'due':
              label = 'Due Feed'
              count = totalDueCount
              break
            case 'daily':
              label = 'Daily'
              count = dailyTemplates.length
              break
            case 'weekly':
              label = 'Weekly'
              count = weeklyTemplates.length
              break
            case 'monthly':
              label = 'Monthly'
              count = monthlyTemplates.length
              break
            case 'yearly':
              label = 'Yearly / Milestones'
              count = yearlyTemplates.length
              break
          }
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 px-1.5 text-center text-[10px] font-bold rounded-lg transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                isActive
                  ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-700 shadow-xs'
                  : 'text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300'
              }`}
            >
              <span>{label}</span>
              {count > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-blue-500 text-white font-black' : 'bg-slate-200 dark:bg-zinc-950 text-slate-600 dark:text-zinc-400 font-bold'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {activeTab === 'due' ? (
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="text-red-500 dark:text-red-400" size={14} />
              Due Today / Overdue ({dueToday.length})
            </h3>
            
            {dueToday.length === 0 ? (
              <Card compact className="text-center text-slate-400 dark:text-zinc-600 text-xs italic">
                All caught up for today!
              </Card>
            ) : (
              <div className="space-y-2.5">
                {dueToday.map(({ template, analysis }) => {
                  const calendarUrl = getGoogleCalendarUrl(template, analysis.nextDueDate || todayStr)
                  return (
                    <Card
                      key={template.id}
                      compact
                      className="flex-row items-center justify-between gap-4 group"
                    >
                      <div className="flex items-center gap-3">
                        {(() => {
                          const colorClasses = getTemplateColorClasses(template.color, template.isActive)
                          return (
                            <div
                              onClick={() => onOpenLogger(template)}
                              className={`w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors border ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`}
                              title="Detailed log options"
                            >
                              <Icon name={template.icon} size={18} />
                            </div>
                          )
                        })()}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-800 dark:text-white">{template.name}</span>
                            {analysis.streak > 0 && (
                              <span className="flex items-center gap-0.5 text-orange-500 dark:text-orange-400 text-xs font-bold font-mono" title="Daily streak">
                                <Flame size={12} className="fill-orange-500/20" /> {analysis.streak}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center justify-center leading-none ${getUrgencyBadgeColor(analysis, template.remindBeforeDays)}`}>
                              {analysis.statusMessage}
                            </span>
                            {analysis.daysSinceLast !== null ? (
                              <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/60 px-2 py-0.5 rounded-full">
                                Last done: {analysis.daysSinceLast === 0 ? 'Today' : `${analysis.daysSinceLast}d ago`}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 dark:text-zinc-555 font-medium bg-slate-50 dark:bg-zinc-850/50 border border-slate-200/50 dark:border-zinc-800/60 px-2 py-0.5 rounded-full italic">
                                Never completed
                              </span>
                            )}
                            {template.amount !== null && (
                              <span className="text-xs text-green-600 dark:text-green-400 font-semibold font-mono flex items-center gap-0.5">
                                ₹{template.amount.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <a
                          href={calendarUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-7.5 h-7.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-950 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                          title="Add to Google Calendar"
                        >
                          <Calendar size={13} />
                        </a>

                        <button
                          onClick={() => handleQuickComplete(template)}
                          disabled={isProcessing === template.id}
                          className="bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 border border-slate-800 dark:border-zinc-200 w-8 h-8 rounded-lg flex items-center justify-center font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                          title="Mark complete"
                        >
                          {isProcessing === template.id ? (
                            <RefreshCcw size={14} className="animate-spin" />
                          ) : (
                            <Check size={16} />
                          )}
                        </button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="text-blue-500 dark:text-blue-400" size={14} />
              Due This Week ({dueThisWeek.length})
            </h3>
            
            {dueThisWeek.length > 0 && (
              <div className="space-y-2">
                {dueThisWeek.map(({ template, analysis }) => {
                  const calendarUrl = getGoogleCalendarUrl(template, analysis.nextDueDate || todayStr)
                  return (
                    <Card
                      key={template.id}
                      compact
                      className="flex-row items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        {(() => {
                          const colorClasses = getTemplateColorClasses(template.color, template.isActive)
                          return (
                            <div
                              onClick={() => onOpenLogger(template)}
                              className={`w-8.5 h-8.5 rounded-lg flex items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors border ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`}
                              title="Detailed log options"
                            >
                              <Icon name={template.icon} size={16} />
                            </div>
                          )
                        })()}
                        <div>
                          <span className="font-semibold text-slate-700 dark:text-zinc-200">{template.name}</span>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold inline-flex items-center justify-center leading-none ${getUrgencyBadgeColor(analysis, template.remindBeforeDays)}`}>
                              {analysis.statusMessage}
                            </span>
                            {analysis.daysSinceLast !== null ? (
                              <span className="text-[9px] text-slate-500 dark:text-zinc-400 font-medium bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/60 px-1.5 py-0.5 rounded-full">
                                Last done: {analysis.daysSinceLast === 0 ? 'Today' : `${analysis.daysSinceLast}d ago`}
                              </span>
                            ) : (
                              <span className="text-[9px] text-slate-400 dark:text-zinc-555 font-medium bg-slate-50 dark:bg-zinc-850/50 border border-slate-200/50 dark:border-zinc-800/60 px-1.5 py-0.5 rounded-full italic">
                                Never completed
                              </span>
                            )}
                            {template.amount !== null && (
                              <span className="text-xs text-green-600 dark:text-green-400 font-semibold font-mono flex items-center gap-0.5">
                                ₹{template.amount.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <a
                          href={calendarUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-7 h-7 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-950 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                          title="Add to Google Calendar"
                        >
                          <Calendar size={12} />
                        </a>

                        <button
                          onClick={() => handleQuickComplete(template)}
                          disabled={isProcessing === template.id}
                          className="bg-slate-100 hover:bg-slate-200 dark:bg-zinc-950 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer"
                          title="Mark complete"
                        >
                          {isProcessing === template.id ? (
                            <RefreshCcw size={12} className="animate-spin" />
                          ) : (
                            <Check size={14} />
                          )}
                        </button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {dueThisMonth.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                Due Later This Month ({dueThisMonth.length})
              </h3>
              <Card compact className="divide-y divide-slate-100 dark:divide-zinc-800">
                {dueThisMonth.map(({ template, analysis }) => (
                  <div key={template.id} className="flex justify-between items-center py-2 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const colorClasses = getTemplateColorClasses(template.color, template.isActive)
                        return (
                          <span className={colorClasses.text}>
                            <Icon name={template.icon} size={14} />
                          </span>
                        )
                      })()}
                      <span className="text-slate-700 dark:text-zinc-300 text-xs font-medium">{template.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
                        {analysis.nextDueDate}
                      </span>
                      {template.amount !== null && (
                        <span className="text-xs text-green-600 dark:text-green-400 font-mono font-semibold flex items-center">
                          ₹{template.amount.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Scissors className="text-purple-500 dark:text-purple-400" size={14} />
              Milestones & Trackers ({milestones.length})
            </h3>

            {milestones.length === 0 ? (
              <Card compact className="text-center text-slate-400 dark:text-zinc-600 text-xs italic">
                No milestones configured.
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {milestones.map(({ template, analysis }) => (
                  <Card
                    key={template.id}
                    interactive
                    compact
                    onClick={() => onOpenLogger(template)}
                    className="justify-between gap-3 group"
                  >
                    <div className="flex items-start gap-2.5">
                      {(() => {
                        const colorClasses = getTemplateColorClasses(template.color, template.isActive)
                        return (
                          <div className={`p-1.5 rounded-lg border ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`}>
                            <Icon name={template.icon} size={16} />
                          </div>
                        )
                      })()}
                      <div>
                        <h4 className="font-semibold text-slate-800 dark:text-white text-xs group-hover:text-slate-900 dark:group-hover:text-zinc-200">{template.name}</h4>
                        <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                          Last: {analysis.lastCompletedDate || 'Never'}
                        </p>
                      </div>
                    </div>
                    <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 font-mono">
                      {analysis.statusMessage}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {upcomingYearly.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                <RefreshCcw size={12} className="text-orange-500 dark:text-orange-400" /> Upcoming Yearly Renewals
              </h3>
              <Card compact className="space-y-3">
                {upcomingYearly.map(({ template, analysis }) => (
                  <div key={template.id} className="flex justify-between items-center text-xs">
                    <div>
                      {(() => {
                        const colorClasses = getTemplateColorClasses(template.color, template.isActive)
                        return (
                          <div className="font-medium text-slate-700 dark:text-white flex items-center gap-1.5">
                            <Icon name={template.icon} className={colorClasses.text} size={13} />
                            {template.name}
                          </div>
                        )
                      })()}
                      <span className={`text-[9px] font-semibold uppercase ${analysis.overdue ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-zinc-500'}`}>
                        {analysis.statusMessage}
                      </span>
                    </div>
                    <div className="text-right">
                      {template.amount !== null && (
                        <div className="text-green-600 dark:text-green-400 font-bold font-mono">₹{template.amount.toFixed(2)}</div>
                      )}
                      <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">{analysis.nextDueDate}</div>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="text-amber-500 dark:text-amber-400" size={14} />
              Recently Completed ({recentLogs.length})
            </h3>
            
            {recentLogs.length === 0 ? (
              <Card compact className="text-center text-slate-400 dark:text-zinc-600 text-xs italic">
                No recent activity.
              </Card>
            ) : (
              <Card className="p-0 divide-y divide-slate-100 dark:divide-zinc-800 max-h-60 overflow-y-auto">
                {recentLogs.map(log => {
                  const template = analyzedTemplates.find(t => t.template.id === log.activityId)?.template
                  const color = template?.color || 'zinc'
                  const icon = template?.icon || 'CheckSquare'

                  return (
                    <div
                      key={log.id}
                      className="p-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        {(() => {
                          const colorClasses = getTemplateColorClasses(color)
                          return (
                            <span className={`p-1.5 border rounded-lg ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text}`}>
                              <Icon name={icon} size={14} />
                            </span>
                          )
                        })()}
                        <div>
                          <div className="font-semibold text-slate-700 dark:text-zinc-200">
                            {template?.name || 'Unknown Activity'}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-zinc-500 flex items-center gap-1.5">
                            <span className="font-mono">{log.date}</span>
                            <span>•</span>
                            <span className="capitalize">{log.status}</span>
                            {log.amount !== null && (
                              <>
                                <span>•</span>
                                <span className="text-green-600 dark:text-green-500 font-semibold font-mono">₹{log.amount.toFixed(2)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleUndoLog(log.id)}
                        disabled={isProcessing === log.id}
                        className="text-[10px] text-slate-500 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 font-medium px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-950 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 rounded-md transition-colors cursor-pointer"
                      >
                        Undo
                      </button>
                    </div>
                  )
                })}
              </Card>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider capitalize">
            {activeTab === 'yearly' ? 'Yearly & Milestones' : `${activeTab} Activities`} ({
              activeTab === 'daily' ? dailyTemplates.length :
              activeTab === 'weekly' ? weeklyTemplates.length :
              activeTab === 'monthly' ? monthlyTemplates.length :
              yearlyTemplates.length
            })
          </h3>
          
          {(() => {
            const list = 
              activeTab === 'daily' ? dailyTemplates :
              activeTab === 'weekly' ? weeklyTemplates :
              activeTab === 'monthly' ? monthlyTemplates :
              yearlyTemplates

            if (list.length === 0) {
              return (
                <Card compact className="text-center text-slate-400 dark:text-zinc-600 text-xs italic">
                  No {activeTab} activities found.
                </Card>
              )
            }

            return (
              <div className="space-y-2.5">
                {list.map(renderTemplateCard)}
              </div>
            )
          })()}
        </div>
      )}

    </div>
  )
}

