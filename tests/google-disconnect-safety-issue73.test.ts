import { describe, it, expect, mock } from 'bun:test'
import { GoogleCredentialService } from '@/modules/sync/google-calendar/services/GoogleCredentialService'
import { db } from '@/lib/db'

describe('Issue #73: Non-Destructive Google Calendar Disconnect', () => {
  const userId = 'user-alice'

  it('disconnects Google without deleting Tracker-owned records', async () => {
    const executedQueries: { model: string; action: string; where: unknown }[] = []

    // Mock db model methods
    const origCalendarEventUpdateMany = db.calendarEvent.updateMany
    const origCalendarSyncStateDeleteMany = db.calendarSyncState.deleteMany
    const origGoogleCredentialDeleteMany = db.googleCredential.deleteMany
    const origLinkedEventMappingUpdateMany = db.linkedEventMapping.updateMany
    const origActivityTemplateDeleteMany = db.activityTemplate.deleteMany
    const origActivityLogDeleteMany = db.activityLog.deleteMany
    const origJournalEntryDeleteMany = db.journalEntry.deleteMany
    const origWeightRecordDeleteMany = db.weightRecord.deleteMany
    const origTransaction = db.$transaction
    const origGetRefreshToken = GoogleCredentialService.getRefreshToken

    db.calendarEvent.updateMany = mock((args: { where: unknown }) => {
      executedQueries.push({ model: 'calendarEvent', action: 'updateMany', where: args.where })
      return Promise.resolve({ count: 1 })
    }) as unknown as typeof db.calendarEvent.updateMany

    db.calendarSyncState.deleteMany = mock((args: { where: unknown }) => {
      executedQueries.push({ model: 'calendarSyncState', action: 'deleteMany', where: args.where })
      return Promise.resolve({ count: 1 })
    }) as unknown as typeof db.calendarSyncState.deleteMany

    db.googleCredential.deleteMany = mock((args: { where: unknown }) => {
      executedQueries.push({ model: 'googleCredential', action: 'deleteMany', where: args.where })
      return Promise.resolve({ count: 1 })
    }) as unknown as typeof db.googleCredential.deleteMany

    db.linkedEventMapping.updateMany = mock((args: { where: unknown }) => {
      executedQueries.push({ model: 'linkedEventMapping', action: 'updateMany', where: args.where })
      return Promise.resolve({ count: 1 })
    }) as unknown as typeof db.linkedEventMapping.updateMany

    db.activityTemplate.deleteMany = mock(() => {
      throw new Error('VIOLATION: activityTemplate must NEVER be deleted on Google disconnect')
    }) as unknown as typeof db.activityTemplate.deleteMany

    db.activityLog.deleteMany = mock(() => {
      throw new Error('VIOLATION: activityLog must NEVER be deleted on Google disconnect')
    }) as unknown as typeof db.activityLog.deleteMany

    db.journalEntry.deleteMany = mock(() => {
      throw new Error('VIOLATION: journalEntry must NEVER be deleted on Google disconnect')
    }) as unknown as typeof db.journalEntry.deleteMany

    db.weightRecord.deleteMany = mock(() => {
      throw new Error('VIOLATION: weightRecord must NEVER be deleted on Google disconnect')
    }) as unknown as typeof db.weightRecord.deleteMany

    db.$transaction = mock((ops: unknown[]) => Promise.resolve(ops)) as unknown as typeof db.$transaction
    GoogleCredentialService.getRefreshToken = mock(() => Promise.resolve(null))

    try {
      const success = await GoogleCredentialService.disconnect(userId)
      expect(success).toBe(true)

      // 1. Verifies Google credentials deleted
      expect(executedQueries.some((q) => q.model === 'googleCredential')).toBe(true)

      // 2. Verifies mappings soft-deleted
      expect(executedQueries.some((q) => q.model === 'linkedEventMapping')).toBe(true)

      // 3. Verifies purely external events soft-deleted
      const externalEventQuery = executedQueries.find(
        (q) =>
          q.model === 'calendarEvent' &&
          (q.where as { trackerArtifactId?: unknown })?.trackerArtifactId === null
      )
      expect(externalEventQuery).toBeDefined()

      // 4. Verifies Tracker-owned events are preserved and only sync references detached
      const trackerEventDetachQuery = executedQueries.find(
        (q) =>
          q.model === 'calendarEvent' &&
          (q.where as { trackerArtifactId?: { not: null } })?.trackerArtifactId?.not === null
      )
      expect(trackerEventDetachQuery).toBeDefined()

      // 5. Verifies Google sync state cleaned
      expect(executedQueries.some((q) => q.model === 'calendarSyncState')).toBe(true)
    } finally {
      db.calendarEvent.updateMany = origCalendarEventUpdateMany
      db.calendarSyncState.deleteMany = origCalendarSyncStateDeleteMany
      db.googleCredential.deleteMany = origGoogleCredentialDeleteMany
      db.linkedEventMapping.updateMany = origLinkedEventMappingUpdateMany
      db.activityTemplate.deleteMany = origActivityTemplateDeleteMany
      db.activityLog.deleteMany = origActivityLogDeleteMany
      db.journalEntry.deleteMany = origJournalEntryDeleteMany
      db.weightRecord.deleteMany = origWeightRecordDeleteMany
      db.$transaction = origTransaction
      GoogleCredentialService.getRefreshToken = origGetRefreshToken
    }
  })
})
