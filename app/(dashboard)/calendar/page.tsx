import { db } from '@/lib/db'
import { analyzeRecurrence, getTodayDateStr } from '@/lib/recurrence'
import { CalendarWrapper } from '@/components/CalendarWrapper'
import { ActivityTemplate, RecurrenceType } from '@/types'
import { getLoggedUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'

import { fetchRecurrenceLogs } from '@/lib/services/TimelineService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const loggedUser = await getLoggedUser()
  if (!loggedUser) {
    redirect('/')
  }

  const templatesRaw = await db.activityTemplate.findMany({
    where: loggedUser.username === 'admin'
      ? { OR: [{ userId: loggedUser.id }, { userId: null }] }
      : { userId: loggedUser.id },
    include: { tags: true },
    orderBy: { sortOrder: 'asc' },
  })

  const [logsRaw, journalRaw] = await Promise.all([
    fetchRecurrenceLogs(loggedUser.id, templatesRaw, loggedUser.username === 'admin'),
    db.journalEntry.findMany({
      where: { userId: loggedUser.id, deletedAt: null },
      orderBy: { journalDate: 'desc' },
    }),
  ])

  const templates: ActivityTemplate[] = templatesRaw.map(t => ({
    ...t,
    recurrenceType: t.recurrenceType as RecurrenceType,
    targetDate: t.targetDate ? t.targetDate.toISOString().split('T')[0] : null,
    metadata: t.metadata,
  }))

  const logs = logsRaw.map(l => ({
    ...l,
    date: l.logDate ? l.logDate.toISOString().split('T')[0] : l.date,
    payload: l.payload,
  }))

  const todayStr = getTodayDateStr()

  const analyzedTemplates = templates.map(template => {
    const templateLogs = logs.filter(log => log.activityId === template.id)
    const analysis = analyzeRecurrence(template, templateLogs, todayStr)
    return { template, analysis }
  })

  const notes = journalRaw.map(j => ({
    id: j.id,
    date: j.journalDate.toISOString().split('T')[0],
    title: null,
    content: j.content,
    userId: loggedUser.id,
    createdAt: j.journalDate,
    updatedAt: j.journalDate,
    deletedAt: null
  }))

  return (
    <CalendarWrapper
      logs={logs}
      templates={templates}
      notes={notes}
      todayStr={todayStr}
      analyzedTemplates={analyzedTemplates}
    />
  )
}
