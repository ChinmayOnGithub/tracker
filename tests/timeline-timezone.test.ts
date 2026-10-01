import { describe, it, expect, mock } from 'bun:test'
import { TimelineService } from '@/lib/services/TimelineService'
import { db } from '@/lib/db'
import type { ActivityTemplate, ActivityLog, UserSetting } from '@prisma/client'

describe('Issue #134: TimelineService User-Timezone Scheduling', () => {
  const userId = 'usr_timeline_tz_test'
  const todayStr = '2026-09-20'

  it('constructs timed activity start time in user IANA timezone rather than server timezone', async () => {
    const origFindManyTemplates = db.activityTemplate.findMany
    const origFindManyLogs = db.activityLog.findMany
    const origFindManyLeaves = db.leaveRecord.findMany
    const origFindUniqueSetting = db.userSetting.findUnique

    try {
      // Mock template: timed task at 09:00 AM
      db.activityTemplate.findMany = mock(() =>
        Promise.resolve([
          {
            id: 'tmpl_timed_task',
            userId,
            name: 'Morning Standup',
            category: 'work',
            type: 'TASK',
            priority: 'HIGH',
            estimatedDuration: 30,
            energyRequired: 'MEDIUM',
            icon: 'CheckSquare',
            color: '#3b82f6',
            isActive: true,
            notes: null,
            amount: null,
            recurrenceType: 'daily',
            recurrenceInterval: 1,
            recurrenceDaysOfWeek: null,
            recurrenceDayOfMonth: null,
            recurrenceMonth: null,
            metadata: {
              isAllDay: false,
              startTime: '09:00',
            },
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            tags: [],
          },
        ] as unknown as ActivityTemplate[])
      ) as unknown as typeof db.activityTemplate.findMany

      db.activityLog.findMany = mock(() => Promise.resolve([] as ActivityLog[])) as unknown as typeof db.activityLog.findMany
      db.leaveRecord.findMany = mock(() => Promise.resolve([])) as unknown as typeof db.leaveRecord.findMany

      // Test 1: User timezone is Asia/Kolkata (+05:30)
      // 09:00 AM IST must produce UTC start of 03:30 AM
      db.userSetting.findUnique = mock(() =>
        Promise.resolve({
          id: 'setting_1',
          userId,
          module: 'GENERAL',
          config: { timezone: 'Asia/Kolkata' },
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as UserSetting)
      ) as unknown as typeof db.userSetting.findUnique

      const timelineIST = await TimelineService.generateTimeline({
        userId,
        todayStr,
        calendarEvents: [],
      })

      expect(timelineIST.length).toBe(1)
      expect(timelineIST[0].templateName).toBe('Morning Standup')
      expect(timelineIST[0].isAllDay).toBe(false)
      expect(timelineIST[0].start.toISOString()).toBe('2026-09-20T03:30:00.000Z')
      expect(timelineIST[0].end.toISOString()).toBe('2026-09-20T04:00:00.000Z')

      // Test 2: User timezone is America/New_York (EDT: -04:00)
      // 09:00 AM EDT must produce UTC start of 13:00 PM
      db.userSetting.findUnique = mock(() =>
        Promise.resolve({
          id: 'setting_1',
          userId,
          module: 'GENERAL',
          config: { timezone: 'America/New_York' },
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as UserSetting)
      ) as unknown as typeof db.userSetting.findUnique

      const timelineEDT = await TimelineService.generateTimeline({
        userId,
        todayStr,
        calendarEvents: [],
      })

      expect(timelineEDT.length).toBe(1)
      expect(timelineEDT[0].start.toISOString()).toBe('2026-09-20T13:00:00.000Z')
      expect(timelineEDT[0].end.toISOString()).toBe('2026-09-20T13:30:00.000Z')
    } finally {
      db.activityTemplate.findMany = origFindManyTemplates
      db.activityLog.findMany = origFindManyLogs
      db.leaveRecord.findMany = origFindManyLeaves
      db.userSetting.findUnique = origFindUniqueSetting
    }
  })
})
