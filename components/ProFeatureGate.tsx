"use client"

import React from 'react'
import { Card, CardBody, Button, Badge } from '@/design-system'
import { Sparkles, Lock, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface ProFeatureGateProps {
  isPro: boolean
  title: string
  description: string
  children: React.ReactNode
  fallback?: React.ReactNode
  className?: string
}

/**
 * Contextual feature gate for Pro capabilities.
 * 
 * When isPro === true: Renders children normally with zero obstruction.
 * When isPro === false: Renders an unobtrusive, polished locked panel with an Explore Pro CTA.
 */
export const ProFeatureGate: React.FC<ProFeatureGateProps> = ({
  isPro,
  title,
  description,
  children,
  fallback,
  className = ''
}) => {
  if (isPro) {
    return <>{children}</>
  }

  if (fallback) {
    return <>{fallback}</>
  }

  return (
    <Card className={`border-[var(--color-border)] bg-slate-50/50 dark:bg-zinc-900/30 overflow-hidden ${className}`}>
      <CardBody className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-xl">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <h4 className="text-sm font-bold text-[var(--color-text-main)]">
              {title}
            </h4>
            <Badge variant="default" size="sm" className="font-semibold text-[10px]">
              <Sparkles className="w-2.5 h-2.5 mr-1" />
              Available with Pro
            </Badge>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed pl-8">
            {description}
          </p>
        </div>

        <div className="sm:shrink-0 pl-8 sm:pl-0">
          <Link href="/pricing">
            <Button variant="primary" size="sm" className="flex items-center gap-1.5 font-semibold text-xs">
              <span>Explore Pro</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </CardBody>
    </Card>
  )
}
