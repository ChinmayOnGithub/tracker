import { describe, it, expect, mock } from 'bun:test'
import { EntitlementService } from '@/lib/services/EntitlementService'

mock.module('../app/actions/auth', () => ({
  getLoggedUser: () => Promise.resolve({
    id: 'user-free-1',
    username: 'freeuser',
    email: 'free@example.com',
    isOwner: false,
  })
}))

// Import actions after mock.module
import { createGoogleEventAction, updateGoogleEventAction, deleteGoogleEventAction, syncCalendarAction } from '@/modules/sync/google-calendar/actions'

describe('Pro Entitlement Enforcement Suite (#51 & #42)', () => {
  it('rejects Google Calendar writeback when user is on Free plan', async () => {
    // Mock EntitlementService.isPro to return false
    const origIsPro = EntitlementService.isPro
    EntitlementService.isPro = async () => false

    try {
      const res = await createGoogleEventAction({
        summary: 'Test Sync Event',
        start: { dateTime: '2026-09-19T10:00:00Z' },
        end: { dateTime: '2026-09-19T11:00:00Z' },
        isAllDay: false,
      })

      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.code).toBe('PRO_REQUIRED')
        expect(res.error).toContain('requires a Tracker Pro subscription')
      }

      const updateRes = await updateGoogleEventAction('event-1', { summary: 'Updated' })
      expect(updateRes.success).toBe(false)
      if (!updateRes.success) {
        expect(updateRes.code).toBe('PRO_REQUIRED')
      }

      const deleteRes = await deleteGoogleEventAction('event-1')
      expect(deleteRes.success).toBe(false)
      if (!deleteRes.success) {
        expect(deleteRes.code).toBe('PRO_REQUIRED')
      }

      const syncRes = await syncCalendarAction()
      expect(syncRes.success).toBe(false)
      if (!syncRes.success) {
        expect(syncRes.code).toBe('PRO_REQUIRED')
      }
    } finally {
      EntitlementService.isPro = origIsPro
    }
  })

  it('allows Google Calendar writeback when user is on Pro plan', async () => {
    const origIsPro = EntitlementService.isPro
    EntitlementService.isPro = async () => true

    const { ProviderService } = await import('@/lib/services/ProviderService')
    const origCreate = ProviderService.createEvent
    ProviderService.createEvent = async () => ({
      id: 'mock-g-event-id',
      summary: 'Pro Event',
      start: '2026-09-19T10:00:00Z',
      end: '2026-09-19T11:00:00Z',
      isAllDay: false,
    })

    try {
      const res = await createGoogleEventAction({
        summary: 'Pro Event',
        start: { dateTime: '2026-09-19T10:00:00Z' },
        end: { dateTime: '2026-09-19T11:00:00Z' },
        isAllDay: false,
      })

      if (!res.success) {
        console.log('TEST DEBUG createGoogleEventAction result:', res)
      }

      expect(res.success).toBe(true)
    } finally {
      EntitlementService.isPro = origIsPro
      ProviderService.createEvent = origCreate
    }
  })

  it('enforces vault storage capacity based on plan', async () => {
    // Free: 10 files
    const freeCapacity = await EntitlementService.checkVaultCapacity('free-user', 10)
    expect(freeCapacity.allowed).toBe(false)
    expect(freeCapacity.maxFiles).toBe(10)
    expect(freeCapacity.isPro).toBe(false)

    // Free with 9 files (allowed)
    const freeUnder = await EntitlementService.checkVaultCapacity('free-user', 9)
    expect(freeUnder.allowed).toBe(true)
  })
})
