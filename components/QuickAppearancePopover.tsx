"use client"

import React, { useState, useEffect } from 'react'
import { Palette, Check } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/design-system'

const ACCENT_COLORS = [
  { id: 'blue', label: 'Blue', color: 'bg-blue-500' },
  { id: 'purple', label: 'Purple', color: 'bg-purple-500' },
  { id: 'green', label: 'Green', color: 'bg-green-500' },
  { id: 'orange', label: 'Orange', color: 'bg-orange-500' },
  { id: 'indigo', label: 'Indigo', color: 'bg-indigo-400' },
  { id: 'rose', label: 'Rose', color: 'bg-rose-500' },
  { id: 'emerald', label: 'Emerald', color: 'bg-emerald-500' },
  { id: 'amber', label: 'Amber', color: 'bg-amber-500' },
  { id: 'cyan', label: 'Cyan', color: 'bg-cyan-500' },
] as const

const FONT_SIZES = [
  { id: 'sm', label: 'Small' },
  { id: 'md', label: 'Medium' },
  { id: 'lg', label: 'Large' },
] as const

const CORNER_RADII = [
  { id: 'none', label: 'Sharp' },
  { id: 'md', label: 'Smooth' },
  { id: 'full', label: 'Pill' },
] as const

export const QuickAppearancePopover: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [accent, setAccent] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('personal_accent_color') || 'blue'
    }
    return 'blue'
  })
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('personal_font_size') || 'md'
    }
    return 'md'
  })
  const [rounded, setRounded] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('personal_rounded_corners') || 'md'
    }
    return 'md'
  })

  useEffect(() => {
    const handleUpdate = () => {
      setAccent(localStorage.getItem('personal_accent_color') || 'blue')
      setFontSize(localStorage.getItem('personal_font_size') || 'md')
      setRounded(localStorage.getItem('personal_rounded_corners') || 'md')
    }

    window.addEventListener('personal_settings_changed', handleUpdate)
    return () => window.removeEventListener('personal_settings_changed', handleUpdate)
  }, [])

  const saveSetting = (key: string, val: string) => {
    localStorage.setItem(key, val)
    window.dispatchEvent(new Event('personal_settings_changed'))
    
    // Asynchronously sync with canonical server UserSetting
    if (key === 'personal_accent_color') {
      import('@/app/actions/settings').then(({ saveUserAppearanceAction }) => {
        saveUserAppearanceAction({ accent: val }).catch(console.error)
      })
    } else if (key === 'personal_font_size') {
      import('@/app/actions/settings').then(({ saveUserAppearanceAction }) => {
        saveUserAppearanceAction({ fontSize: val }).catch(console.error)
      })
    } else if (key === 'personal_rounded_corners') {
      import('@/app/actions/settings').then(({ saveUserAppearanceAction }) => {
        saveUserAppearanceAction({ rounded: val }).catch(console.error)
      })
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Quick Theme & Appearance Customizer"
          className={`p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-accent)] hover:text-[var(--color-text-main)] transition-colors duration-150 cursor-pointer ${className}`}
          aria-label="Customize Appearance"
        >
          <Palette className="w-3.5 h-3.5 text-[var(--color-primary)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-3.5 space-y-3.5 shadow-2xl z-50">
        <div className="flex items-center justify-between pb-1.5 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            <span className="text-xs font-black uppercase tracking-wider text-[var(--color-text-main)]">
              Quick Theme
            </span>
          </div>
          <span className="text-[10px] text-[var(--color-text-muted)] font-semibold">Live Preview</span>
        </div>

        {/* Accent Colors */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            Accent Color
          </span>
          <div className="grid grid-cols-5 gap-1.5">
            {ACCENT_COLORS.map(col => {
              const isSelected = accent === col.id
              return (
                <button
                  key={col.id}
                  onClick={() => {
                    setAccent(col.id)
                    saveSetting('personal_accent_color', col.id)
                  }}
                  title={col.label}
                  className={`flex flex-col items-center gap-1 p-1 rounded-md border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                      : 'border-transparent hover:bg-slate-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full ${col.color} flex items-center justify-center text-white`}>
                    {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </span>
                  <span className="text-[9px] font-medium text-[var(--color-text-muted)] truncate max-w-[40px]">
                    {col.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Font Size & Radius */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--color-border)]/50">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              Text Size
            </span>
            <div className="flex gap-1 bg-slate-100 dark:bg-zinc-900/60 p-0.5 rounded-md border border-[var(--color-border)]">
              {FONT_SIZES.map(f => (
                <button
                  key={f.id}
                  onClick={() => {
                    setFontSize(f.id)
                    saveSetting('personal_font_size', f.id)
                  }}
                  className={`flex-1 py-1 text-[10px] font-bold rounded transition-all cursor-pointer ${
                    fontSize === f.id
                      ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-main)] shadow-xs'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              Corner Radius
            </span>
            <div className="flex gap-1 bg-slate-100 dark:bg-zinc-900/60 p-0.5 rounded-md border border-[var(--color-border)]">
              {CORNER_RADII.map(r => (
                <button
                  key={r.id}
                  onClick={() => {
                    setRounded(r.id)
                    saveSetting('personal_rounded_corners', r.id)
                  }}
                  className={`flex-1 py-1 text-[10px] font-bold rounded transition-all cursor-pointer ${
                    rounded === r.id
                      ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-main)] shadow-xs'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
