"use client"

import React, { useState, useMemo } from 'react'
import { ActivityTemplate, RecurrenceAnalysis } from '@/types'
import { deleteActivityTemplate, duplicateActivityTemplate, updateActivityTemplate, reorderActivityTemplates } from '@/app/actions/template'
import { Icon } from './Icon'
import { Plus, Edit2, Copy, Check, Trash2, EyeOff, MoreVertical } from 'lucide-react'
import { getTemplateColorClasses } from '@/lib/colors'
import { SortableList, DragHandle } from '@/components/shared/SortableList'
import {
  Button,
  EmptyState,
  IconButton,
  SearchInput,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/design-system'

interface ActivityManagerProps {
  analyzedTemplates: { template: ActivityTemplate; analysis: RecurrenceAnalysis }[]
  onAddTemplate: () => void
  onEditTemplate: (template: ActivityTemplate) => void
  onReorderTemplatesAction?: (orderedIds: string[]) => Promise<void>
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
  onReorderTemplatesAction,
}) => {
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [manualOrderIds, setManualOrderIds] = useState<string[] | null>(null)

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

    // Sort by optimistic manual drag-and-drop order first, then template.sortOrder
    return [...list].sort((a, b) => {
      if (manualOrderIds) {
        const ia = manualOrderIds.indexOf(a.template.id)
        const ib = manualOrderIds.indexOf(b.template.id)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
      }
      return a.template.sortOrder - b.template.sortOrder
    })
  }, [showArchived, activeTemplates, archivedTemplates, activeRecurrence, searchQuery, manualOrderIds])

  // Drag and drop reordering handler with instant optimistic response
  const handleReorder = async (reordered: { template: ActivityTemplate; analysis: RecurrenceAnalysis }[]) => {
    const ids = reordered.map(item => item.template.id)
    setManualOrderIds(ids)
    setIsProcessing('reorder')
    try {
      if (onReorderTemplatesAction) {
        await onReorderTemplatesAction(ids)
      } else {
        await reorderActivityTemplates(ids)
      }
    } catch (err) {
      console.error('Failed to reorder templates:', err)
    } finally {
      setIsProcessing(null)
    }
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
        <div className="flex-1 max-w-md">
          <SearchInput
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder="Search activities…"
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

          {/* Sortable vertical list */}
          <SortableList<{ template: ActivityTemplate; analysis: RecurrenceAnalysis; id: string }>
            items={filteredTemplates.map(item => ({ ...item, id: item.template.id }))}
            onReorder={handleReorder}
            disabled={!showArchived ? false : true}
            getItemId={item => item.template.id}
            renderItem={(item, { isDragOverlay }) => {
              const { template, analysis } = item
              const isTemplateActive = template.isActive
              const isSelected = selectedIds.includes(template.id)
              const colorClasses = getTemplateColorClasses(template.color, isTemplateActive)

              return (
                <div
                  className={`flex items-center justify-between gap-3 p-3 border rounded-xl transition-all duration-[var(--motion-duration-fast)] group hover:shadow-2xs select-none ${
                    isTemplateActive ? `${colorClasses.bg} ${colorClasses.border}` : 'bg-transparent border-slate-200 dark:border-zinc-800 opacity-40'
                  } ${isSelected ? 'ring-2 ring-[var(--color-primary)]' : ''} ${
                    isDragOverlay ? 'shadow-lg border-[var(--color-primary)] scale-[1.01] bg-[var(--color-bg-surface)]' : ''
                  }`}
                >
                  {/* Left elements: drag handle, checkbox, icon, details */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Drag Handle */}
                    {isTemplateActive && !showArchived && (
                      <DragHandle className="mr-0.5" />
                    )}

                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={e => handleSelectItem(template.id, e.target.checked)}
                      className="w-3.5 h-3.5 text-[var(--color-primary)] border-[var(--color-border)] rounded-sm cursor-pointer shrink-0"
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

                  {/* Right operations: Three-dots Dropdown Menu */}
                  <div className="flex items-center shrink-0">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton
                          icon={<MoreVertical size={14} />}
                          label="More actions"
                          variant="ghost"
                          size="sm"
                          onClick={e => e.stopPropagation()}
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEditTemplate(template)}>
                          <Edit2 className="w-3.5 h-3.5 mr-2 opacity-70" />
                          Edit Activity
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(template.id)}>
                          <Copy className="w-3.5 h-3.5 mr-2 opacity-70" />
                          Duplicate Activity
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleArchive(template)}>
                          {isTemplateActive ? (
                            <>
                              <EyeOff className="w-3.5 h-3.5 mr-2 opacity-70" />
                              Archive Activity
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5 mr-2 opacity-70" />
                              Restore Activity
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="danger"
                          onClick={() => handleDelete(template.id, template.name)}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                          Delete Activity
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            }}
          />
        </div>
      )}
    </div>
  )
}

