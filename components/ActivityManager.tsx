"use client"

import React, { useState } from 'react'
import { ActivityTemplate, RecurrenceAnalysis } from '@/types'
import { deleteActivityTemplate, duplicateActivityTemplate, updateActivityTemplate, reorderActivityTemplates } from '@/app/actions/template'
import { Icon } from './Icon'
import { Plus, ArrowUp, ArrowDown, Edit2, Copy, Check, Trash2, Settings, EyeOff } from 'lucide-react'

interface ActivityManagerProps {
  analyzedTemplates: { template: ActivityTemplate; analysis: RecurrenceAnalysis }[]
  onAddTemplate: () => void
  onEditTemplate: (template: ActivityTemplate) => void
}

export const ActivityManager: React.FC<ActivityManagerProps> = ({
  analyzedTemplates,
  onAddTemplate,
  onEditTemplate,
}) => {
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  // Reorder templates
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= templates.length) return

    const item = templates[index]
    setIsProcessing(item.id)

    const reordered = [...templates]
    // Swap
    reordered[index] = reordered[newIndex]
    reordered[newIndex] = item

    const ids = reordered.map(t => t.id)
    await reorderActivityTemplates(ids)
    setIsProcessing(null)
  }

  // Toggle archive state
  const handleToggleArchive = async (template: ActivityTemplate) => {
    setIsProcessing(template.id)
    await updateActivityTemplate(template.id, { isActive: !template.isActive })
    setIsProcessing(null)
  }

  // Duplicate template
  const handleDuplicate = async (id: string) => {
    setIsProcessing(id)
    await duplicateActivityTemplate(id)
    setIsProcessing(null)
  }

  // Delete template
  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"? This will also delete all of its log entries and cannot be undone.`)) {
      setIsProcessing(id)
      await deleteActivityTemplate(id)
      setIsProcessing(null)
    }
  }

  const templates = analyzedTemplates.map(a => a.template)
  const activeTemplates = analyzedTemplates.filter(item => item.template.isActive)
  const archivedTemplates = analyzedTemplates.filter(item => !item.template.isActive)
  
  const displayTemplates = showArchived ? analyzedTemplates : activeTemplates

  return (
    <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-5 md:p-6 space-y-6 shadow-xs">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings size={18} className="text-slate-400 dark:text-zinc-400" />
            Activity Templates ({activeTemplates.length})
          </h2>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">Manage activity configuration, ordering, and archival</p>
        </div>

        <button
          onClick={onAddTemplate}
          className="bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
        >
          <Plus size={14} /> New Activity
        </button>
      </div>

      {/* Tabs / Filters */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowArchived(false)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
            !showArchived
              ? 'bg-slate-100 border-slate-200 dark:bg-zinc-900 dark:border-zinc-800 text-slate-900 dark:text-white'
              : 'text-slate-400 border-transparent hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300'
          }`}
        >
          Active ({activeTemplates.length})
        </button>
        <button
          onClick={() => setShowArchived(true)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
            showArchived
              ? 'bg-slate-100 border-slate-200 dark:bg-zinc-900 dark:border-zinc-800 text-slate-900 dark:text-white'
              : 'text-slate-400 border-transparent hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300'
          }`}
        >
          All (with Archived: {archivedTemplates.length})
        </button>
      </div>

      {/* Templates List */}
      {displayTemplates.length === 0 ? (
        <div className="p-8 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl text-center text-slate-400 dark:text-zinc-550 text-xs italic">
          No templates found.
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayTemplates.map((item, idx) => {
            const { template, analysis } = item
            const isFirst = idx === 0
            const isLast = idx === displayTemplates.length - 1
            const isTemplateActive = template.isActive

            return (
              <div
                key={template.id}
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all shadow-xs ${
                  isTemplateActive
                    ? 'bg-slate-50/50 dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:bg-zinc-800'
                    : 'bg-slate-100/30 dark:bg-zinc-900/20 border-slate-200 dark:border-zinc-900/60 opacity-50 text-slate-400 dark:text-zinc-500'
                }`}
              >
                {/* Details */}
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-900 text-${
                      isTemplateActive ? template.color : 'zinc'
                    }-550 dark:text-${isTemplateActive ? template.color : 'zinc'}-400`}
                  >
                    <Icon name={template.icon} size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 dark:text-white text-sm">
                        {template.name}
                      </span>
                      {!isTemplateActive && (
                        <span className="bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 text-[8px] px-1.5 py-0.5 rounded font-mono uppercase font-bold tracking-wider">
                          Archived
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5 capitalize font-medium flex flex-wrap items-center gap-1.5">
                      <span className="bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-1.5 py-0.5 rounded text-[9px] font-bold">
                        {template.recurrenceType}
                      </span>
                      <span>•</span>
                      <span>{template.category}</span>
                      {template.amount !== null && (
                        <>
                          <span>•</span>
                          <span className="text-green-600 dark:text-green-400 font-bold">₹{template.amount.toFixed(2)}</span>
                        </>
                      )}
                      <span>•</span>
                      {analysis.daysSinceLast !== null ? (
                        <span className="text-slate-550 dark:text-zinc-400 font-bold">
                          Last done: {analysis.daysSinceLast === 0 ? 'Today' : `${analysis.daysSinceLast} days ago`}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-zinc-600 italic">
                          Never completed
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Operations */}
                <div className="flex items-center justify-end gap-1.5 mt-2 sm:mt-0">
                  {/* Reordering */}
                  {isTemplateActive && !showArchived && (
                    <div className="flex bg-white border border-slate-200 dark:bg-zinc-950 dark:border-zinc-800 rounded-lg p-0.5 mr-1.5 shadow-xs">
                      <button
                        type="button"
                        onClick={() => handleMove(idx, 'up')}
                        disabled={isFirst || isProcessing === template.id}
                        className="p-1 hover:text-slate-900 dark:hover:text-white text-slate-400 dark:text-zinc-500 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-900 disabled:opacity-20 transition-colors cursor-pointer"
                        title="Move Up"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(idx, 'down')}
                        disabled={isLast || isProcessing === template.id}
                        className="p-1 hover:text-slate-900 dark:hover:text-white text-slate-400 dark:text-zinc-500 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-900 disabled:opacity-20 transition-colors cursor-pointer"
                        title="Move Down"
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>
                  )}

                  {/* Actions Row */}
                  <div className="flex items-center gap-1 bg-slate-50/50 p-1 border border-slate-200 dark:bg-zinc-950/40 dark:border-zinc-800/60 rounded-lg shadow-xs">
                    <button
                      type="button"
                      onClick={() => onEditTemplate(template)}
                      disabled={isProcessing === template.id}
                      className="p-1.5 text-slate-400 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                      title="Edit template"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(template.id)}
                      disabled={isProcessing === template.id}
                      className="p-1.5 text-slate-400 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                      title="Duplicate template"
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleArchive(template)}
                      disabled={isProcessing === template.id}
                      className={`p-1.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer ${
                        isTemplateActive ? 'text-slate-400 hover:text-yellow-600 dark:text-zinc-400 dark:hover:text-yellow-400' : 'text-yellow-605 hover:text-green-650 dark:text-yellow-400 dark:hover:text-green-400'
                      }`}
                      title={isTemplateActive ? 'Archive template' : 'Unarchive template'}
                    >
                      {isTemplateActive ? <EyeOff size={13} /> : <Check size={13} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(template.id, template.name)}
                      disabled={isProcessing === template.id}
                      className="p-1.5 text-slate-400 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400 rounded hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                      title="Delete template"
                    >
                      <Trash2 size={13} />
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
