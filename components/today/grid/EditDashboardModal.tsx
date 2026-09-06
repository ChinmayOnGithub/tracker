"use client"

/**
 * EditDashboardModal
 * Modal allowing users to toggle widget visibility and restore default grid layouts.
 */

import React, { useState } from 'react'
import { Plus, Eye, RotateCcw } from 'lucide-react'
import { WIDGET_REGISTRY } from '@/lib/dashboard/registry'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, ConfirmDialog } from '@/design-system'

interface EditDashboardModalProps {
  isOpen: boolean
  onClose: () => void
  hiddenWidgets: string[]
  onToggleWidget: (widgetId: string) => void
  onResetLayout: () => void
}

export const EditDashboardModal: React.FC<EditDashboardModalProps> = ({
  isOpen,
  onClose,
  hiddenWidgets,
  onToggleWidget,
  onResetLayout,
}) => {
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false)

  const categories = Array.from(new Set(WIDGET_REGISTRY.map(w => w.category)))

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Customize Dashboard Widgets</DialogTitle>
            <DialogDescription>
              Enable or hide widgets on your Today dashboard. Changes are saved automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="p-5 space-y-6 max-h-[60vh] overflow-y-auto">
            {categories.map(cat => {
              const catWidgets = WIDGET_REGISTRY.filter(w => w.category === cat)
              return (
                <div key={cat} className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                    {cat}
                  </span>
                  <div className="space-y-2">
                    {catWidgets.map(widget => {
                      const isHidden = hiddenWidgets.includes(widget.id)
                      return (
                        <div
                          key={widget.id}
                          className="flex items-center justify-between p-3 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-lg)] hover:border-[var(--color-border)]/80 transition-colors"
                        >
                          <div className="flex-1 min-w-0 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-[var(--color-text-main)]">
                                {widget.title}
                              </span>
                              <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                                (default {widget.defaultW}×{widget.defaultH})
                              </span>
                            </div>
                            <p className="text-[11px] text-[var(--color-text-muted)] truncate mt-0.5">
                              {widget.description}
                            </p>
                          </div>

                          <Button
                            variant={isHidden ? 'outline' : 'secondary'}
                            size="sm"
                            onClick={() => onToggleWidget(widget.id)}
                            icon={isHidden ? <Plus className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            className="shrink-0 text-xs"
                          >
                            {isHidden ? 'Add to Grid' : 'Visible'}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <DialogFooter className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsResetConfirmOpen(true)}
              icon={<RotateCcw className="w-3.5 h-3.5" />}
              className="text-xs text-[var(--color-text-muted)] hover:text-rose-500"
            >
              Reset Layout
            </Button>
            <Button variant="primary" size="sm" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        onConfirm={() => {
          onResetLayout()
          setIsResetConfirmOpen(false)
        }}
        title="Reset Dashboard Layout"
        description="Are you sure you want to reset all widget positions and sizes to their default layout? Your widget data and current visibility choices will be kept."
        confirmText="Reset Layout"
        cancelText="Cancel"
        variant="primary"
      />
    </>
  )
}
