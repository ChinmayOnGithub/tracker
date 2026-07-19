import { db } from '@/lib/db'
import { analyzeRecurrence, getTodayDateStr, diffUTCDays } from '@/lib/recurrence'
import { ActivitiesWrapper } from '@/components/ActivitiesWrapper'
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

  const [logsRaw, journalRaw, tagsRaw] = await Promise.all([
    fetchRecurrenceLogs(loggedUser.id, templatesRaw, loggedUser.username === 'admin'),
    db.journalEntry.findMany({
      where: { userId: loggedUser.id, deletedAt: null },
      orderBy: { journalDate: 'desc' },
    }),
    db.tag.findMany({ orderBy: { name: 'asc' } }),
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

  // Filter logs completed in the last 7 days (and not skipped)
  const recentLogs = logs
    .filter(log => {
      const daysDiff = diffUTCDays(todayStr, log.date)
      return daysDiff >= 0 && daysDiff <= 7 && log.status !== 'skipped'
    })
    .sort((a, b) => b.date.localeCompare(a.date))

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
    <ActivitiesWrapper
      analyzedTemplates={analyzedTemplates}
      recentLogs={recentLogs}
      tags={tagsRaw}
      templates={templates}
      logs={logs}
      notes={notes}
    />
  )
}
