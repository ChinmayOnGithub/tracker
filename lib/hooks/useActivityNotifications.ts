"use client"

import { useEffect, useRef, useCallback } from 'react'
import { TimelineItem } from '@/types'

interface NotificationRule {
  offsetMinutes?: number
}

interface TestAnalyzedTemplate {
  template: {
    id: string
    name: string
    notificationRules?: unknown
  }
}

interface NotificationConfig {
  /** Whether notifications are enabled globally. */
  enabled?: boolean
}

export function useActivityNotifications(
  timeline: TimelineItem[],
  analyzedTemplates: TestAnalyzedTemplate[],
  config: NotificationConfig = {}
) {
  const { enabled = true } = config
  const scheduledRef = useRef<Set<string>>(new Set())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Request browser Notification permission
  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return

    if (Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [enabled])

  const scheduleNotification = useCallback((item: TimelineItem) => {
    if (!enabled) return
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return

    // Only schedule for timed, non-completed items with a start time
    if (item.isAllDay || item.completed || !item.start) return

    // Find the corresponding template to read notification rules
    if (!item.templateId) return
    const match = analyzedTemplates.find(t => t.template.id === item.templateId)
    if (!match) return

    const rawRules = match.template.notificationRules
    if (!rawRules) return

    let rules: NotificationRule[] = []
    try {
      rules = typeof rawRules === 'string' ? JSON.parse(rawRules) : (rawRules as NotificationRule[])
    } catch (e) {
      console.error('Failed to parse notification rules', e)
    }

    if (!Array.isArray(rules) || rules.length === 0) return

    // We can pick the first rule (e.g. offsetMinutes)
    const rule = rules[0]
    // offsetMinutes could be negative (e.g. -15 for 15 mins before) or positive
    const offsetMin = typeof rule.offsetMinutes === 'number' ? rule.offsetMinutes : -15
    const leadMs = Math.abs(offsetMin) * 60 * 1000

    const notifId = `${item.id}_${item.start}`
    if (scheduledRef.current.has(notifId)) return

    const startTime = new Date(item.start).getTime()
    const fireAt = startTime - leadMs
    const now = Date.now()
    const delay = fireAt - now

    // Don't schedule if already passed or more than 24 hours away
    if (delay < 0 || delay > 24 * 60 * 60 * 1000) return

    scheduledRef.current.add(notifId)

    const timer = setTimeout(() => {
      const startDate = new Date(item.start!)
      const timeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

      new Notification(`${item.templateName}`, {
        body: `Starting in ${Math.abs(offsetMin)} min at ${timeStr}`,
        icon: '/favicon.ico',
        tag: notifId,
        silent: false,
      })

      timersRef.current.delete(notifId)
    }, delay)

    timersRef.current.set(notifId, timer)
  }, [enabled, analyzedTemplates])

  // Schedule notifications for timeline updates
  useEffect(() => {
    if (!enabled) return

    timeline.forEach(item => {
      scheduleNotification(item)
    })

    const currentTimers = timersRef.current
    // Cleanup timers on unmount or updates
    return () => {
      currentTimers.forEach(timer => clearTimeout(timer))
      currentTimers.clear()
    }
  }, [timeline, scheduleNotification, enabled])

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
    const result = await Notification.requestPermission()
    return result
  }, [])

  const permissionStatus = typeof window !== 'undefined' && 'Notification' in window
    ? Notification.permission
    : 'unsupported'

  return { requestPermission, permissionStatus }
}
