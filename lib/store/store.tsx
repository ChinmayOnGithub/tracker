/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
// lib/store/store.tsx
"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { ActivityTemplate, ActivityLog, Note, TimelineItem, AnalyzedTemplate } from '@/types'
import { writeQueue } from './write-queue'

export interface JournalEntry {
  id: string
  journalDate: Date | string
  content: string
  mood: string | null
  gratitude: string | null
  reflections: string | null
  lessonsLearned: string | null
  tomorrowPlan: string | null
  metadata?: any | null
  createdAt: Date | string
  updatedAt: Date | string
  deletedAt?: Date | string | null
}

export interface WeightRecord {
  id: string
  userId: string
  weight: number
  date: string | Date
  notes: string | null
  createdAt: string | Date
  updatedAt: string | Date
  deletedAt?: string | Date | null
}

export interface LeaveRecord {
  id: string
  userId: string
  leaveType: string
  startDate: string | Date
  endDate: string | Date
  totalDays: number
  status: string
  notes: string | null
  createdAt: string | Date
  updatedAt: string | Date
  deletedAt?: string | Date | null
}

export interface LeaveAllowance {
  id: string
  userId: string
  year: number
  leaveType: string
  allowance: number
}

export interface VaultItem {
  id: string
  name: string
  isFolder: boolean
  parentId: string | null
  size?: number | null
  mimeType?: string | null
  mimeGroup?: string | null
  s3Key?: string | null
  updatedAt: string | Date
  createdAt: string | Date
}

export interface LinkItem {
  id: string
  title: string
  url: string
  description: string | null
  collectionId: string | null
  clicks: number
  isStarred: boolean
  createdAt: string | Date
  updatedAt: string | Date
  deletedAt?: string | Date | null
}

export interface LinkCollection {
  id: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  createdAt: string | Date
  updatedAt: string | Date
  deletedAt?: string | Date | null
  links?: LinkItem[]
}

export interface CalendarData {
  connected: boolean
  agenda: {
    today: any[]
    tomorrow: any[]
    upcoming: any[]
  } | null
  error: string | null
  loading: boolean
}

interface StoreState {
  templates: ActivityTemplate[]
  logs: ActivityLog[]
  notes: Note[]
  journalEntries: JournalEntry[]
  weightRecords: WeightRecord[]
  leaveRecords: LeaveRecord[]
  leaveAllowances: LeaveAllowance[]
  vaultItems: VaultItem[]
  links: LinkItem[]
  collections: LinkCollection[]
  calendarData: CalendarData
}

interface StoreContextType {
  state: StoreState
  isSyncing: boolean
  initialize: (initialData: Partial<StoreState>) => void
  
  // Calendar Actions
  cycleTaskStatusAction: (occurrence: TimelineItem, todayStr: string, payload?: any) => Promise<void>
  setTaskStatusAction: (occurrence: TimelineItem, todayStr: string, status: 'cleared' | 'done' | 'skipped' | 'postponed', payload?: any) => Promise<void>
  deleteActivityLog: (logId: string) => Promise<void>
  postponeOneTimeTaskAction: (templateId: string, date: string, logId: string | null) => Promise<void>
  unpostponeOneTimeTaskAction: (templateId: string, logId: string, originalDate: string) => Promise<void>
  createActivityTemplateAction: (templateData: any) => Promise<void>
  reorderActivityTemplatesAction: (orderedIds: string[]) => Promise<void>
  logWorkPresenceAction: (fields: any) => Promise<void>
  
  // Note Actions
  upsertNoteAction: (dateStr: string, content: string, title?: string | null, noteId?: string) => Promise<void>
  deleteNoteAction: (noteId: string) => Promise<void>

  // Leave Allowance Actions
  updateLeaveAllowanceAction: (leaveType: string, year: number, val: number) => Promise<void>
  ensureLeaveAllowancesAction: (year: number) => Promise<void>

  // Journal Actions
  upsertJournalAction: (date: string, fields: any) => Promise<void>
  deleteJournalAction: (id: string) => Promise<void>

  // Weight Actions
  logWeightAction: (date: string, weight: number, note?: string | null) => Promise<void>
  deleteWeightAction: (id: string) => Promise<void>

  // Leave Actions
  createLeaveRecordAction: (record: any) => Promise<void>
  updateLeaveRecordAction: (id: string, status: any) => Promise<void>
  deleteLeaveRecordAction: (id: string) => Promise<void>

  // Links Actions
  createLinkAction: (collectionId: string, link: any) => Promise<void>
  updateLinkAction: (id: string, link: any) => Promise<void>
  deleteLinkAction: (id: string) => Promise<void>
  createCollectionAction: (collection: any) => Promise<void>
  updateCollectionAction: (id: string, collection: any) => Promise<void>
  deleteCollectionAction: (id: string) => Promise<void>

  // Vault Actions
  createVaultFolderAction: (name: string, parentId: string | null) => Promise<void>
  deleteVaultItemAction: (id: string) => Promise<void>
  renameVaultItemAction: (id: string, name: string) => Promise<void>
}

const defaultState: StoreState = {
  templates: [],
  logs: [],
  notes: [],
  journalEntries: [],
  weightRecords: [],
  leaveRecords: [],
  leaveAllowances: [],
  vaultItems: [],
  links: [],
  collections: [],
  calendarData: {
    connected: false,
    agenda: null,
    error: null,
    loading: false
  }
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<StoreState>(defaultState)
  const [isSyncing, setIsSyncing] = useState(false)

  // Track queue sync status
  useEffect(() => {
    const unsub = writeQueue.subscribe(() => {
      setIsSyncing(writeQueue.getStatus() === 'saving')
    })
    return () => {
      unsub()
    }
  }, [])

  const initialize = useCallback((initialData: Partial<StoreState>) => {
    setState(prev => {
      const next = { ...prev }
      Object.keys(initialData).forEach(key => {
        const k = key as keyof StoreState
        if (initialData[k] !== undefined) {
          (next as any)[k] = initialData[k]
        }
      })
      return next
    })
  }, [])

  // --- CALENDAR ACTIONS ---
  const cycleTaskStatusAction = async (occurrence: TimelineItem, todayStr: string, payload?: any) => {
    if (!occurrence.templateId) return

    const templateId = occurrence.templateId
    const currentCompleted = occurrence.completed
    const currentStatus = occurrence.status
    const logId = occurrence.logId

    const isCanceled = currentStatus === 'skipped'
    const isPostponed = currentStatus === 'postponed'
    const isDone = currentCompleted && !isCanceled && !isPostponed

    let nextCompleted = false
    let nextStatus: string | undefined = undefined

    const matched = state.templates.find(t => t.id === templateId)
    const isDaily = matched?.recurrenceType === 'daily'
    const isOneTime = matched?.recurrenceType === 'one_time'

    // Cycle state logic
    if (!currentCompleted && !isCanceled && !isPostponed) {
      nextCompleted = true
      nextStatus = matched?.category === 'finance' ? 'paid' : 'done'
    } else if (isDone) {
      nextCompleted = true
      nextStatus = 'skipped'
    } else if (isCanceled) {
      if (isDaily) {
        nextCompleted = false
        nextStatus = undefined
      } else {
        nextCompleted = true
        nextStatus = 'postponed'
      }
    } else if (isPostponed) {
      nextCompleted = false
      nextStatus = undefined
    }

    // Capture current logs state for rollback
    const previousLogs = [...state.logs]

    // Apply Optimistic Update to Local State
    setState(prev => {
      let updatedLogs = [...prev.logs]
      
      const resolvedAmount = (payload && typeof payload.value === 'number') ? payload.value : (matched?.amount || null)

      if (logId) {
        if (nextCompleted === false && nextStatus === undefined && isDaily) {
          // Cleared - daily deletes log
          updatedLogs = updatedLogs.filter(l => l.id !== logId)
        } else {
          updatedLogs = updatedLogs.map(l => 
            l.id === logId ? { ...l, status: nextStatus || 'done', amount: resolvedAmount, payload: payload || l.payload } : l
          )
        }
      } else {
        // Create an optimistic log
        const tempId = `temp-log-${Date.now()}`
        updatedLogs.push({
          id: tempId,
          activityId: templateId,
          date: todayStr,
          status: nextStatus || 'done',
          note: null,
          amount: resolvedAmount,
          payload: payload || null,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      }

      return { ...prev, logs: updatedLogs }
    })

    // Queue background server update
    writeQueue.add({
      id: `task-cycle-${templateId}-${Date.now()}`,
      dedupKey: `task-cycle-${templateId}-${todayStr}`,
      run: async () => {
        const { markComplete, updateLog, deleteLog, postponeOneTimeTask } = await import('@/app/actions/log')
        const resolvedAmount = (payload && typeof payload.value === 'number') ? payload.value : (matched?.amount || null)
        
        if (!currentCompleted && !isCanceled && !isPostponed) {
          return markComplete(templateId, todayStr, nextStatus || 'done', resolvedAmount, payload || null)
        } else if (isDone) {
          if (logId) return updateLog(logId, { status: 'skipped' })
          return markComplete(templateId, todayStr, 'skipped')
        } else if (isCanceled) {
          if (isDaily) {
            if (logId) return deleteLog(logId)
            return { success: true }
          } else if (isOneTime) {
            return postponeOneTimeTask(templateId, todayStr, logId || undefined)
          } else {
            if (logId) return updateLog(logId, { status: 'postponed' })
            return markComplete(templateId, todayStr, 'postponed')
          }
        } else {
          // Postponed -> Cleared
          if (logId) return deleteLog(logId)
          return { success: true }
        }
      },
      rollback: () => {
        setState(prev => ({ ...prev, logs: previousLogs }))
      }
    })
  }

  const setTaskStatusAction = async (
    occurrence: TimelineItem,
    todayStr: string,
    targetStatus: 'cleared' | 'done' | 'skipped' | 'postponed',
    payload?: any
  ) => {
    if (!occurrence.templateId) return

    const templateId = occurrence.templateId
    const logId = occurrence.logId

    const matched = state.templates.find(t => t.id === templateId)
    const isDaily = matched?.recurrenceType === 'daily'
    const isOneTime = matched?.recurrenceType === 'one_time'

    let nextCompleted = false
    let nextStatus: string | undefined = undefined

    if (targetStatus === 'done') {
      nextCompleted = true
      nextStatus = matched?.category === 'finance' ? 'paid' : 'done'
    } else if (targetStatus === 'skipped') {
      nextCompleted = true
      nextStatus = 'skipped'
    } else if (targetStatus === 'postponed') {
      nextCompleted = true
      nextStatus = 'postponed'
    } else if (targetStatus === 'cleared') {
      nextCompleted = false
      nextStatus = undefined
    }

    // Capture current logs state for rollback
    const previousLogs = [...state.logs]

    let tempId: string | null = null

    // Apply Optimistic Update to Local State
    setState(prev => {
      let updatedLogs = [...prev.logs]
      const resolvedAmount = (payload && typeof payload.value === 'number') ? payload.value : (matched?.amount || null)

      if (logId) {
        if (targetStatus === 'cleared' && isDaily) {
          // Cleared - daily deletes log
          updatedLogs = updatedLogs.filter(l => l.id !== logId)
        } else {
          updatedLogs = updatedLogs.map(l => 
            l.id === logId ? { ...l, status: nextStatus || 'done', amount: resolvedAmount, payload: payload || l.payload } : l
          )
        }
      } else if (targetStatus !== 'cleared') {
        // Create an optimistic log
        tempId = `temp-log-${Date.now()}`
        updatedLogs.push({
          id: tempId,
          activityId: templateId,
          date: todayStr,
          status: nextStatus || 'done',
          note: null,
          amount: resolvedAmount,
          payload: payload || null,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      }

      return { ...prev, logs: updatedLogs }
    })

    // Queue background server update
    writeQueue.add({
      id: `task-set-${templateId}-${Date.now()}`,
      dedupKey: `task-set-${templateId}-${todayStr}`,
      run: async () => {
        const { markComplete, updateLog, deleteLog, postponeOneTimeTask } = await import('@/app/actions/log')
        const resolvedAmount = (payload && typeof payload.value === 'number') ? payload.value : (matched?.amount || null)
        
        let res: any
        if (targetStatus === 'done') {
          res = await markComplete(templateId, todayStr, nextStatus || 'done', resolvedAmount, payload || null)
        } else if (targetStatus === 'skipped') {
          if (logId && !logId.startsWith('temp-')) {
            res = await updateLog(logId, { status: 'skipped' })
          } else {
            res = await markComplete(templateId, todayStr, 'skipped')
          }
        } else if (targetStatus === 'postponed') {
          if (isOneTime) {
            res = await postponeOneTimeTask(templateId, todayStr, (logId && !logId.startsWith('temp-')) ? logId : undefined)
          } else {
            if (logId && !logId.startsWith('temp-')) {
              res = await updateLog(logId, { status: 'postponed' })
            } else {
              res = await markComplete(templateId, todayStr, 'postponed')
            }
          }
        } else {
          // targetStatus === 'cleared'
          if (logId && !logId.startsWith('temp-')) {
            res = await deleteLog(logId)
          } else {
            res = { success: true }
          }
        }

        // Replace optimistic tempId with real database ID
        if (tempId && res?.success && res?.data) {
          setState(prev => ({
            ...prev,
            logs: prev.logs.map(l => l.id === tempId ? (res.data as any) : l)
          }))
        }

        return res
      },
      rollback: () => {
        setState(prev => ({ ...prev, logs: previousLogs }))
      }
    })
  }

  const deleteActivityLog = async (logId: string) => {
    const previousLogs = [...state.logs]
    setState(prev => ({ ...prev, logs: prev.logs.filter(l => l.id !== logId) }))

    writeQueue.add({
      id: `log-delete-${logId}`,
      dedupKey: `log-delete-${logId}`,
      run: async () => {
        const { deleteLog } = await import('@/app/actions/log')
        return deleteLog(logId)
      },
      rollback: () => {
        setState(prev => ({ ...prev, logs: previousLogs }))
      }
    })
  }

  const postponeOneTimeTaskAction = async (templateId: string, date: string, logId: string | null) => {
    const previousLogs = [...state.logs]
    const previousTemplates = [...state.templates]

    setState(prev => {
      // Find and update template targetDate (postpone to tomorrow)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowStr = tomorrow.toISOString().split('T')[0]

      return {
        ...prev,
        templates: prev.templates.map(t => t.id === templateId ? { ...t, targetDate: tomorrowStr } : t),
        logs: logId ? prev.logs.filter(l => l.id !== logId) : prev.logs
      }
    })

    writeQueue.add({
      id: `postpone-ot-${templateId}`,
      dedupKey: `postpone-ot-${templateId}`,
      run: async () => {
        const { postponeOneTimeTask } = await import('@/app/actions/log')
        return postponeOneTimeTask(templateId, date, logId || undefined)
      },
      rollback: () => {
        setState(prev => ({ ...prev, logs: previousLogs, templates: previousTemplates }))
      }
    })
  }

  const unpostponeOneTimeTaskAction = async (templateId: string, logId: string, originalDate: string) => {
    const previousLogs = [...state.logs]
    setState(prev => ({ ...prev, logs: prev.logs.filter(l => l.id !== logId) }))

    writeQueue.add({
      id: `unpostpone-ot-${templateId}`,
      dedupKey: `unpostpone-ot-${templateId}`,
      run: async () => {
        const { unpostponeOneTimeTask } = await import('@/app/actions/log')
        return unpostponeOneTimeTask(templateId, logId, originalDate)
      },
      rollback: () => {
        setState(prev => ({ ...prev, logs: previousLogs }))
      }
    })
  }

  const createActivityTemplateAction = async (templateData: any) => {
    const previousTemplates = [...state.templates]
    const tempId = `temp-template-${Date.now()}`
    
    const newTemplate: ActivityTemplate = {
      id: tempId,
      name: templateData.name,
      category: templateData.category || 'general',
      type: templateData.type || 'TASK',
      priority: templateData.priority || 'NORMAL',
      estimatedDuration: templateData.estimatedDuration || 0,
      energyRequired: 'NORMAL',
      calendarProvider: 'NONE',
      calendarEventId: null,
      notificationRules: null,
      icon: templateData.icon || 'CheckSquare',
      color: templateData.color || 'blue',
      isActive: true,
      notes: null,
      amount: null,
      sortOrder: state.templates.length,
      recurrenceType: templateData.recurrenceType || 'one_time',
      recurrenceInterval: null,
      recurrenceDaysOfWeek: null,
      recurrenceDayOfMonth: null,
      recurrenceMonth: null,
      targetDate: templateData.targetDate || null,
      remindBeforeDays: null,
      metadata: null,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      effectiveFrom: templateData.targetDate ? new Date(templateData.targetDate) : new Date()
    }

    setState(prev => ({
      ...prev,
      templates: [...prev.templates, newTemplate]
    }))

    writeQueue.add({
      id: `template-create-${tempId}`,
      dedupKey: `template-create-${tempId}`,
      run: async () => {
        const { createActivityTemplate } = await import('@/app/actions/template')
        const res = await createActivityTemplate(templateData)
        if (res.success && res.data) {
          // Replace the temporary ID in templates and logs
          setState(prev => ({
            ...prev,
            templates: prev.templates.map(t => t.id === tempId ? (res.data as unknown as ActivityTemplate) : t)
          }))
        }
        return res
      },
      rollback: () => {
        setState(prev => ({ ...prev, templates: previousTemplates }))
      }
    })
  }

  const reorderActivityTemplatesAction = async (orderedIds: string[]) => {
    const previousTemplates = [...state.templates]

    setState(prev => ({
      ...prev,
      templates: prev.templates.map(t => {
        const idx = orderedIds.indexOf(t.id)
        if (idx !== -1) {
          return { ...t, sortOrder: idx }
        }
        return t
      })
    }))

    writeQueue.add({
      id: `templates-reorder-${Date.now()}`,
      dedupKey: `templates-reorder-unique`,
      run: async () => {
        const { reorderActivityTemplates } = await import('@/app/actions/template')
        return reorderActivityTemplates(orderedIds)
      },
      rollback: () => {
        setState(prev => ({ ...prev, templates: previousTemplates }))
      }
    })
  }

  const logWorkPresenceAction = async (fields: any) => {
    const previousLogs = [...state.logs]
    
    setState(prev => {
      let updatedLogs = [...prev.logs]
      const existingLog = prev.logs.find(l => l.activityId === fields.templateId && l.date === fields.date)
      
      if (fields.status === 'cleared') {
        updatedLogs = updatedLogs.filter(l => l.id !== existingLog?.id)
      } else {
        const payload = {
          inTime: fields.inTime,
          outTime: fields.outTime,
          loggingMode: fields.loggingMode,
          manualHours: fields.manualHours
        }
        
        if (existingLog) {
          updatedLogs = updatedLogs.map(l => 
            l.id === existingLog.id 
              ? { ...l, status: fields.status === 'office' ? 'done' : 'wfh', amount: fields.hours, payload } 
              : l
          )
        } else {
          updatedLogs.push({
            id: `temp-work-${Date.now()}`,
            activityId: fields.templateId,
            date: fields.date,
            status: fields.status === 'office' ? 'done' : 'wfh',
            note: null,
            amount: fields.hours,
            payload,
            createdAt: new Date(),
            updatedAt: new Date()
          })
        }
      }
      return { ...prev, logs: updatedLogs }
    })

    writeQueue.add({
      id: `work-presence-${fields.templateId}-${Date.now()}`,
      dedupKey: `work-presence-${fields.templateId}-${fields.date}`,
      run: async () => {
        const { logWorkPresence } = await import('@/app/actions/log')
        return logWorkPresence(fields)
      },
      rollback: () => {
        setState(prev => ({ ...prev, logs: previousLogs }))
      }
    })
  }

  const upsertNoteAction = async (dateStr: string, content: string, title?: string | null, noteId?: string) => {
    const previousNotes = [...state.notes]

    setState(prev => {
      let updatedNotes = [...prev.notes]
      const existing = noteId ? prev.notes.find(n => n.id === noteId) : prev.notes.find(n => n.date === dateStr)

      if (existing) {
        updatedNotes = updatedNotes.map(n => n.id === existing.id ? { ...n, content, title: title || null, updatedAt: new Date() } : n)
      } else {
        updatedNotes.push({
          id: noteId || `temp-note-${Date.now()}`,
          date: dateStr,
          title: title || null,
          content,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      }
      return { ...prev, notes: updatedNotes }
    })

    writeQueue.add({
      id: `note-upsert-${dateStr}-${Date.now()}`,
      dedupKey: `note-upsert-${dateStr}`,
      run: async () => {
        const { createNote, updateNote } = await import('@/app/actions/note')
        if (noteId) {
          return updateNote(noteId, content, title || null)
        } else {
          const res = await createNote(dateStr, content, title || null)
          if (res.success && res.note) {
            setState(prev => ({
              ...prev,
              notes: prev.notes.map(n => n.date === dateStr ? (res.note as Note) : n)
            }))
          }
          return res
        }
      },
      rollback: () => {
        setState(prev => ({ ...prev, notes: previousNotes }))
      }
    })
  }

  const deleteNoteAction = async (noteId: string) => {
    const previousNotes = [...state.notes]
    setState(prev => ({ ...prev, notes: prev.notes.filter(n => n.id !== noteId) }))

    writeQueue.add({
      id: `note-delete-${noteId}`,
      dedupKey: `note-delete-${noteId}`,
      run: async () => {
        const { deleteNote } = await import('@/app/actions/note')
        return deleteNote(noteId)
      },
      rollback: () => {
        setState(prev => ({ ...prev, notes: previousNotes }))
      }
    })
  }

  const updateLeaveAllowanceAction = async (leaveType: string, year: number, val: number) => {
    const previousAllowances = [...state.leaveAllowances]
    setState(prev => ({
      ...prev,
      leaveAllowances: prev.leaveAllowances.map(a => a.leaveType === leaveType ? { ...a, allowance: val } : a)
    }))

    writeQueue.add({
      id: `leave-allowance-update-${leaveType}-${year}`,
      dedupKey: `leave-allowance-update-${leaveType}-${year}`,
      run: async () => {
        const { updateLeaveAllowance } = await import('@/app/actions/leave')
        return updateLeaveAllowance(leaveType as any, year, val)
      },
      rollback: () => {
        setState(prev => ({ ...prev, leaveAllowances: previousAllowances }))
      }
    })
  }

  const ensureLeaveAllowancesAction = async (year: number) => {
    const { ensureLeaveAllowances, getLeaveAllowances } = await import('@/app/actions/leave')
    await ensureLeaveAllowances(year)
    const res = await getLeaveAllowances(year)
    if (res.success && res.allowances) {
      setState(prev => ({ ...prev, leaveAllowances: res.allowances as any[] }))
    }
  }

  // --- JOURNAL ACTIONS ---
  const upsertJournalAction = async (date: string, fields: any) => {
    const previousJournal = [...state.journalEntries]

    setState(prev => {
      const existing = prev.journalEntries.find(e => {
        const entryDate = typeof e.journalDate === 'string' ? e.journalDate.split('T')[0] : e.journalDate.toISOString().split('T')[0]
        return entryDate === date
      })

      let updated = [...prev.journalEntries]
      if (existing) {
        updated = updated.map(e => e.id === existing.id ? { ...e, ...fields, updatedAt: new Date().toISOString() } : e)
      } else {
        updated.push({
          id: `temp-jr-${Date.now()}`,
          journalDate: new Date(`${date}T12:00:00.000Z`).toISOString(),
          content: fields.content || '',
          mood: fields.mood || null,
          gratitude: fields.gratitude || null,
          reflections: fields.reflections || null,
          lessonsLearned: fields.lessonsLearned || null,
          tomorrowPlan: fields.tomorrowPlan || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      }
      return { ...prev, journalEntries: updated }
    })

    writeQueue.add({
      id: `journal-upsert-${date}-${Date.now()}`,
      dedupKey: `journal-upsert-${date}`,
      run: async () => {
        const { upsertJournalEntry } = await import('@/app/actions/journal')
        return upsertJournalEntry(date, fields)
      },
      rollback: () => {
        setState(prev => ({ ...prev, journalEntries: previousJournal }))
      }
    })
  }

  const deleteJournalAction = async (id: string) => {
    const previousJournal = [...state.journalEntries]
    setState(prev => ({ ...prev, journalEntries: prev.journalEntries.filter(e => e.id !== id) }))

    writeQueue.add({
      id: `journal-delete-${id}`,
      dedupKey: `journal-delete-${id}`,
      run: async () => {
        const { deleteJournalEntry } = await import('@/app/actions/journal')
        return deleteJournalEntry(id)
      },
      rollback: () => {
        setState(prev => ({ ...prev, journalEntries: previousJournal }))
      }
    })
  }

  // --- WEIGHT ACTIONS ---
  const logWeightAction = async (date: string, weight: number, note?: string | null) => {
    const previousWeight = [...state.weightRecords]

    setState(prev => {
      const nextRecords = [...prev.weightRecords]
      nextRecords.push({
        id: `temp-wt-${Date.now()}`,
        userId: '',
        weight,
        date,
        notes: note || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      return { ...prev, weightRecords: nextRecords }
    })

    writeQueue.add({
      id: `weight-log-${Date.now()}`,
      dedupKey: `weight-log-${date}`,
      run: async () => {
        const { logWeight } = await import('@/app/actions/weight')
        return logWeight(date, weight, note)
      },
      rollback: () => {
        setState(prev => ({ ...prev, weightRecords: previousWeight }))
      }
    })
  }

  const deleteWeightAction = async (id: string) => {
    const previousWeight = [...state.weightRecords]
    setState(prev => ({ ...prev, weightRecords: prev.weightRecords.filter(r => r.id !== id) }))

    writeQueue.add({
      id: `weight-delete-${id}`,
      dedupKey: `weight-delete-${id}`,
      run: async () => {
        const { deleteWeightRecord } = await import('@/app/actions/weight')
        return deleteWeightRecord(id)
      },
      rollback: () => {
        setState(prev => ({ ...prev, weightRecords: previousWeight }))
      }
    })
  }

  // --- LEAVE ACTIONS ---
  const createLeaveRecordAction = async (record: any) => {
    const previousLeaves = [...state.leaveRecords]
    const tempId = `temp-lv-${Date.now()}`

    setState(prev => ({
      ...prev,
      leaveRecords: [
        {
          id: tempId,
          userId: '',
          leaveType: record.leaveType,
          startDate: record.startDate,
          endDate: record.endDate,
          totalDays: record.totalDays || 1,
          status: 'PENDING',
          notes: record.notes || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        ...prev.leaveRecords
      ]
    }))

    writeQueue.add({
      id: `leave-create-${tempId}`,
      dedupKey: `leave-create-${tempId}`,
      run: async () => {
        const { createLeaveRequest } = await import('@/app/actions/leave')
        return createLeaveRequest(record)
      },
      rollback: () => {
        setState(prev => ({ ...prev, leaveRecords: previousLeaves }))
      }
    })
  }

  const updateLeaveRecordAction = async (id: string, status: any) => {
    const previousLeaves = [...state.leaveRecords]

    setState(prev => ({
      ...prev,
      leaveRecords: prev.leaveRecords.map(l => l.id === id ? { ...l, status } : l)
    }))

    writeQueue.add({
      id: `leave-update-${id}`,
      dedupKey: `leave-update-${id}`,
      run: async () => {
        const { updateLeaveStatus } = await import('@/app/actions/leave')
        return updateLeaveStatus(id, status)
      },
      rollback: () => {
        setState(prev => ({ ...prev, leaveRecords: previousLeaves }))
      }
    })
  }

  const deleteLeaveRecordAction = async (id: string) => {
    const previousLeaves = [...state.leaveRecords]

    setState(prev => ({
      ...prev,
      leaveRecords: prev.leaveRecords.filter(l => l.id !== id)
    }))

    writeQueue.add({
      id: `leave-delete-${id}`,
      dedupKey: `leave-delete-${id}`,
      run: async () => {
        const { deleteLeaveRecord } = await import('@/app/actions/leave')
        return deleteLeaveRecord(id)
      },
      rollback: () => {
        setState(prev => ({ ...prev, leaveRecords: previousLeaves }))
      }
    })
  }

  // --- LINKS ACTIONS ---
  const createLinkAction = async (collectionId: string, link: any) => {
    const previousLinks = [...state.links]
    const tempId = `temp-lk-${Date.now()}`

    setState(prev => ({
      ...prev,
      links: [
        {
          id: tempId,
          title: link.title,
          url: link.url,
          description: link.description || null,
          collectionId,
          clicks: 0,
          isStarred: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        ...prev.links
      ]
    }))

    writeQueue.add({
      id: `link-create-${tempId}`,
      dedupKey: `link-create-${tempId}`,
      run: async () => {
        const { createLink } = await import('@/app/actions/links')
        return createLink(collectionId, link)
      },
      rollback: () => {
        setState(prev => ({ ...prev, links: previousLinks }))
      }
    })
  }

  const updateLinkAction = async (id: string, link: any) => {
    const previousLinks = [...state.links]

    setState(prev => ({
      ...prev,
      links: prev.links.map(l => l.id === id ? { ...l, ...link } : l)
    }))

    writeQueue.add({
      id: `link-update-${id}`,
      dedupKey: `link-update-${id}`,
      run: async () => {
        const { updateLink } = await import('@/app/actions/links')
        return updateLink(id, link)
      },
      rollback: () => {
        setState(prev => ({ ...prev, links: previousLinks }))
      }
    })
  }

  const deleteLinkAction = async (id: string) => {
    const previousLinks = [...state.links]

    setState(prev => ({
      ...prev,
      links: prev.links.filter(l => l.id !== id)
    }))

    writeQueue.add({
      id: `link-delete-${id}`,
      dedupKey: `link-delete-${id}`,
      run: async () => {
        const { deleteLink } = await import('@/app/actions/links')
        return deleteLink(id)
      },
      rollback: () => {
        setState(prev => ({ ...prev, links: previousLinks }))
      }
    })
  }

  const createCollectionAction = async (collection: any) => {
    const previousCols = [...state.collections]
    const tempId = `temp-cl-${Date.now()}`

    setState(prev => ({
      ...prev,
      collections: [
        {
          id: tempId,
          name: collection.name,
          description: collection.description || null,
          icon: collection.icon || null,
          color: collection.color || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        ...prev.collections
      ]
    }))

    writeQueue.add({
      id: `col-create-${tempId}`,
      dedupKey: `col-create-${tempId}`,
      run: async () => {
        const { createLinkCollection } = await import('@/app/actions/links')
        return createLinkCollection(collection.name, collection.color, collection.icon)
      },
      rollback: () => {
        setState(prev => ({ ...prev, collections: previousCols }))
      }
    })
  }

  const updateCollectionAction = async (id: string, collection: any) => {
    const previousCols = [...state.collections]

    setState(prev => ({
      ...prev,
      collections: prev.collections.map(c => c.id === id ? { ...c, ...collection } : c)
    }))

    writeQueue.add({
      id: `col-update-${id}`,
      dedupKey: `col-update-${id}`,
      run: async () => {
        const { updateLinkCollection } = await import('@/app/actions/links')
        return updateLinkCollection(id, collection)
      },
      rollback: () => {
        setState(prev => ({ ...prev, collections: previousCols }))
      }
    })
  }

  const deleteCollectionAction = async (id: string) => {
    const previousCols = [...state.collections]

    setState(prev => ({
      ...prev,
      collections: prev.collections.filter(c => c.id !== id)
    }))

    writeQueue.add({
      id: `col-delete-${id}`,
      dedupKey: `col-delete-${id}`,
      run: async () => {
        const { deleteLinkCollection } = await import('@/app/actions/links')
        return deleteLinkCollection(id)
      },
      rollback: () => {
        setState(prev => ({ ...prev, collections: previousCols }))
      }
    })
  }

  // --- VAULT ACTIONS ---
  const createVaultFolderAction = async (name: string, parentId: string | null) => {
    const previousVault = [...state.vaultItems]
    const tempId = `temp-v-${Date.now()}`

    setState(prev => ({
      ...prev,
      vaultItems: [
        {
          id: tempId,
          name,
          isFolder: true,
          parentId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        ...prev.vaultItems
      ]
    }))

    writeQueue.add({
      id: `vault-folder-${tempId}`,
      dedupKey: `vault-folder-${tempId}`,
      run: async () => {
        const { createVaultFolder } = await import('@/app/actions/vault')
        return createVaultFolder(name, parentId)
      },
      rollback: () => {
        setState(prev => ({ ...prev, vaultItems: previousVault }))
      }
    })
  }

  const deleteVaultItemAction = async (id: string) => {
    const previousVault = [...state.vaultItems]

    setState(prev => ({
      ...prev,
      vaultItems: prev.vaultItems.filter(v => v.id !== id)
    }))

    writeQueue.add({
      id: `vault-delete-${id}`,
      dedupKey: `vault-delete-${id}`,
      run: async () => {
        const { deleteVaultItem } = await import('@/app/actions/vault')
        return deleteVaultItem(id)
      },
      rollback: () => {
        setState(prev => ({ ...prev, vaultItems: previousVault }))
      }
    })
  }

  const renameVaultItemAction = async (id: string, name: string) => {
    const previousVault = [...state.vaultItems]

    setState(prev => ({
      ...prev,
      vaultItems: prev.vaultItems.map(v => v.id === id ? { ...v, name } : v)
    }))

    writeQueue.add({
      id: `vault-rename-${id}`,
      dedupKey: `vault-rename-${id}`,
      run: async () => {
        const { renameVaultItem } = await import('@/app/actions/vault')
        return renameVaultItem(id, name)
      },
      rollback: () => {
        setState(prev => ({ ...prev, vaultItems: previousVault }))
      }
    })
  }

  return (
    <StoreContext.Provider value={{
      state,
      isSyncing,
      initialize,
      cycleTaskStatusAction,
      setTaskStatusAction,
      deleteActivityLog,
      postponeOneTimeTaskAction,
      unpostponeOneTimeTaskAction,
      createActivityTemplateAction,
      reorderActivityTemplatesAction,
      logWorkPresenceAction,
      upsertNoteAction,
      deleteNoteAction,
      updateLeaveAllowanceAction,
      ensureLeaveAllowancesAction,
      upsertJournalAction,
      deleteJournalAction,
      logWeightAction,
      deleteWeightAction,
      createLeaveRecordAction,
      updateLeaveRecordAction,
      deleteLeaveRecordAction,
      createLinkAction,
      updateLinkAction,
      deleteLinkAction,
      createCollectionAction,
      updateCollectionAction,
      deleteCollectionAction,
      createVaultFolderAction,
      deleteVaultItemAction,
      renameVaultItemAction
    }}>
      {children}
    </StoreContext.Provider>
  )
}

export const useStore = () => {
  const context = useContext(StoreContext)
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider')
  }
  return context
}

