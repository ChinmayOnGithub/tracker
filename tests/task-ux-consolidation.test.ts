import { expect, test, describe } from "bun:test"
import { formatMoney } from "@/lib/formatMoney"
import { taskCreateSchema } from "@/lib/validations/template"

describe("Task UX Consolidation & Today Polish Tests", () => {
  describe("formatMoney helper", () => {
    test("formats integers with currency symbol correctly", () => {
      expect(formatMoney(119)).toBe("₹119")
      expect(formatMoney(2430)).toBe("₹2,430")
      expect(formatMoney(100000)).toBe("₹1,00,000")
    })

    test("formats decimals cleanly", () => {
      expect(formatMoney(150.5)).toBe("₹150.50")
      expect(formatMoney(99.99)).toBe("₹99.99")
    })

    test("handles string number input", () => {
      expect(formatMoney("2430")).toBe("₹2,430")
      expect(formatMoney("119.50")).toBe("₹119.50")
    })

    test("returns null for missing or invalid values", () => {
      expect(formatMoney(null)).toBeNull()
      expect(formatMoney(undefined)).toBeNull()
      expect(formatMoney("")).toBeNull()
      expect(formatMoney("abc")).toBeNull()
    })

    test("supports custom currency override", () => {
      expect(formatMoney(100, "$")).toBe("$100")
      expect(formatMoney(50, "€")).toBe("€50")
    })
  })

  describe("taskCreateSchema Validation (Create & Edit)", () => {
    test("validates required task creation values", () => {
      const valid = taskCreateSchema.safeParse({
        name: "Read Chapter 4",
        category: "learning",
        icon: "BookOpen",
        color: "blue",
        priority: "NORMAL",
        type: "TASK",
        isAllDay: true,
        targetDate: "2026-08-30",
      })
      expect(valid.success).toBe(true)
    })

    test("validates optional amount and task id for edit flow", () => {
      const valid = taskCreateSchema.safeParse({
        id: "task-123",
        name: "Electricity Bill",
        category: "finance",
        icon: "Zap",
        color: "amber",
        priority: "HIGH",
        type: "BILL",
        isAllDay: false,
        startTime: "10:00",
        estimatedDuration: "15",
        targetDate: "2026-08-30",
        amount: "2430",
        notes: "Pay via electricity portal",
      })
      expect(valid.success).toBe(true)
      if (valid.success) {
        expect(valid.data.id).toBe("task-123")
        expect(valid.data.amount).toBe("2430")
      }
    })

    test("rejects blank task title", () => {
      const invalid = taskCreateSchema.safeParse({
        name: "",
        category: "general",
        targetDate: "2026-08-30",
      })
      expect(invalid.success).toBe(false)
    })
  })

  describe("Task Count & Separation of Calendar Events", () => {
    test("counts only tracker tasks and excludes external calendar events", () => {
      const timelineItems = [
        { id: "task_1", templateId: "temp_1", templateName: "Read Book", type: "TASK", completed: false },
        { id: "task_2", templateId: "temp_2", templateName: "Workout", type: "WORKOUT", completed: true },
        { id: "google_event_123", templateName: "Team Meeting with Client", type: "MEETING", completed: false },
        { id: "external_cal_456", templateName: "Doctor Appointment", type: "MEETING", completed: false },
      ]

      const trackerTasks = timelineItems.filter(
        item => !item.id.startsWith("google_") && (!!item.templateId || item.type !== "MEETING")
      )
      const calendarEvents = timelineItems.filter(
        item => item.id.startsWith("google_") || (!item.templateId && item.type === "MEETING")
      )

      expect(trackerTasks.length).toBe(2)
      expect(calendarEvents.length).toBe(2)
      expect(trackerTasks.map(t => t.templateName)).toEqual(["Read Book", "Workout"])
    })
  })
})
