import { notFound } from "next/navigation"
import { getLoggedUser } from "@/app/actions/auth"
import { db } from "@/lib/db"
import { GoogleCalendarService } from "@/modules/sync/google-calendar/services/GoogleCalendarService"
import { GoogleCredentialService } from "@/modules/sync/google-calendar/services/GoogleCredentialService"
import { ClientDebugPanel } from "./ClientDebugPanel"

export const dynamic = "force-dynamic"

export default async function DebugCalendarPage() {
  // STRICT SECURITY CHECK: Guard debug page from production
  if (process.env.NODE_ENV !== 'development') {
    notFound()
  }

  const user = await getLoggedUser()
  if (!user) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 p-4 rounded-xl text-sm font-semibold">
          Error: You must be logged in to view calendar diagnostics.
        </div>
      </div>
    )
  }

  // Fetch Google Credential info
  const credential = await db.googleCredential.findUnique({
    where: { userId: user.id }
  })

  // Check if token decodes successfully
  let decryptStatus = "None"
  if (credential) {
    try {
      const decrypted = await GoogleCredentialService.getRefreshToken(user.id)
      decryptStatus = decrypted ? `Success (Length: ${decrypted.length})` : "Failed (Empty Decrypted Token)"
    } catch (e: unknown) {
      decryptStatus = `Failed Decryption: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  // Get Cache status
  const diagnostics = GoogleCalendarService.getDebugDiagnostics()

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Warning Header */}
      <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 p-4 rounded-xl text-xs font-bold uppercase tracking-wider">
        ⚠️ Development Debug Page — Not Available in Production
      </div>

      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Google Calendar Diagnostics</h1>
          <p className="text-xs text-slate-500">Inspect credentials status, cache health, and API request diagnostics.</p>
        </div>
        <div className="text-[10px] bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 px-2 py-1 rounded-md font-mono">
          User: {user.username}
        </div>
      </div>

      <ClientDebugPanel
        credential={credential ? {
          id: credential.id,
          calendarId: credential.calendarId,
          updatedAt: credential.updatedAt.toISOString(),
          expiryDate: credential.expiryDate.toISOString()
        } : null}
        decryptStatus={decryptStatus}
        diagnostics={diagnostics}
      />
    </div>
  )
}
