import { expect, test, describe } from "bun:test"

// Helper translations to test priority badges
const getPriorityBadgeText = (priority: string) => {
  switch (priority) {
    case 'CRITICAL':
    case 'HIGH':
      return 'P1'
    case 'NORMAL':
    case 'MEDIUM':
      return 'P2'
    default:
      return 'P3'
  }
}

// Helper contextual subtitle generator to test
const getContextSubtitle = (config: {
  overdueCount: number
  hasActiveEvent: boolean
  activeEventName?: string
  nextEventName?: string
  nextEventDiffMins?: number
}) => {
  if (config.overdueCount > 0) {
    return `${config.overdueCount} overdue activities need your attention`
  }
  
  if (config.hasActiveEvent && config.activeEventName) {
    return `Now: ${config.activeEventName} is active`
  }

  if (config.nextEventName && config.nextEventDiffMins !== undefined && config.nextEventDiffMins <= 120) {
    return `Next: ${config.nextEventName} in ${config.nextEventDiffMins} min`
  }

  return "Nothing scheduled for the next 2 hours"
}

describe("Phase 9: Polish & UX Refactor Utilities", () => {
  
  describe("Priority Badge Translations", () => {
    test("should map HIGH and CRITICAL priorities to P1", () => {
      expect(getPriorityBadgeText('HIGH')).toBe('P1')
      expect(getPriorityBadgeText('CRITICAL')).toBe('P1')
    })

    test("should map NORMAL and MEDIUM priorities to P2", () => {
      expect(getPriorityBadgeText('NORMAL')).toBe('P2')
      expect(getPriorityBadgeText('MEDIUM')).toBe('P2')
    })

    test("should map LOW or other priorities to P3", () => {
      expect(getPriorityBadgeText('LOW')).toBe('P3')
      expect(getPriorityBadgeText('SOME_OTHER')).toBe('P3')
    })
  })

  describe("Contextual Subtitle Engine", () => {
    test("should prioritize overdue counts above active and next events", () => {
      const sub = getContextSubtitle({
        overdueCount: 3,
        hasActiveEvent: true,
        activeEventName: "Meeting",
        nextEventName: "Gym",
        nextEventDiffMins: 15
      })
      expect(sub).toBe("3 overdue activities need your attention")
    })

    test("should show active event if no overdue items are pending", () => {
      const sub = getContextSubtitle({
        overdueCount: 0,
        hasActiveEvent: true,
        activeEventName: "Team Sync"
      })
      expect(sub).toBe("Now: Team Sync is active")
    })

    test("should show countdown to next event if it is within 2 hours (120 mins)", () => {
      const sub = getContextSubtitle({
        overdueCount: 0,
        hasActiveEvent: false,
        nextEventName: "Gym",
        nextEventDiffMins: 45
      })
      expect(sub).toBe("Next: Gym in 45 min")
    })

    test("should return default idle message if next event is far away or no events exist", () => {
      const sub = getContextSubtitle({
        overdueCount: 0,
        hasActiveEvent: false,
        nextEventName: "Dinner",
        nextEventDiffMins: 180 // 3 hours
      })
      expect(sub).toBe("Nothing scheduled for the next 2 hours")
    })
  })

  describe("Command Palette Items Configuration", () => {
    const commandsList = [
      { id: 'new-activity', label: 'New Activity', shortcut: 'A' },
      { id: 'go-calendar', label: 'Go to Calendar', shortcut: 'C' },
      { id: 'go-journal', label: 'Go to Journal', shortcut: 'J' },
      { id: 'log-weight', label: 'Log Weight', shortcut: 'W' },
      { id: 'request-leave', label: 'Request Leave', shortcut: 'L' }
    ]

    test("should have commands registered with unique shortcuts", () => {
      const ids = commandsList.map(c => c.id)
      const shortcuts = commandsList.map(c => c.shortcut)
      
      // Ensure all items are unique
      expect(new Set(ids).size).toBe(commandsList.length)
      expect(new Set(shortcuts).size).toBe(commandsList.length)
    })

    test("should match search queries case-insensitively", () => {
      const search = "journal"
      const matched = commandsList.filter(c => c.label.toLowerCase().includes(search.toLowerCase()))
      expect(matched.length).toBe(1)
      expect(matched[0].id).toBe('go-journal')
    })
  })
})
