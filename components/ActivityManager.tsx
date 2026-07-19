"use client"

import React, { useState, useMemo } from 'react'
import { ActivityTemplate, RecurrenceAnalysis } from '@/types'
import { deleteActivityTemplate, duplicateActivityTemplate, updateActivityTemplate, reorderActivityTemplates } from '@/app/actions/template'
import { Icon } from './Icon'
import { Plus, ArrowUp, ArrowDown, Edit2, Copy, Check, Trash2, EyeOff, Search } from 'lucide-react'
import { getTemplateColorClasses } from '@/lib/colors'
import { Button, EmptyState } from '@/design-system'

interface ActivityManagerProps {
  analyzedTemplates: { template: ActivityTemplate; analysis: RecurrenceAnalysis }[]
  onAddTemplate: () => void
  onEditTemplate: (template: ActivityTemplate) => void
}

const RECURRENCE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
]

export const ActivityManager: React.FC<ActivityManagerProps> = ({
  analyzedTemplates,
  onAddTemplate,
  onEditTemplate,
}) => {
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('')
  const [activeRecurrence, setActiveRecurrence] = useState('all')

  // Bulk Selection States
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const activeTemplates = useMemo(() => analyzedTemplates.filter(item => item.template.isActive), [analyzedTemplates])
  const archivedTemplates = useMemo(() => analyzedTemplates.filter(item => !item.template.isActive), [analyzedTemplates])

  // Filter & Sort logic
  const filteredTemplates = useMemo(() => {
    let list = showArchived ? archivedTemplates : activeTemplates

    if (activeRecurrence !== 'all') {
      list = list.filter(item => item.template.recurrenceType === activeRecurrence)
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(item => 
        item.template.name.toLowerCase().includes(q) || 
        (item.template.notes && item.template.notes.toLowerCase().includes(q))
      )
    }

    // Sort by manual sortOrder
    return [...list].sort((a, b) => a.template.sortOrder - b.template.sortOrder)
  }, [showArchived, activeTemplates, archivedTemplates, activeRecurrence, searchQuery])

  // Reordering
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= filteredTemplates.length) return

    const item = filteredTemplates[index].template
    setIsProcessing(item.id)

    const reordered = [...filteredTemplates.map(t => t.template)]
    reordered[index] = reordered[newIndex]
    reordered[newIndex] = item

    const ids = reordered.map(t => t.id)
    await reorderActivityTemplates(ids)
    setIsProcessing(null)
  }

  const handleToggleArchive = async (template: ActivityTemplate) => {
    setIsProcessing(template.id)
    await updateActivityTemplate(template.id, { isActive: !template.isActive })
    setIsProcessing(null)
  }

  const handleDuplicate = async (id: string) => {
    setIsProcessing(id)
    await duplicateActivityTemplate(id)
    setIsProcessing(null)
  }

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"? This deletes its logs.`)) {
      setIsProcessing(id)
      await deleteActivityTemplate(id)
      setIsProcessing(null)
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredTemplates.map(item => item.template.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectItem = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id])
    } else {
      setSelectedIds(prev => prev.filter(item => item !== id))
    }
  }

  const handleBulkArchive = async (archive: boolean) => {
    setIsProcessing('bulk')
    for (const id of selectedIds) {
      await updateActivityTemplate(id, { isActive: !archive })
    }
    setSelectedIds([])
    setIsProcessing(null)
  }

  const handleBulkDelete = async () => {
    if (confirm(`Are you sure you want to delete these ${selectedIds.length} activities?`)) {
      setIsProcessing('bulk')
      for (const id of selectedIds) {
        await deleteActivityTemplate(id)
      }
      setSelectedIds([])
      setIsProcessing(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      
      {/* TOP BAR: Search + New Activity + Archive toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search activities..."
            className="w-full bg-transparent pl-9 pr-4 py-2 text-sm text-[var(--color-text-main)] placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-hidden font-bold border-b border-[var(--color-border)]/60"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowArchived(!showArchived)
              setSelectedIds([])
            }}
            className={showArchived ? 'text-rose-500 border-rose-500/30' : ''}
          >
            {showArchived ? 'View Active' : 'View Archived'}
          </Button>
          <Button
            onClick={onAddTemplate}
            size="sm"
            icon={<Plus size={14} />}
          >
            New Activity
          </Button>
        </div>
      </div>

      {/* Recurrence Type Filter Pills */}
      <div className="flex flex-wrap gap-1.5">
        {RECURRENCE_FILTERS.map(f => {
          const isActive = activeRecurrence === f.value
          return (
            <button
              key={f.value}
              onClick={() => {
                setActiveRecurrence(f.value)
                setSelectedIds([])
              }}
              className={`px-3 py-1.5 text-[11px] font-bold rounded-full border transition-all cursor-pointer ${
                isActive
                  ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-sm'
                  : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]/50 hover:text-[var(--color-text-main)]'
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

          {/* Bulk Action Bar overlay */}
          {selectedIds.length > 0 && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[var(--color-bg-surface)] border border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl rounded-full px-6 py-3 flex items-center gap-8 z-50 animate-in slide-in-from-bottom-8 duration-300 ease-out">
              <span className="text-sm font-bold text-[var(--color-text-main)] whitespace-nowrap">
                {selectedIds.length} item(s) selected
              </span>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkArchive(!showArchived)}
                  disabled={isProcessing !== null}
                  className="rounded-full"
                >
                  {showArchived ? 'Restore' : 'Archive'}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={isProcessing !== null}
                  className="rounded-full"
                >
                  Delete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedIds([])}
                  className="rounded-full"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

        {/* Activities List */}
        {filteredTemplates.length === 0 ? (
          <EmptyState
            title="No Activities Found"
            description="Create your first activity template to schedule task reminders, workouts, bills, or study sessions."
          />
        ) : (
          <div className="space-y-2">
            {/* Header select-all row */}
            <div className="flex items-center gap-3 px-3 py-1 text-[9px] text-[var(--color-text-muted)] font-black uppercase tracking-wider">
              <input
                type="checkbox"
                checked={selectedIds.length === filteredTemplates.length && filteredTemplates.length > 0}
                onChange={e => handleSelectAll(e.target.checked)}
                className="w-3.5 h-3.5 text-[var(--color-primary)] border-[var(--color-border)] rounded-sm cursor-pointer"
              />
              <span>Select All</span>
            </div>

            {/* List checklist items */}
            {filteredTemplates.map((item, idx) => {
              const { template, analysis } = item
              const isFirst = idx === 0
              const isLast = idx === filteredTemplates.length - 1
              const isTemplateActive = template.isActive
              const isSelected = selectedIds.includes(template.id)
              const colorClasses = getTemplateColorClasses(template.color, isTemplateActive)

              return (
                <div
                  key={template.id}
                  className={`flex items-center justify-between gap-3 p-3 border rounded-xl transition-all duration-[var(--motion-duration-fast)] group hover:shadow-2xs ${
                    isTemplateActive ? `${colorClasses.bg} ${colorClasses.border}` : 'bg-transparent border-slate-200 dark:border-zinc-800 opacity-40'
                  } ${isSelected ? 'ring-2 ring-[var(--color-primary)]' : ''}`}
                >
                  {/* Left elements: checkbox, icon, details */}
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={e => handleSelectItem(template.id, e.target.checked)}
                      className="w-3.5 h-3.5 text-[var(--color-primary)] border-[var(--color-border)] rounded-sm cursor-pointer"
                    />

                    {/* Colorful visual Icon wrapper */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${
                      isTemplateActive ? `${colorClasses.bg} ${colorClasses.border}` : 'bg-slate-100 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700'
                    }`}>
                      <Icon name={template.icon} className={colorClasses.text} size={15} />
                    </div>

                    <div className="min-w-0">
                      <span className="font-semibold text-[var(--color-text-main)] text-xs block truncate">
                        {template.name}
                      </span>
                      <span className="text-[9px] text-[var(--color-text-muted)] font-medium capitalize flex items-center gap-1.5 mt-0.5">
                        <span className="bg-[var(--color-accent)] px-1.5 py-0.5 rounded text-[8px] font-bold">
                          {template.recurrenceType}
                        </span>
                        <span>•</span>
                        <span>{template.category}</span>
                        {template.amount !== null && (
                          <>
                            <span>•</span>
                            <span className="text-green-600 dark:text-green-400 font-bold font-mono">₹{template.amount.toFixed(2)}</span>
                          </>
                        )}
                        {analysis.daysSinceLast !== null && (
                          <>
                            <span>•</span>
                            <span>Last completed {analysis.daysSinceLast}d ago</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Right operations - Always visible on mobile, hover on desktop */}
                  <div className="flex items-center gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150 shrink-0">
                    {/* Ordering (manual sortOrder) */}
                    {isTemplateActive && !showArchived && (
                      <div className="flex bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded p-0.5">
                        <button
                          type="button"
                          onClick={() => handleMove(idx, 'up')}
                          disabled={isFirst || isProcessing !== null}
                          className="p-1 hover:text-[var(--color-text-main)] text-slate-400 rounded hover:bg-[var(--color-accent)] disabled:opacity-20 cursor-pointer"
                          title="Move Up"
                          aria-label="Move Up"
                        >
                          <ArrowUp size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMove(idx, 'down')}
                          disabled={isLast || isProcessing !== null}
                          className="p-1 hover:text-[var(--color-text-main)] text-slate-400 rounded hover:bg-[var(--color-accent)] disabled:opacity-20 cursor-pointer"
                          title="Move Down"
                          aria-label="Move Down"
                        >
                          <ArrowDown size={11} />
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-0.5 bg-[var(--color-bg-surface)] p-0.5 border border-[var(--color-border)] rounded">
                      <button
                        type="button"
                        onClick={() => onEditTemplate(template)}
                        disabled={isProcessing !== null}
                        className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] rounded hover:bg-[var(--color-accent)] transition-colors cursor-pointer"
                        title="Edit Template"
                        aria-label="Edit Template"
                      >
                        <Edit2 size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(template.id)}
                        disabled={isProcessing !== null}
                        className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] rounded hover:bg-[var(--color-accent)] transition-colors cursor-pointer"
                        title="Duplicate Template"
                      >
                        <Copy size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleArchive(template)}
                        disabled={isProcessing !== null}
                        className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] rounded hover:bg-[var(--color-accent)] transition-colors cursor-pointer"
                        title={isTemplateActive ? 'Archive' : 'Restore'}
                      >
                        {isTemplateActive ? <EyeOff size={11} /> : <Check size={11} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(template.id, template.name)}
                        disabled={isProcessing !== null}
                        className="p-1 text-[var(--color-text-muted)] hover:text-rose-500 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Delete Template"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}

