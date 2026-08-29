export type LeaveType = 'CASUAL' | 'SICK' | 'PTO' | 'COMP_OFF' | 'HALF_DAY' | 'WFH'

export interface LeaveTypeMeta {
  key: LeaveType
  label: string
  color: string // Tailwind color key, e.g. 'red', 'purple', 'blue', 'amber', 'sky', 'emerald'
  enabled: boolean
}

export const DEFAULT_LEAVE_TYPES_META: Record<LeaveType, LeaveTypeMeta> = {
  CASUAL: {
    key: 'CASUAL',
    label: 'Casual / Sick Leave',
    color: 'blue',
    enabled: true,
  },
  SICK: {
    key: 'SICK',
    label: 'Sick Leave',
    color: 'red',
    enabled: true,
  },
  PTO: {
    key: 'PTO',
    label: 'Paid Leave (PTO)',
    color: 'purple',
    enabled: true,
  },
  COMP_OFF: {
    key: 'COMP_OFF',
    label: 'Comp Off',
    color: 'amber',
    enabled: false,
  },
  HALF_DAY: {
    key: 'HALF_DAY',
    label: 'Half Day',
    color: 'sky',
    enabled: false,
  },
  WFH: {
    key: 'WFH',
    label: 'Work From Home',
    color: 'emerald',
    enabled: false,
  },
}

export const COLOR_OPTIONS: { value: string; label: string; bgClass: string; textClass: string; borderClass: string }[] = [
  { value: 'red', label: 'Red', bgClass: 'bg-red-500/10', textClass: 'text-red-600 dark:text-red-400', borderClass: 'border-red-500/20' },
  { value: 'purple', label: 'Purple', bgClass: 'bg-purple-500/10', textClass: 'text-purple-600 dark:text-purple-400', borderClass: 'border-purple-500/20' },
  { value: 'blue', label: 'Blue', bgClass: 'bg-blue-500/10', textClass: 'text-blue-600 dark:text-blue-400', borderClass: 'border-blue-500/20' },
  { value: 'amber', label: 'Amber / Orange', bgClass: 'bg-amber-500/10', textClass: 'text-amber-600 dark:text-amber-400', borderClass: 'border-amber-500/20' },
  { value: 'sky', label: 'Sky / Cyan', bgClass: 'bg-sky-500/10', textClass: 'text-sky-600 dark:text-sky-400', borderClass: 'border-sky-500/20' },
  { value: 'emerald', label: 'Emerald / Green', bgClass: 'bg-emerald-500/10', textClass: 'text-emerald-600 dark:text-emerald-400', borderClass: 'border-emerald-500/20' },
  { value: 'pink', label: 'Pink', bgClass: 'bg-pink-500/10', textClass: 'text-pink-600 dark:text-pink-400', borderClass: 'border-pink-500/20' },
  { value: 'zinc', label: 'Zinc / Gray', bgClass: 'bg-zinc-500/10', textClass: 'text-zinc-600 dark:text-zinc-400', borderClass: 'border-zinc-500/20' },
]

export function getLeaveTypeStyle(colorKey: string) {
  const found = COLOR_OPTIONS.find(c => c.value === colorKey)
  if (found) {
    return `${found.bgClass} ${found.textClass} ${found.borderClass}`
  }
  return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
}

import { useSyncExternalStore } from 'react'

let cachedLeaveMeta: Record<LeaveType, LeaveTypeMeta> | null = null

function getSnapshot(): Record<LeaveType, LeaveTypeMeta> {
  if (typeof window === 'undefined') return DEFAULT_LEAVE_TYPES_META
  if (cachedLeaveMeta !== null) return cachedLeaveMeta
  try {
    const raw = localStorage.getItem('personal_leave_custom_meta')
    if (raw) {
      const parsed = { ...DEFAULT_LEAVE_TYPES_META, ...JSON.parse(raw) }
      cachedLeaveMeta = parsed
      return parsed
    }
  } catch (e) {
    console.error('Failed to parse personal_leave_custom_meta:', e)
  }
  cachedLeaveMeta = DEFAULT_LEAVE_TYPES_META
  return DEFAULT_LEAVE_TYPES_META
}

function getServerSnapshot(): Record<LeaveType, LeaveTypeMeta> {
  return DEFAULT_LEAVE_TYPES_META
}

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => {}
  const handler = () => {
    cachedLeaveMeta = null
    callback()
  }
  window.addEventListener('personal_settings_changed', handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener('personal_settings_changed', handler)
    window.removeEventListener('storage', handler)
  }
}

export function useLeaveMeta(): Record<LeaveType, LeaveTypeMeta> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function saveStoredLeaveMeta(meta: Record<LeaveType, LeaveTypeMeta>) {
  if (typeof window === 'undefined') return
  cachedLeaveMeta = meta
  localStorage.setItem('personal_leave_custom_meta', JSON.stringify(meta))
  window.dispatchEvent(new Event('personal_settings_changed'))
}
