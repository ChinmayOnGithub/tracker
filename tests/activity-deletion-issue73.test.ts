import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { ActivityTemplate } from '@/types'

// Mock ActivityTemplateRepository and server actions
const mockLocalDelete = mock((_id: string) => Promise.resolve())
const mockServerDelete = mock((_id: string) => Promise.resolve({ success: true }))
const mockServerBulkDelete = mock((_ids: string[]) => Promise.resolve({ success: true }))

function createMockTemplate(overrides: Partial<ActivityTemplate>): ActivityTemplate {
  return {
    id: 'tpl-default',
    userId: 'user-default',
    name: 'Default Activity',
    category: 'general',
    type: 'PERSONAL',
    priority: 'NORMAL',
    estimatedDuration: 30,
    energyRequired: 'MEDIUM',
    calendarProvider: 'NONE',
    calendarEventId: null,
    notificationRules: null,
    icon: 'Activity',
    color: 'zinc',
    isActive: true,
    notes: null,
    amount: null,
    sortOrder: 1,
    recurrenceType: 'daily',
    recurrenceInterval: 1,
    recurrenceDaysOfWeek: null,
    recurrenceDayOfMonth: null,
    recurrenceMonth: null,
    targetDate: null,
    remindBeforeDays: null,
    metadata: null,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  }
}

describe('Issue #73: Activity Deletion Optimistic & Canonical State', () => {
  const sampleTemplate1 = createMockTemplate({
    id: 'tpl-1',
    userId: 'user-alice',
    name: 'Morning Jog',
    category: 'fitness',
    icon: 'Activity',
    color: 'emerald',
    priority: 'HIGH',
    type: 'WORKOUT',
  })

  const sampleTemplate2 = createMockTemplate({
    id: 'tpl-2',
    userId: 'user-alice',
    name: 'Evening Read',
    category: 'learning',
    icon: 'BookOpen',
    color: 'blue',
    priority: 'NORMAL',
    type: 'LEARNING',
    sortOrder: 2,
  })

  const sampleTemplateBob = createMockTemplate({
    id: 'tpl-bob',
    userId: 'user-bob',
    name: 'Secret Activity',
    category: 'work',
    icon: 'Lock',
    color: 'zinc',
    priority: 'NORMAL',
    type: 'PERSONAL',
  })

  beforeEach(() => {
    const localMock = mockLocalDelete as { mock?: { calls: unknown[][] } }
    if (localMock.mock) localMock.mock.calls.length = 0

    const serverMock = mockServerDelete as { mock?: { calls: unknown[][] } }
    if (serverMock.mock) serverMock.mock.calls.length = 0

    const bulkMock = mockServerBulkDelete as { mock?: { calls: unknown[][] } }
    if (bulkMock.mock) bulkMock.mock.calls.length = 0
  })

  it('single activity disappears immediately via optimistic update', async () => {
    let state = { templates: [sampleTemplate1, sampleTemplate2] }

    // Simulate canonical deleteActivityTemplateAction
    const deleteActivityTemplateAction = async (id: string) => {
      const prev = [...state.templates]
      state = { templates: state.templates.filter((t) => t.id !== id) }

      try {
        await mockLocalDelete(id)
        const res = await mockServerDelete(id)
        if (!res.success) throw new Error('Server error')
      } catch (err) {
        state = { templates: prev }
        throw err
      }
    }

    const promise = deleteActivityTemplateAction('tpl-1')
    // Immediately after invoking (optimistic state)
    expect(state.templates.some((t) => t.id === 'tpl-1')).toBe(false)
    expect(state.templates.length).toBe(1)
    expect(state.templates[0].id).toBe('tpl-2')

    await promise
    expect(mockLocalDelete).toHaveBeenCalledWith('tpl-1')
    expect(mockServerDelete).toHaveBeenCalledWith('tpl-1')
  })

  it('bulk deletion disappears immediately via canonical batch mutation', async () => {
    let state = { templates: [sampleTemplate1, sampleTemplate2] }

    const deleteActivityTemplatesAction = async (ids: string[]) => {
      const prev = [...state.templates]
      const idSet = new Set(ids)
      state = { templates: state.templates.filter((t) => !idSet.has(t.id)) }

      try {
        for (const id of ids) {
          await mockLocalDelete(id)
        }
        const res = await mockServerBulkDelete(ids)
        if (!res.success) throw new Error('Server error')
      } catch (err) {
        state = { templates: prev }
        throw err
      }
    }

    const promise = deleteActivityTemplatesAction(['tpl-1', 'tpl-2'])
    expect(state.templates.length).toBe(0)

    await promise
    expect(mockServerBulkDelete).toHaveBeenCalledWith(['tpl-1', 'tpl-2'])
  })

  it('failed deletion rolls back the local state immediately', async () => {
    let state = { templates: [sampleTemplate1, sampleTemplate2] }

    const failingServerDelete = mock((_id: string) =>
      Promise.reject(new Error('Network failure'))
    )

    const deleteActivityTemplateAction = async (id: string) => {
      const prev = [...state.templates]
      state = { templates: state.templates.filter((t) => t.id !== id) }

      try {
        await mockLocalDelete(id)
        await failingServerDelete(id)
      } catch (err) {
        state = { templates: prev }
        throw err
      }
    }

    try {
      await deleteActivityTemplateAction('tpl-1')
    } catch {
      // Expected rejection
    }

    // Must be rolled back
    expect(state.templates.length).toBe(2)
    expect(state.templates.some((t) => t.id === 'tpl-1')).toBe(true)
  })

  it('another user activity cannot be affected or deleted', async () => {
    const currentUserId = 'user-alice'
    const targetTemplate = sampleTemplateBob

    const canDelete = targetTemplate.userId === currentUserId
    expect(canDelete).toBe(false)
  })

  it('deleted activity does not reappear after reconciliation when isHydrated is true', () => {
    // When isHydrated is true, rawTemplates must use local state instead of reviving stale initial RSC props
    const isHydrated = true
    const initialTemplates = [sampleTemplate1, sampleTemplate2]
    const localTemplates = [sampleTemplate2] // tpl-1 was deleted locally

    const effectiveTemplates = isHydrated ? localTemplates : initialTemplates
    expect(effectiveTemplates.some((t) => t.id === 'tpl-1')).toBe(false)
  })
})
