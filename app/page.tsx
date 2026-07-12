import { db } from '@/lib/db'
import { analyzeRecurrence, getTodayDateStr, diffUTCDays } from '@/lib/recurrence'
import { DashboardClient } from '@/components/DashboardClient'
import { ActivityTemplate, RecurrenceType } from '@/types'
import { getLoggedUser } from '@/app/actions/auth'

// Disable caching for this route so that the page always renders with fresh database values
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const loggedUser = await getLoggedUser()
  const currentYear = new Date().getFullYear()

  const [templatesRaw, logsRaw, notesRaw, tagsRaw, journalEntriesRaw, leaveRecordsRaw, leaveAllowancesRaw, weightRecordsRaw] = loggedUser
    ? await Promise.all([
        db.activityTemplate.findMany({
          where: loggedUser.username === 'admin'
            ? { OR: [{ userId: loggedUser.id }, { userId: null }] }
            : { userId: loggedUser.id },
          include: { tags: true },
          orderBy: { sortOrder: 'asc' },
        }),
        db.activityLog.findMany({
          where: loggedUser.username === 'admin'
            ? { OR: [{ userId: loggedUser.id }, { userId: null }] }
            : { userId: loggedUser.id },
          orderBy: { logDate: 'desc' },
        }),
        db.note.findMany({
          where: loggedUser.username === 'admin'
            ? { OR: [{ userId: loggedUser.id }, { userId: null }] }
            : { userId: loggedUser.id },
          orderBy: { date: 'desc' },
        }),
        db.tag.findMany({ orderBy: { name: 'asc' } }),
        // Journal entries — newest first, last 20 for initial page load
        db.journalEntry.findMany({
          where: { userId: loggedUser.id, deletedAt: null },
          orderBy: { journalDate: 'desc' },
          take: 20,
        }),
        // Leave records for current year
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
        // Leave allowances for current year
        db.leaveAllowance.findMany({
          where: { userId: loggedUser.id, year: currentYear },
          orderBy: { leaveType: 'asc' },
        }),
        // Weight records — last 90 days
        db.weightRecord.findMany({
          where: {
            userId: loggedUser.id,
            deletedAt: null,
            date: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { date: 'asc' },
        }),
      ])
    : [[], [], [], [], [], [], [], []]

  const templates: ActivityTemplate[] = templatesRaw.map(t => ({
    ...t,
    recurrenceType: t.recurrenceType as RecurrenceType,
    targetDate: t.targetDate ? t.targetDate.toISOString().split('T')[0] : null,
    metadata: t.metadata,
  }))

  const logs = logsRaw.map(l => ({
    ...l,
    date: l.logDate.toISOString().split('T')[0],
    payload: l.payload,
  }))

  const notes = notesRaw
  const tags = tagsRaw

  // 2. Perform recurrence analysis on the server
  const todayStr = getTodayDateStr()

  const analyzedTemplates = templates.map(template => {
    const templateLogs = logs.filter(log => log.activityId === template.id)
    const analysis = analyzeRecurrence(template, templateLogs, todayStr)
    return { template, analysis }
  })

  // 3. Filter logs completed in the last 7 days (and not skipped)
  const recentLogs = logs
    .filter(log => {
      const daysDiff = diffUTCDays(todayStr, log.date)
      return daysDiff >= 0 && daysDiff <= 7 && log.status !== 'skipped'
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  // 4. Serialize journal entries (Date → string for client boundary)
  const journalEntries = journalEntriesRaw.map(e => ({
    ...e,
    journalDate: e.journalDate.toISOString(),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    deletedAt: e.deletedAt?.toISOString() ?? null,
  }))

  // 5. Serialize leave records
  const leaveRecords = leaveRecordsRaw.map(r => ({
    ...r,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt?.toISOString() ?? null,
  }))

  // 6. Serialize weight records
  const weightRecords = weightRecordsRaw.map(r => ({
    ...r,
    date: r.date.toISOString(),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt?.toISOString() ?? null,
  }))

  // 7. Render client coordinator
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 antialiased transition-colors duration-200">
      <DashboardClient
        key={loggedUser?.id || 'guest'}
        templates={templates}
        logs={logs}
        notes={notes}
        tags={tags}
        analyzedTemplates={analyzedTemplates}
        recentLogs={recentLogs}
        journalEntries={journalEntries}
        leaveRecords={leaveRecords}
        leaveAllowances={leaveAllowancesRaw}
        weightRecords={weightRecords}
        currentYear={currentYear}
        initialAuthenticated={!!loggedUser}
        currentUser={loggedUser}
      />
    </main>
  )
}
