"use client"

import React from 'react'
import { Copy, Eye, EyeOff, Loader2, Pencil, Download, MoreVertical } from 'lucide-react'
import { QuickInfoFieldDTO } from '@/app/actions/vault'
import {
  IconButton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@/design-system'

export interface VaultFieldRowProps {
  field: QuickInfoFieldDTO
  isSensitive: boolean
  isRevealed: boolean
  revealedValue?: string
  isRevealing: boolean
  showDownload: boolean
  onToggleReveal: (fieldId: string) => void
  onCopy: (fieldId: string, label: string) => void
  onEdit: (field: QuickInfoFieldDTO) => void
  onDownloadDoc?: (documentId: string) => void
  onUploadDocForField?: (fieldId: string, fieldLabel: string) => void
  onDeleteCustomField?: (fieldId: string, label: string) => void
}

export const VaultFieldRow: React.FC<VaultFieldRowProps> = ({
  field,
  isSensitive,
  isRevealed,
  revealedValue,
  isRevealing,
  showDownload,
  onToggleReveal,
  onCopy,
  onEdit,
  onDownloadDoc,
  onUploadDocForField,
  onDeleteCustomField,
}) => {
  const isCustom = field.id.startsWith('custom_')

  // EMPTY FIELD STATE (fallback if rendered directly)
  if (!field.hasValue) {
    return null
  }

  // POPULATED FIELD STATE
  const displayValue = isSensitive && !isRevealed
    ? field.maskedValue
    : (revealedValue || field.maskedValue)

  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-[var(--radius-md)] bg-[var(--color-bg-base)]/50 hover:bg-[var(--color-accent)]/40 border border-transparent hover:border-[var(--color-border)] transition-all group">
      <div className="min-w-0 flex-1 pr-3">
        <span className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider block truncate">
          {field.label}
        </span>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-sm font-bold text-[var(--color-text-main)] truncate select-all tracking-tight">
            {displayValue}
          </span>

          {isSensitive && (
            <button
              type="button"
              onClick={() => onToggleReveal(field.id)}
              disabled={isRevealing}
              title={isRevealed ? "Hide secret" : "Reveal secret"}
              className="w-6 h-6 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-accent)] cursor-pointer transition-colors shrink-0"
            >
              {isRevealing ? (
                <Loader2 className="w-3 h-3 animate-spin text-[var(--color-primary)]" />
              ) : isRevealed ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Action buttons: Primary (Copy) + Secondary (Edit) + Overflow (Download / Delete) */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onCopy(field.id, field.label)}
          title={`Copy ${field.label}`}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-[var(--color-text-main)] bg-[var(--color-bg-surface)] hover:bg-[var(--color-accent)] border border-[var(--color-border)] rounded-[var(--radius-sm)] shadow-2xs transition-all cursor-pointer"
        >
          <Copy className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          <span>Copy</span>
        </button>

        <button
          type="button"
          onClick={() => onEdit(field)}
          title={`Edit ${field.label}`}
          className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-accent)] rounded-[var(--radius-sm)] transition-colors cursor-pointer"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>

        {(showDownload || isCustom) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                icon={<MoreVertical className="w-3.5 h-3.5" />}
                label="More actions"
                variant="ghost"
                size="sm"
                className="w-7 h-7 text-[var(--color-text-muted)]"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {showDownload && (
                <>
                  {field.documentId && onDownloadDoc ? (
                    <DropdownMenuItem onClick={() => onDownloadDoc(field.documentId!)}>
                      <Download className="w-3.5 h-3.5 mr-2 text-[var(--color-text-muted)]" />
                      Download Document
                    </DropdownMenuItem>
                  ) : onUploadDocForField ? (
                    <DropdownMenuItem onClick={() => onUploadDocForField(field.id, field.label)}>
                      <Download className="w-3.5 h-3.5 mr-2 text-[var(--color-text-muted)]" />
                      Attach Document
                    </DropdownMenuItem>
                  ) : null}
                </>
              )}

              {isCustom && onDeleteCustomField && (
                <>
                  {showDownload && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    variant="danger"
                    onClick={() => onDeleteCustomField(field.id, field.label)}
                  >
                    Delete Field
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
