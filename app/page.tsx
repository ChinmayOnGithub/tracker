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

  let templatesRaw: any[] = []
  let logsRaw: any[] = []
  let notesRaw: any[] = []
  let tagsRaw: any[] = []

  if (loggedUser) {
    // Determine filters. If logged in as admin, fetch admin and unassigned legacy data.
    const userScope = loggedUser.username === 'admin'
      ? { OR: [{ userId: loggedUser.id }, { userId: null }] }
      : { userId: loggedUser.id }

    const [tRaw, lRaw, nRaw, tgRaw] = await Promise.all([
      db.activityTemplate.findMany({
        where: userScope,
        include: {
          tags: true,
        },
        orderBy: {
          sortOrder: 'asc',
        },
      }),
      db.activityLog.findMany({
        where: userScope,
        orderBy: {
          date: 'desc',
        },
      }),
      db.note.findMany({
        where: userScope,
        orderBy: {
          date: 'desc',
        },
      }),
      db.tag.findMany({
        orderBy: {
          name: 'asc',
        },
      }),
    ])

    templatesRaw = tRaw
    logsRaw = lRaw
    notesRaw = nRaw
    tagsRaw = tgRaw
  }

  // Map database templates to match our TypeScript interfaces
  const templates: ActivityTemplate[] = templatesRaw.map(t => ({
    ...t,
    recurrenceType: t.recurrenceType as RecurrenceType,
    metadata: t.metadata,
  }))

  const logs = logsRaw.map(l => ({
    ...l,
    payload: l.payload,
  }))

  const notes = notesRaw
  const tags = tagsRaw

  // 2. Perform recurrence analysis on the server
  const todayStr = getTodayDateStr()
  
  const analyzedTemplates = templates.map(template => {
    const templateLogs = logs.filter(log => log.activityId === template.id)
    const analysis = analyzeRecurrence(template, templateLogs, todayStr)
    return {
      template,
      analysis,
    }
  })

  // 3. Filter logs completed in the last 7 days (and not skipped)
  const recentLogs = logs
    .filter(log => {
      const daysDiff = diffUTCDays(todayStr, log.date)
      return daysDiff >= 0 && daysDiff <= 7 && log.status !== 'skipped'
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  // 4. Render client coordinator
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
        initialAuthenticated={!!loggedUser}
        currentUser={loggedUser}
      />
    </main>
  )
}
