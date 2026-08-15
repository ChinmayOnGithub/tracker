"use client"

import React, { useState, useEffect } from 'react'
import { Shield, Lock, FileText, FileImage, FileVideo, FileArchive, FileCode, FileSpreadsheet, File } from 'lucide-react'
import { Card, CardHeader, CardBody, Skeleton, ListRow } from '@/design-system'
import { VaultItem } from '@/app/actions/vault'

interface RecentDocumentsWidgetProps {
  isVisible: boolean
  onTabChange: (tab: string) => void
}

/**
 * RecentDocumentsWidget
 * Standardized to match Card hierarchies and utilize ListRow for listing files.
 */
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
    <Card className="hover:shadow-[var(--card-hover-shadow)] transition-all duration-200">
      <CardHeader className="pb-2 border-b border-[var(--color-border)]/40 mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-[var(--color-external)]" />
          Secure Vault
        </span>
        <Lock className="w-3 h-3 text-[var(--color-text-muted)]" />
      </CardHeader>

      <CardBody className="py-1">
        {vaultLoading ? (
          <div className="space-y-1.5 py-1">
            {[1, 2].map(i => <Skeleton key={i} className="h-6 w-full rounded-md" />)}
          </div>
        ) : vaultItems.length > 0 ? (
          <div className="flex flex-col">
            {vaultItems.map((item: VaultItem) => {
              const IconComponent = getVaultIcon(item.mimeGroup)
              const iconColor = getVaultIconColor(item.mimeGroup)
              return (
                <ListRow
                  key={item.id}
                  left={<IconComponent className={`w-3.5 h-3.5 ${iconColor}`} />}
                  title={item.searchName}
                  right={
                    <span className="text-[9px] text-[var(--color-text-muted)] font-mono">
                      {item.extension ? `.${item.extension}` : ''}
                    </span>
                  }
                  onClick={() => onTabChange('documents')}
                  className="px-1.5 py-1.5 hover:bg-[var(--color-accent)]/30 rounded-md"
                />
              )
            })}
          </div>
        ) : (
          <div className="py-4 text-center text-xs text-[var(--color-text-muted)] italic">
            No files in vault yet.
          </div>
        )}
      </CardBody>
    </Card>
  )
}
