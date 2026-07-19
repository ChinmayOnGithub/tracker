import { db } from '@/lib/db'
import { analyzeRecurrence, getTodayDateStr } from '@/lib/recurrence'
import { TodayDashboardWrapper } from '@/components/TodayDashboardWrapper'
import { fetchRecurrenceLogs } from '@/lib/services/TimelineService'
import { ActivityTemplate, RecurrenceType } from '@/types'
import { getLoggedUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const loggedUser = await getLoggedUser()
  if (!loggedUser) {
    redirect('/')
  }
  
  const currentYear = new Date().getFullYear()

  const templatesRaw = await db.activityTemplate.findMany({
    where: loggedUser.username === 'admin'
      ? { OR: [{ userId: loggedUser.id }, { userId: null }] }
      : { userId: loggedUser.id },
    include: { tags: true },
    orderBy: { sortOrder: 'asc' },
  })

  const [logsRaw, journalRawForNotes, journalEntriesRaw, leaveRecordsRaw, leaveAllowancesRaw, weightRecordsRaw] = await Promise.all([
    fetchRecurrenceLogs(loggedUser.id, templatesRaw, loggedUser.username === 'admin'),
    db.journalEntry.findMany({
      where: { userId: loggedUser.id, deletedAt: null },
      orderBy: { journalDate: 'desc' },
    }),
    db.journalEntry.findMany({
      where: { userId: loggedUser.id, deletedAt: null },
      orderBy: { journalDate: 'desc' },
      take: 20,
    }),
    db.leaveRecord.findMany({
      where: {
        userId: loggedUser.id,
        deletedAt: null,
        startDate: {
          gte: new Date(`${currentYear}-01-01`),
          lte: new Date(`${currentYear}-12-31`),
        },
      },
      orderBy: { startDate: 'desc' },
    }),
    db.leaveAllowance.findMany({
      where: { userId: loggedUser.id, year: currentYear },
      orderBy: { leaveType: 'asc' },
    }),
    db.weightRecord.findMany({
      where: {
        userId: loggedUser.id,
        deletedAt: null,
        date: { gte: new Date(new Date().getTime() - 90 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { date: 'asc' },
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

  const journalEntries = journalEntriesRaw.map(e => ({
    ...e,
    journalDate: e.journalDate.toISOString(),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    deletedAt: e.deletedAt?.toISOString() ?? null,
  }))

  const leaveRecords = leaveRecordsRaw.map(r => ({
    ...r,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt?.toISOString() ?? null,
  }))

  const weightRecords = weightRecordsRaw.map(r => ({
    ...r,
    date: r.date.toISOString(),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt?.toISOString() ?? null,
  }))

  const notes = journalRawForNotes.map(j => ({
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
    <TodayDashboardWrapper
      analyzedTemplates={analyzedTemplates}
      logs={logs}
      notes={notes}
      todayStr={todayStr}
      journalEntries={journalEntries}
      leaveRecords={leaveRecords}
      leaveAllowances={leaveAllowancesRaw}
      weightRecords={weightRecords}
    />
  )
}
