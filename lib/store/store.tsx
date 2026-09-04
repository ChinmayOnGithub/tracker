/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
// lib/store/store.tsx
"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { ActivityTemplate, ActivityLog, Note, TimelineItem, AnalyzedTemplate } from '@/types'
import { writeQueue } from './write-queue'
import { TaskStateMachine, TaskOccurrenceState } from '@/modules/activities/domain/TaskStateMachine'

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
  userId?: string
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
  cacheMetadata: {
    lastFetched: Record<string, number>
    isValidating: Record<string, boolean>
  }
  journalDrafts: Record<string, {
    content: string
    mood: string | null
    gratitude: string | null
    reflections: string | null
    lessonsLearned: string | null
    tomorrowPlan: string | null
    updatedAt: number
  }>
  activeJournalDate: string | null
  journalSearchQuery: string
}

interface StoreContextType {
  state: StoreState
  isSyncing: boolean
  initialize: (initialData: Partial<StoreState>) => void
  setCacheMetadata: (domain: string, timestamp: number, isValidating?: boolean) => void
  saveJournalDraftAction: (date: string, fields: any) => void
  setActiveJournalDateAction: (date: string | null) => void
  setJournalSearchQueryAction: (query: string) => void
  
  // Calendar Actions
  cycleTaskStatusAction: (occurrence: TimelineItem, todayStr: string, payload?: any) => Promise<void>
  setTaskStatusAction: (occurrence: TimelineItem, todayStr: string, status: 'cleared' | 'done' | 'skipped' | 'postponed', payload?: any) => Promise<void>
  deleteActivityLog: (logId: string) => Promise<void>
  postponeOneTimeTaskAction: (templateId: string, date: string, logId: string | null) => Promise<void>
  unpostponeOneTimeTaskAction: (templateId: string, logId: string, originalDate: string) => Promise<void>
  createActivityTemplateAction: (templateData: any) => Promise<void>
  updateActivityTemplateAction: (id: string, updates: Partial<ActivityTemplate>) => Promise<void>
  reorderActivityTemplatesAction: (orderedIds: string[]) => Promise<void>
  logWorkPresenceAction: (fields: any) => Promise<void>
  
  // Note Actions
  upsertNoteAction: (dateStr: string, content: string, title?: string | null, noteId?: string) => Promise<void>
  deleteNoteAction: (noteId: string) => Promise<void>

  // Leave Allowance Actions
  updateLeaveAllowanceAction: (leaveType: string, year: number, val: number) => Promise<void>
  batchUpdateLeaveAllowancesAction: (year: number, updates: { leaveType: string; allowance: number }[]) => Promise<void>
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
  },
  cacheMetadata: {
    lastFetched: {},
    isValidating: {}
  },
  journalDrafts: {},
  activeJournalDate: null,
  journalSearchQuery: ''
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<StoreState>(defaultState)
  const [isSyncing, setIsSyncing] = useState(false)

  const setCacheMetadata = useCallback((domain: string, timestamp: number, isValidating = false) => {
    setState(prev => ({
      ...prev,
      cacheMetadata: {
        lastFetched: { ...prev.cacheMetadata.lastFetched, [domain]: timestamp },
        isValidating: { ...prev.cacheMetadata.isValidating, [domain]: isValidating }
      }
    }))
  }, [])

  const saveJournalDraftAction = useCallback((date: string, fields: any) => {
    setState(prev => ({
      ...prev,
      journalDrafts: {
        ...prev.journalDrafts,
        [date]: {
          ...prev.journalDrafts[date],
          ...fields,
          updatedAt: Date.now()
        }
      }
    }))
  }, [])

  const setActiveJournalDateAction = useCallback((date: string | null) => {
    setState(prev => ({ ...prev, activeJournalDate: date }))
  }, [])

  const setJournalSearchQueryAction = useCallback((query: string) => {
    setState(prev => ({ ...prev, journalSearchQuery: query }))
  }, [])

  // Track queue sync status
  useEffect(() => {
    const unsub = writeQueue.subscribe(() => {
      setIsSyncing(writeQueue.getStatus() === 'saving')
    })
    return () => {
      unsub()
    }
  }, [])

  // Load offline data into store on startup
  useEffect(() => {
    const loadLocalData = async () => {
      try {
        const { ActivityTemplateRepository, ActivityLogRepository } = await import('@/modules/activities/repository/ActivityRepository');
        const { JournalRepository } = await import('@/modules/journal/repository/JournalRepository');
        const { WeightRepository } = await import('@/modules/weight/repository/WeightRepository');
        const { LeaveRepository } = await import('@/modules/leave/repository/LeaveRepository');
        
        const templateRepo = new ActivityTemplateRepository();
        const logRepo = new ActivityLogRepository();
        const journalRepo = new JournalRepository();
        const weightRepo = new WeightRepository();
        const leaveRepo = new LeaveRepository();

        const mergeById = <T extends { id: string; updatedAt?: any }>(serverItems: T[], localItems: T[]): T[] => {
          const map = new Map<string, T>()
          serverItems.forEach(item => map.set(item.id, item))
          localItems.forEach(item => {
            const existing = map.get(item.id)
            if (!existing) {
              map.set(item.id, item)
            } else {
              const existingTime = new Date(existing.updatedAt || 0).getTime()
              const localTime = new Date(item.updatedAt || 0).getTime()
              if (localTime > existingTime) {
                map.set(item.id, item)
              }
            }
          })
          return Array.from(map.values())
        }

        const localTemplates = await templateRepo.getAll()
        const localLogs = await logRepo.getAll()
        const localJournals = await journalRepo.getAll()
        const localWeights = await weightRepo.getAll()
        const localLeaves = await leaveRepo.getAll()

        let localNotes: Note[] = []
        try {
          const { NoteRepository } = await import('@/modules/notes/repository/NoteRepository')
          const noteRepo = new NoteRepository()
          localNotes = await noteRepo.getAll()
        } catch (_) {}

        // Hydrate Link Library collections & links if empty
        let initialLinks: LinkItem[] = []
        let initialCollections: LinkCollection[] = []
        try {
          const { listLinkCollections } = await import('@/app/actions/links')
          const linkRes = await listLinkCollections()
          if (linkRes.success && linkRes.collections) {
            initialCollections = linkRes.collections.map(c => ({
              id: c.id,
              name: c.name,
              description: null,
              icon: c.icon || null,
              color: c.color || null,
              createdAt: c.createdAt,
              updatedAt: c.updatedAt
            }))
            initialLinks = linkRes.collections.flatMap(c => (c.links || []).map(l => ({
              id: l.id,
              title: l.title,
              url: l.url,
              description: l.notes || null,
              collectionId: l.collectionId,
              clicks: l.openCount ?? 0,
              isStarred: l.isPinned ?? false,
              createdAt: l.createdAt,
              updatedAt: l.updatedAt
            })))
          }
        } catch (_) {}

        // Hydrate Vault items metadata if empty
        let initialVault: VaultItem[] = []
        try {
          const { listVaultItems } = await import('@/app/actions/vault')
          const vaultRes = await listVaultItems(null, undefined, 200, true)
          if (vaultRes.success && vaultRes.items) {
            initialVault = vaultRes.items.map(v => ({
              id: v.id,
              name: v.name,
              isFolder: v.isFolder,
              parentId: v.parentId,
              size: v.fileSize,
              mimeGroup: v.mimeGroup,
              updatedAt: v.updatedAt,
              createdAt: v.createdAt
            }))
          }
        } catch (_) {}

        setState(prev => ({
          ...prev,
          templates: mergeById(prev.templates, localTemplates),
          logs: mergeById(prev.logs, localLogs),
          journalEntries: mergeById(prev.journalEntries, localJournals),
          notes: prev.notes.length > 0 ? prev.notes : (localNotes.length > 0 ? localNotes : prev.notes),
          weightRecords: mergeById(prev.weightRecords, localWeights),
          leaveRecords: mergeById(prev.leaveRecords, localLeaves),
          links: prev.links.length > 0 ? prev.links : initialLinks,
          collections: prev.collections.length > 0 ? prev.collections : initialCollections,
          vaultItems: prev.vaultItems.length > 0 ? prev.vaultItems : initialVault,
        }));
      } catch (err) {
        console.error('Failed to load offline data into store:', err);
      }
    };
    loadLocalData();
  }, []);

  const initialize = useCallback((initialData: Partial<StoreState>) => {
    setState(prev => {
      // Local-first merge: item with the latest updatedAt wins.
      // Prevents server hydration from overwriting un-synced local edits.
      const mergeById = <T extends { id: string; updatedAt?: Date | string }>(
        currentItems: T[],
        serverItems: T[]
      ): T[] => {
        const map = new Map<string, T>()
        currentItems.forEach(item => map.set(item.id, item))
        serverItems.forEach(item => {
          const existing = map.get(item.id)
          if (!existing) {
            map.set(item.id, item)
          } else {
            const existingTime = new Date(existing.updatedAt ?? 0).getTime()
            const serverTime = new Date(item.updatedAt ?? 0).getTime()
            if (serverTime > existingTime) {
              map.set(item.id, item)
            }
          }
        })
        return Array.from(map.values())
      }

      const next = { ...prev }

      // Local-first types: merge by timestamp
      if (initialData.templates !== undefined)     next.templates     = mergeById(prev.templates, initialData.templates)
      if (initialData.logs !== undefined)          next.logs          = mergeById(prev.logs, initialData.logs)
      if (initialData.weightRecords !== undefined) next.weightRecords = mergeById(prev.weightRecords, initialData.weightRecords)
      if (initialData.leaveRecords !== undefined)  next.leaveRecords  = mergeById(prev.leaveRecords, initialData.leaveRecords)

      // Non-mutated types: replace directly
      if (initialData.notes !== undefined)           next.notes           = initialData.notes
      if (initialData.leaveAllowances !== undefined) next.leaveAllowances = initialData.leaveAllowances
      if (initialData.vaultItems !== undefined)      next.vaultItems      = initialData.vaultItems
      if (initialData.links !== undefined)           next.links           = initialData.links
      if (initialData.collections !== undefined)     next.collections     = initialData.collections
      if (initialData.calendarData !== undefined)    next.calendarData    = initialData.calendarData

      return next
    })

    if (initialData.journalEntries) {
      const serverEntries = initialData.journalEntries
      const reconcile = async () => {
        try {
          const { JournalRepository } = await import('@/modules/journal/repository/JournalRepository')
          const { LocalJournalRepository } = await import('@/modules/journal/repository/LocalJournalRepository')
          const { IndexedDBEngine } = await import('@/lib/database/local/IndexedDBEngine')
          const journalRepo = new JournalRepository()
          const localJournalRepo = new LocalJournalRepository()
          const engine = IndexedDBEngine.getInstance()

          let queuedItems: any[] = []
          try {
            queuedItems = await engine.getAll<any>('sync_queue')
          } catch (err) {
            console.error(err)
          }
          const pendingEntryIds = new Set(
            queuedItems
              .filter(q => q.module === 'journal_entries')
              .map(q => q.entityId)
          )

          for (const serverEntry of serverEntries) {
            const localEntry = await journalRepo.getById(serverEntry.id)
            if (!localEntry) {
              await localJournalRepo.save(serverEntry)
            } else {
              const hasPendingMutation = pendingEntryIds.has(serverEntry.id)
              if (hasPendingMutation) {
                if (localEntry.content !== serverEntry.content && localEntry.updatedAt !== serverEntry.updatedAt) {
                  const meta = typeof localEntry.metadata === 'string' ? JSON.parse(localEntry.metadata || '{}') : (localEntry.metadata || {})
                  localEntry.metadata = {
                    ...meta,
                    conflict: {
                      remoteContent: serverEntry.content,
                      remoteUpdatedAt: serverEntry.updatedAt,
                      localContentAtConflict: localEntry.content,
                      resolved: false
                    }
                  }
                  await localJournalRepo.save(localEntry)
                }
              } else {
                const localTime = new Date(localEntry.updatedAt || 0).getTime()
                const serverTime = new Date(serverEntry.updatedAt || 0).getTime()
                if (serverTime > localTime) {
                  if (localEntry.content !== serverEntry.content) {
                    const meta = typeof localEntry.metadata === 'string' ? JSON.parse(localEntry.metadata || '{}') : (localEntry.metadata || {})
                    localEntry.metadata = {
                      ...meta,
                      conflict: {
                        remoteContent: serverEntry.content,
                        remoteUpdatedAt: serverEntry.updatedAt,
                        localContentAtConflict: localEntry.content,
                        resolved: false
                      }
                    }
                    await localJournalRepo.save(localEntry)
                  } else {
                    await localJournalRepo.save(serverEntry)
                  }
                }
              }
            }
          }

          const allJournals = await journalRepo.getAll()
          setState(prev => ({ ...prev, journalEntries: allJournals }))
        } catch (err) {
          console.error('[Store] Journal reconciliation failed:', err)
        }
      }
      reconcile()
    }
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

    // Map current UI state to TaskOccurrenceState for machine validation
    const currentMachineState: TaskOccurrenceState =
      isPostponed ? 'postponed' :
      isCanceled ? 'skipped' :
      isDone ? 'done' :
      'pending'

    // Cycle state logic — determines next state
    let nextMachineState: TaskOccurrenceState | null = null
    if (!currentCompleted && !isCanceled && !isPostponed) {
      nextMachineState = 'done'
      nextCompleted = true
      nextStatus = matched?.category === 'finance' ? 'paid' : 'done'
    } else if (isDone) {
      nextMachineState = 'skipped'
      nextCompleted = true
      nextStatus = 'skipped'
    } else if (isCanceled) {
      if (isDaily) {
        nextMachineState = 'pending'
        nextCompleted = false
        nextStatus = undefined
      } else {
        nextMachineState = 'postponed'
        nextCompleted = true
        nextStatus = 'postponed'
      }
    } else if (isPostponed) {
      nextMachineState = 'pending'
      nextCompleted = false
      nextStatus = undefined
    }

    // Guard via TaskStateMachine — log warning if transition is not in the domain model
    if (nextMachineState !== null && nextMachineState !== 'pending') {
      if (!TaskStateMachine.isValidTransition(currentMachineState, nextMachineState)) {
        console.warn(
          `[TaskStateMachine] Invalid transition: ${currentMachineState} → ${nextMachineState} for template ${templateId}. Skipping.`
        )
        return
      }
    }

    const previousLogs = [...state.logs]
    const resolvedAmount = (payload && typeof payload.value === 'number') ? payload.value : (matched?.amount || null)

    const finalLogId = logId || `log-${Date.now()}`

    // Optimistic Update
    setState(prev => {
      let updatedLogs = [...prev.logs]
      if (logId) {
        if (nextCompleted === false && nextStatus === undefined && isDaily) {
          updatedLogs = updatedLogs.filter(l => l.id !== logId)
        } else {
          updatedLogs = updatedLogs.map(l => 
            l.id === logId ? { ...l, status: nextStatus || 'done', amount: resolvedAmount, payload: payload || l.payload } : l
          )
        }
      } else {
        updatedLogs.push({
          id: finalLogId,
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

    try {
      const { ActivityLogRepository } = await import('@/modules/activities/repository/ActivityRepository')
      const logRepo = new ActivityLogRepository()

      if (logId) {
        if (nextCompleted === false && nextStatus === undefined && isDaily) {
          await logRepo.delete(logId)
        } else {
          const log = await logRepo.getById(logId)
          if (log) {
            log.status = nextStatus || 'done'
            log.amount = resolvedAmount
            log.payload = payload || log.payload
            log.updatedAt = new Date()
            await logRepo.save(log)
          }
        }
      } else {
        await logRepo.save({
          id: finalLogId,
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
    } catch (err) {
      console.error('Cycle task status transaction failed, rolling back:', err)
      setState(prev => ({ ...prev, logs: previousLogs }))
    }
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

    const previousLogs = [...state.logs]
    const resolvedAmount = (payload && typeof payload.value === 'number') ? payload.value : (matched?.amount || null)
    const finalLogId = logId || `log-${Date.now()}`

    // Optimistic Update
    setState(prev => {
      let updatedLogs = [...prev.logs]
      if (logId) {
        if (targetStatus === 'cleared' && isDaily) {
          updatedLogs = updatedLogs.filter(l => l.id !== logId)
        } else {
          updatedLogs = updatedLogs.map(l => 
            l.id === logId ? { ...l, status: nextStatus || 'done', amount: resolvedAmount, payload: payload || l.payload } : l
          )
        }
      } else if (targetStatus !== 'cleared') {
        updatedLogs.push({
          id: finalLogId,
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

    try {
      const { ActivityLogRepository } = await import('@/modules/activities/repository/ActivityRepository')
      const logRepo = new ActivityLogRepository()

      if (logId) {
        if (targetStatus === 'cleared' && isDaily) {
          await logRepo.delete(logId)
        } else {
          const log = await logRepo.getById(logId)
          if (log) {
            log.status = nextStatus || 'done'
            log.amount = resolvedAmount
            log.payload = payload || log.payload
            log.updatedAt = new Date()
            await logRepo.save(log)
          }
        }
      } else if (targetStatus !== 'cleared') {
        await logRepo.save({
          id: finalLogId,
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
    } catch (err) {
      console.error('Set task status transaction failed, rolling back:', err)
      setState(prev => ({ ...prev, logs: previousLogs }))
    }
  }

  const deleteActivityLog = async (logId: string) => {
    const previousLogs = [...state.logs]
    setState(prev => ({ ...prev, logs: prev.logs.filter(l => l.id !== logId) }))

    try {
      const { ActivityLogRepository } = await import('@/modules/activities/repository/ActivityRepository')
      const logRepo = new ActivityLogRepository()
      await logRepo.delete(logId)
    } catch (err) {
      console.error('Delete log transaction failed, rolling back:', err)
      setState(prev => ({ ...prev, logs: previousLogs }))
    }
  }

  const postponeOneTimeTaskAction = async (templateId: string, date: string, logId: string | null) => {
    const previousLogs = [...state.logs]
    const previousTemplates = [...state.templates]

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    // Optimistic Update
    setState(prev => ({
      ...prev,
      templates: prev.templates.map(t => t.id === templateId ? { ...t, targetDate: tomorrowStr } : t),
      logs: logId ? prev.logs.filter(l => l.id !== logId) : prev.logs
    }))

    try {
      const { ActivityTemplateRepository, ActivityLogRepository } = await import('@/modules/activities/repository/ActivityRepository')
      const templateRepo = new ActivityTemplateRepository()
      const logRepo = new ActivityLogRepository()

      const template = await templateRepo.getById(templateId)
      if (template) {
        template.targetDate = tomorrowStr
        await templateRepo.save(template)
      }
      if (logId) {
        await logRepo.delete(logId)
      }
    } catch (err) {
      console.error('Postpone transaction failed, rolling back:', err)
      setState(prev => ({ ...prev, logs: previousLogs, templates: previousTemplates }))
    }
  }

  const unpostponeOneTimeTaskAction = async (templateId: string, logId: string, originalDate: string) => {
    const previousLogs = [...state.logs]
    const previousTemplates = [...state.templates]

    // Optimistic Update
    setState(prev => ({
      ...prev,
      templates: prev.templates.map(t => t.id === templateId ? { ...t, targetDate: originalDate } : t),
      logs: prev.logs.filter(l => l.id !== logId)
    }))

    try {
      const { ActivityTemplateRepository, ActivityLogRepository } = await import('@/modules/activities/repository/ActivityRepository')
      const templateRepo = new ActivityTemplateRepository()
      const logRepo = new ActivityLogRepository()

      const template = await templateRepo.getById(templateId)
      if (template) {
        template.targetDate = originalDate
        await templateRepo.save(template)
      }
      await logRepo.delete(logId)
    } catch (err) {
      console.error('Unpostpone transaction failed, rolling back:', err)
      setState(prev => ({ ...prev, logs: previousLogs, templates: previousTemplates }))
    }
  }

  const createActivityTemplateAction = async (templateData: any) => {
    const previousTemplates = [...state.templates]
    const tempId = templateData.id || `temp-template-${Date.now()}`

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
      notes: templateData.notes || null,
      amount: templateData.amount || null,
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

    try {
      const { ActivityTemplateRepository } = await import('@/modules/activities/repository/ActivityRepository')
      const templateRepo = new ActivityTemplateRepository()
      await templateRepo.save(newTemplate)
    } catch (err) {
      console.error('Create template transaction failed, rolling back:', err)
      setState(prev => ({ ...prev, templates: previousTemplates }))
    }
  }

  const updateActivityTemplateAction = async (id: string, updates: Partial<ActivityTemplate>) => {
    const previousTemplates = [...state.templates]

    setState(prev => ({
      ...prev,
      templates: prev.templates.map(t => (t.id === id ? { ...t, ...updates, updatedAt: new Date() } : t))
    }))

    try {
      const { ActivityTemplateRepository } = await import('@/modules/activities/repository/ActivityRepository')
      const templateRepo = new ActivityTemplateRepository()
      const existing = await templateRepo.getById(id)
      if (existing) {
        const merged: ActivityTemplate = {
          ...existing,
          ...updates,
          updatedAt: new Date()
        }
        await templateRepo.save(merged)
      }
    } catch (err) {
      console.error('Update template transaction failed, rolling back:', err)
      setState(prev => ({ ...prev, templates: previousTemplates }))
    }
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

    try {
      const { ActivityTemplateRepository } = await import('@/modules/activities/repository/ActivityRepository')
      const templateRepo = new ActivityTemplateRepository()
      await templateRepo.reorder(orderedIds)
    } catch (err) {
      console.error('Reorder templates transaction failed, rolling back:', err)
      setState(prev => ({ ...prev, templates: previousTemplates }))
    }
  }

  const logWorkPresenceAction = async (fields: any) => {
    const previousLogs = [...state.logs]
    
    setState(prev => {
      let updatedLogs = [...prev.logs]
      const existingLog = prev.logs.find(l => l.activityId === fields.templateId && l.date === fields.date)
      
      if (fields.status === 'cleared') {
        updatedLogs = updatedLogs.filter(l => l.id !== existingLog?.id)
      } else {
        const prevPayload = (existingLog?.payload as Record<string, unknown> | null) || {}
        const payload = {
          ...prevPayload,
          inTime: fields.inTime !== undefined ? fields.inTime : prevPayload.inTime,
          outTime: fields.outTime !== undefined ? fields.outTime : prevPayload.outTime,
          loggingMode: fields.loggingMode !== undefined ? fields.loggingMode : prevPayload.loggingMode,
          manualHours: fields.manualHours !== undefined ? fields.manualHours : prevPayload.manualHours,
          sessionState: fields.sessionState !== undefined ? fields.sessionState : (fields.outTime ? 'completed' : prevPayload.sessionState || 'running'),
          accumulatedSeconds: fields.accumulatedSeconds !== undefined ? fields.accumulatedSeconds : (prevPayload.accumulatedSeconds !== undefined ? prevPayload.accumulatedSeconds : (fields.hours ? Math.round(fields.hours * 3600) : 0)),
          currentSegmentStartedAt: fields.currentSegmentStartedAt !== undefined ? fields.currentSegmentStartedAt : prevPayload.currentSegmentStartedAt,
          workSessionId: fields.workSessionId || prevPayload.workSessionId || null,
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
    const finalId = noteId || `temp-note-${Date.now()}`

    setState(prev => {
      let updatedNotes = [...prev.notes]
      const existing = noteId ? prev.notes.find(n => n.id === noteId) : prev.notes.find(n => n.date === dateStr)

      if (existing) {
        updatedNotes = updatedNotes.map(n => n.id === existing.id ? { ...n, content, title: title !== undefined ? title : n.title, updatedAt: new Date() } : n)
      } else {
        updatedNotes.unshift({
          id: finalId,
          date: dateStr || new Date().toISOString().split('T')[0],
          title: title || null,
          content,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      }
      return { ...prev, notes: updatedNotes }
    })

    try {
      const { NoteRepository } = await import('@/modules/notes/repository/NoteRepository')
      const noteRepo = new NoteRepository()

      const existing = noteId ? state.notes.find(n => n.id === noteId) : state.notes.find(n => n.date === dateStr)
      const payload = {
        id: existing ? existing.id : finalId,
        date: dateStr || (existing ? existing.date : new Date().toISOString().split('T')[0]),
        title: title !== undefined ? (title || null) : (existing ? existing.title : null),
        content,
        createdAt: existing ? (typeof existing.createdAt === 'string' ? existing.createdAt : existing.createdAt.toISOString()) : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await noteRepo.save(payload)
      const allNotes = await noteRepo.getAll()
      setState(prev => ({ ...prev, notes: allNotes }))
    } catch (err) {
      console.error('[Store] Note upsert failed:', err)
      setState(prev => ({ ...prev, notes: previousNotes }))
    }
  }

  const deleteNoteAction = async (noteId: string) => {
    const previousNotes = [...state.notes]
    setState(prev => ({ ...prev, notes: prev.notes.filter(n => n.id !== noteId) }))

    try {
      const { NoteRepository } = await import('@/modules/notes/repository/NoteRepository')
      const noteRepo = new NoteRepository()
      await noteRepo.delete(noteId)
      const allNotes = await noteRepo.getAll()
      setState(prev => ({ ...prev, notes: allNotes }))
    } catch (err) {
      console.error('[Store] Note delete failed:', err)
      setState(prev => ({ ...prev, notes: previousNotes }))
    }
  }

  const updateLeaveAllowanceAction = async (leaveType: string, year: number, val: number) => {
    const previousAllowances = [...state.leaveAllowances]
    setState(prev => {
      const exists = prev.leaveAllowances.some(a => a.leaveType === leaveType)
      return {
        ...prev,
        leaveAllowances: exists
          ? prev.leaveAllowances.map(a => a.leaveType === leaveType ? { ...a, allowance: val } : a)
          : [...prev.leaveAllowances, { id: `temp-${leaveType}-${year}`, userId: '', year, leaveType, allowance: val }],
      }
    })

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

  const batchUpdateLeaveAllowancesAction = async (year: number, updates: { leaveType: string; allowance: number }[]) => {
    const previousAllowances = [...state.leaveAllowances]
    setState(prev => {
      const copy = [...prev.leaveAllowances]
      for (const u of updates) {
        const idx = copy.findIndex(a => a.leaveType === u.leaveType)
        if (idx >= 0) {
          copy[idx] = { ...copy[idx], allowance: u.allowance }
        } else {
          copy.push({ id: `temp-${u.leaveType}-${year}`, userId: '', year, leaveType: u.leaveType, allowance: u.allowance })
        }
      }
      return { ...prev, leaveAllowances: copy }
    })

    writeQueue.add({
      id: `leave-allowance-batch-${year}-${Date.now()}`,
      dedupKey: `leave-allowance-batch-${year}`,
      run: async () => {
        const { batchUpdateLeaveAllowances } = await import('@/app/actions/leave')
        return batchUpdateLeaveAllowances(year, updates as any)
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

    const existing = state.journalEntries.find(e => {
      const entryDate = typeof e.journalDate === 'string' ? e.journalDate.split('T')[0] : e.journalDate.toISOString().split('T')[0]
      return entryDate === date
    })

    const finalId = existing ? existing.id : `journal-entry-${Date.now()}`

    // Optimistic Update
    setState(prev => {
      let updated = [...prev.journalEntries]
      if (existing) {
        updated = updated.map(e => e.id === existing.id ? { ...e, ...fields, updatedAt: new Date().toISOString() } : e)
      } else {
        updated.push({
          id: finalId,
          journalDate: new Date(`${date}T12:00:00.000Z`).toISOString(),
          content: fields.content !== undefined ? fields.content : '',
          mood: fields.mood || null,
          gratitude: fields.gratitude || null,
          reflections: fields.reflections || null,
          lessonsLearned: fields.lessonsLearned || null,
          tomorrowPlan: fields.tomorrowPlan || null,
          metadata: fields.metadata || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      }
      const newDrafts = { ...prev.journalDrafts }
      delete newDrafts[date]
      return {
        ...prev,
        journalEntries: updated,
        journalDrafts: newDrafts
      }
    })

    try {
      const { JournalRepository } = await import('@/modules/journal/repository/JournalRepository')
      const journalRepo = new JournalRepository()

      const payload: JournalEntry = {
        id: finalId,
        journalDate: new Date(`${date}T12:00:00.000Z`).toISOString(),
        content: fields.content !== undefined ? fields.content : (existing ? existing.content : ''),
        mood: fields.mood !== undefined ? fields.mood : (existing ? existing.mood : null),
        gratitude: fields.gratitude !== undefined ? fields.gratitude : (existing ? existing.gratitude : null),
        reflections: fields.reflections !== undefined ? fields.reflections : (existing ? existing.reflections : null),
        lessonsLearned: fields.lessonsLearned !== undefined ? fields.lessonsLearned : (existing ? existing.lessonsLearned : null),
        tomorrowPlan: fields.tomorrowPlan !== undefined ? fields.tomorrowPlan : (existing ? existing.tomorrowPlan : null),
        metadata: fields.metadata !== undefined ? fields.metadata : (existing ? existing.metadata : null),
        createdAt: existing ? (typeof existing.createdAt === 'string' ? existing.createdAt : existing.createdAt.toISOString()) : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await journalRepo.save(payload)
      const allJournals = await journalRepo.getAll()
      setState(prev => ({ ...prev, journalEntries: allJournals }))
    } catch (err) {
      console.error('Upsert journal entry transaction failed, rolling back:', err)
      setState(prev => ({ ...prev, journalEntries: previousJournal }))
    }
  }

  const deleteJournalAction = async (id: string) => {
    const previousJournal = [...state.journalEntries]
    setState(prev => ({ ...prev, journalEntries: prev.journalEntries.filter(e => e.id !== id) }))

    try {
      const { JournalRepository } = await import('@/modules/journal/repository/JournalRepository')
      const journalRepo = new JournalRepository()
      await journalRepo.delete(id)
      const allJournals = await journalRepo.getAll()
      setState(prev => ({ ...prev, journalEntries: allJournals }))
    } catch (err) {
      console.error('Delete journal entry transaction failed, rolling back:', err)
      setState(prev => ({ ...prev, journalEntries: previousJournal }))
    }
  }

  // --- WEIGHT ACTIONS ---
  const logWeightAction = async (date: string, weight: number, note?: string | null) => {
    const previousWeight = [...state.weightRecords]

    const existing = state.weightRecords.find(r => {
      const recDate = typeof r.date === 'string' ? r.date.split('T')[0] : r.date.toISOString().split('T')[0]
      return recDate === date
    })

    const finalId = existing ? existing.id : `weight-${Date.now()}`

    // Optimistic Update
    setState(prev => {
      let updated = [...prev.weightRecords]
      if (existing) {
        updated = updated.map(r => r.id === existing.id ? { ...r, weight, notes: note ?? r.notes, updatedAt: new Date().toISOString() } : r)
      } else {
        updated.push({
          id: finalId,
          userId: '',
          weight,
          date,
          notes: note || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      }
      return { ...prev, weightRecords: updated }
    })

    try {
      const { WeightRepository } = await import('@/modules/weight/repository/WeightRepository')
      const weightRepo = new WeightRepository()

      const payload: WeightRecord = {
        id: finalId,
        userId: existing ? existing.userId : '',
        weight,
        date: new Date(`${date}T12:00:00.000Z`).toISOString(),
        notes: note !== undefined ? note : (existing ? existing.notes : null),
        createdAt: existing ? (typeof existing.createdAt === 'string' ? existing.createdAt : existing.createdAt?.toISOString()) : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await weightRepo.save(payload)
    } catch (err) {
      console.error('Log weight transaction failed, rolling back:', err)
      setState(prev => ({ ...prev, weightRecords: previousWeight }))
    }
  }

  const deleteWeightAction = async (id: string) => {
    const previousWeight = [...state.weightRecords]
    setState(prev => ({ ...prev, weightRecords: prev.weightRecords.filter(r => r.id !== id) }))

    try {
      const { WeightRepository } = await import('@/modules/weight/repository/WeightRepository')
      const weightRepo = new WeightRepository()
      await weightRepo.delete(id)
    } catch (err) {
      console.error('Delete weight transaction failed, rolling back:', err)
      setState(prev => ({ ...prev, weightRecords: previousWeight }))
    }
  }

  // --- LEAVE ACTIONS ---
  const createLeaveRecordAction = async (record: any) => {
    const previousLeaves = [...state.leaveRecords]
    const tempId = `temp-lv-${Date.now()}`

    // Optimistic Update
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

    try {
      const { LeaveRepository } = await import('@/modules/leave/repository/LeaveRepository')
      const leaveRepo = new LeaveRepository()

      const payload: LeaveRecord = {
        id: tempId,
        userId: '',
        leaveType: record.leaveType,
        startDate: new Date(`${record.startDate}T12:00:00.000Z`).toISOString(),
        endDate: new Date(`${record.endDate}T12:00:00.000Z`).toISOString(),
        totalDays: record.totalDays || 1,
        status: 'PENDING',
        notes: record.notes || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await leaveRepo.save(payload)
    } catch (err) {
      console.error('Create leave transaction failed, rolling back:', err)
      setState(prev => ({ ...prev, leaveRecords: previousLeaves }))
    }
  }

  const updateLeaveRecordAction = async (id: string, status: any) => {
    const previousLeaves = [...state.leaveRecords]

    setState(prev => ({
      ...prev,
      leaveRecords: prev.leaveRecords.map(l => l.id === id ? { ...l, status } : l)
    }))

    try {
      const { LeaveRepository } = await import('@/modules/leave/repository/LeaveRepository')
      const leaveRepo = new LeaveRepository()
      const existing = await leaveRepo.getById(id)
      if (existing) {
        const payload: LeaveRecord = {
          ...existing,
          status,
          updatedAt: new Date().toISOString()
        }
        await leaveRepo.save(payload)
      }
    } catch (err) {
      console.error('Update leave status transaction failed, rolling back:', err)
      setState(prev => ({ ...prev, leaveRecords: previousLeaves }))
    }
  }

  const deleteLeaveRecordAction = async (id: string) => {
    const previousLeaves = [...state.leaveRecords]

    setState(prev => ({
      ...prev,
      leaveRecords: prev.leaveRecords.filter(l => l.id !== id)
    }))

    try {
      const { LeaveRepository } = await import('@/modules/leave/repository/LeaveRepository')
      const leaveRepo = new LeaveRepository()
      await leaveRepo.delete(id)
    } catch (err) {
      console.error('Delete leave transaction failed, rolling back:', err)
      setState(prev => ({ ...prev, leaveRecords: previousLeaves }))
    }
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
      setCacheMetadata,
      saveJournalDraftAction,
      setActiveJournalDateAction,
      setJournalSearchQueryAction,
      cycleTaskStatusAction,
      setTaskStatusAction,
      deleteActivityLog,
      postponeOneTimeTaskAction,
      unpostponeOneTimeTaskAction,
      createActivityTemplateAction,
      updateActivityTemplateAction,
      reorderActivityTemplatesAction,
      logWorkPresenceAction,
      upsertNoteAction,
      deleteNoteAction,
      updateLeaveAllowanceAction,
      batchUpdateLeaveAllowancesAction,
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

