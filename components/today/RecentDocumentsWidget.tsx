"use client"

import React, { useState, useEffect } from 'react'
import { Shield, Lock, FileText, FileImage, FileVideo, FileArchive, FileCode, FileSpreadsheet, File } from 'lucide-react'
import { Card, Skeleton } from '@/design-system'
import { VaultItem } from '@/app/actions/vault'

interface RecentDocumentsWidgetProps {
  isVisible: boolean
  onTabChange: (tab: string) => void
}

export const RecentDocumentsWidget: React.FC<RecentDocumentsWidgetProps> = ({
  isVisible,
  onTabChange,
}) => {
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([])
  const [vaultLoading, setVaultLoading] = useState(true)

  useEffect(() => {
    if (!isVisible) return
    async function loadVault() {
      try {
        const { listVaultItems } = await import('@/app/actions/vault')
        const res = await listVaultItems(null, undefined, 20, true)
        if (res.success) {
          setVaultItems((res.items as VaultItem[]).filter(item => !item.isFolder).slice(0, 4))
        }
      } catch (err) {
        console.error("Failed to load vault items for dashboard:", err)
      } finally {
        setVaultLoading(false)
      }
    }
    loadVault()
  }, [isVisible])

  const getVaultIcon = (mimeGroup: string | null) => {
    switch (mimeGroup) {
      case 'IMAGE': return FileImage
      case 'VIDEO': return FileVideo
      case 'ARCHIVE': return FileArchive
      case 'PDF': return FileText
      case 'TEXT': return FileText
      case 'SPREADSHEET': return FileSpreadsheet
      case 'CODE': return FileCode
      default: return File
    }
  }

  const getVaultIconColor = (mimeGroup: string | null): string => {
    switch (mimeGroup) {
      case 'IMAGE': return 'text-pink-500'
      case 'VIDEO': return 'text-purple-500'
      case 'PDF': return 'text-red-500'
      case 'ARCHIVE': return 'text-orange-500'
      case 'SPREADSHEET': return 'text-emerald-500'
      case 'TEXT': return 'text-blue-500'
      case 'CODE': return 'text-cyan-500'
      default: return 'text-[var(--color-text-muted)]'
    }
  }

  if (!isVisible) return null

  return (
    <Card className="p-4 space-y-3.5 hover:shadow-[var(--card-hover-shadow)] transition-all duration-200">
      <div className="flex items-center justify-between border-b border-[var(--color-border)]/50 pb-2">
        <span className="text-xs uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-[var(--color-external)]" />
          Secure Vault
        </span>
        <Lock className="w-3 h-3 text-[var(--color-text-muted)]" />
      </div>

      {vaultLoading ? (
        <div className="space-y-1.5 py-1">
          {[1, 2].map(i => <Skeleton key={i} className="h-6 w-full rounded-md" />)}
        </div>
      ) : vaultItems.length > 0 ? (
        <div className="space-y-1 py-0.5">
          {vaultItems.map((item: VaultItem) => {
            const IconComponent = getVaultIcon(item.mimeGroup)
            const iconColor = getVaultIconColor(item.mimeGroup)
            return (
              <div 
                key={item.id}
                onClick={() => onTabChange('documents')}
                className="flex items-center gap-2 p-1.5 rounded-md hover:bg-[var(--color-accent)]/50 transition-colors cursor-pointer border border-transparent hover:border-[var(--color-border)] group/vaultitem"
              >
                <IconComponent className={`w-3.5 h-3.5 ${iconColor} shrink-0`} />
                <span className="text-xs text-[var(--color-text-main)] font-semibold truncate flex-1 group-hover/vaultitem:text-[var(--color-primary)]">
                  {item.searchName}
                </span>
                <span className="text-[9px] text-[var(--color-text-muted)] font-mono shrink-0">
                  {item.extension ? `.${item.extension}` : ''}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="py-2 text-center text-xs text-[var(--color-text-muted)] italic">
          No files in vault yet.
        </div>
      )}
    </Card>
  )
}
