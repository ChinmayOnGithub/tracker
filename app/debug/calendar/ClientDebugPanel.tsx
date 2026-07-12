/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import React, { useState } from "react"
import { clearCacheAction, testTokenRefreshAction } from "./actions"

interface ClientDebugPanelProps {
  credential: {
    id: string
    calendarId: string
    updatedAt: string
    expiryDate: string
  } | null
  decryptStatus: string
  diagnostics: any
}

export const ClientDebugPanel: React.FC<ClientDebugPanelProps> = ({
  credential,
  decryptStatus,
  diagnostics
}) => {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleClearCache = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)
    const res = await clearCacheAction()
    if (res.success) {
      setMessage(res.message || "Cache cleared")
    } else {
      setError(res.error || "Failed to clear cache")
    }
    setLoading(false)
  }

  const handleTestToken = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)
    const res = await testTokenRefreshAction()
    if (res.success) {
      setMessage(res.message || "Token refreshed")
    } else {
      setError(res.error || "Token refresh failed")
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      {/* Messages */}
      {message && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 p-4 rounded-xl text-sm font-semibold">
          {message}
        </div>
      )}

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 p-4 rounded-xl text-sm font-semibold">
          Error: {error}
        </div>
      )}

      {/* Grid Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Connection Status Card */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white border-b pb-2">Credential Metadata</h2>
          
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Linked:</span>
              <span className={`font-semibold ${credential ? 'text-emerald-600' : 'text-rose-500'}`}>
                {credential ? 'Yes' : 'No'}
              </span>
            </div>
            
            {credential && (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-500">Credential ID:</span>
                  <span className="font-mono text-slate-800 dark:text-zinc-300">{credential.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Google Calendar:</span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-300">{credential.calendarId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Decryption status:</span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-300">{decryptStatus}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Last Synced:</span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-300">
                    {new Date(credential.updatedAt).toLocaleString()}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Cache status card */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white border-b pb-2">Cache Health Diagnostics</h2>
          
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Events Cache Entries:</span>
              <span className="font-semibold text-slate-800 dark:text-zinc-300">{diagnostics?.calendarCacheSize ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Access Tokens Cached:</span>
              <span className="font-semibold text-slate-800 dark:text-zinc-300">{diagnostics?.accessTokenCacheSize ?? 0}</span>
            </div>

            {diagnostics?.calendarCacheEntries && diagnostics.calendarCacheEntries.length > 0 && (
              <div className="pt-2 space-y-1">
                <span className="text-slate-500 block font-bold text-[10px] uppercase">Active Cache Keys:</span>
                {diagnostics.calendarCacheEntries.map((e: any, index: number) => (
                  <div key={index} className="flex justify-between font-mono text-[10px] bg-slate-50 dark:bg-zinc-950 p-1.5 rounded">
                    <span className="text-slate-500 truncate max-w-[180px]">{e.key}</span>
                    <span className="text-slate-800 dark:text-zinc-300 shrink-0">
                      {e.eventCount} ev ({e.ttlRemainingSeconds}s TTL)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Operations Panel */}
      <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-800 dark:text-white">Diagnostic Controls</h2>
        
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleClearCache}
            disabled={loading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            Clear All Caches
          </button>
          
          <button
            onClick={handleTestToken}
            disabled={loading || !credential}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            Test Token Refresh & Events API
          </button>
        </div>
      </div>
    </div>
  )
}
