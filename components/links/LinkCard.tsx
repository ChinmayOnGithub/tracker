"use client"

import React from 'react'
import {
  Folder, Pin, Lock, ExternalLink, Copy, Check, EyeOff, Eye, Archive, Edit2, Trash2
} from 'lucide-react'
import { Button } from '@/design-system'

interface LinkTagItem {
  id: string
  name: string
  color: string
}

interface SavedLink {
  id: string
  collectionId: string
  url: string
  title: string
  description: string | null
  favicon: string | null
  thumbnail: string | null
  accentColor: string | null
  notes: string | null
  isPinned: boolean
  isPrivate: boolean
  isArchived: boolean
  openCount: number
  lastOpenedAt: string | null
  tags: LinkTagItem[]
  sortOrder: number
  createdAt: string
  updatedAt: string
}

interface LinkCardProps {
  link: SavedLink
  viewMode: 'grid' | 'list'
  copiedLinkId: string | null
  collectionColor: string
  onOpenLink: (link: SavedLink) => void
  onCopyLink: (link: SavedLink) => void
  onTogglePrivateLink: (id: string) => void
  onToggleArchiveLink: (id: string) => void
  onTogglePinLink: (id: string) => void
  onOpenEditLink: (link: SavedLink) => void
  onDeleteLink: (id: string) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onSelectTagFilter: (tag: string) => void
  onRescrapeMetadata: (link: SavedLink) => void
}

export const LinkCard: React.FC<LinkCardProps> = ({
  link,
  viewMode,
  copiedLinkId,
  collectionColor,
  onOpenLink,
  onCopyLink,
  onTogglePrivateLink,
  onToggleArchiveLink,
  onTogglePinLink,
  onOpenEditLink,
  onDeleteLink,
  onDragStart,
  onSelectTagFilter,
  onRescrapeMetadata,
}) => {
  const host = new URL(link.url).hostname

  if (viewMode === 'grid') {
    return (
      <div
        draggable
        onDragStart={(e) => onDragStart(e, link.id)}
        className={`flex flex-col bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-2xs hover:shadow-xs group hover:border-[var(--color-primary)]/20 transition-all ${
          link.isPinned ? 'ring-1 ring-amber-500/20' : ''
        }`}
      >
        {/* Card Header Media Preview */}
        <div className="relative aspect-video bg-slate-100 dark:bg-zinc-900 border-b border-[var(--color-border)] overflow-hidden shrink-0">
          {link.isPinned && (
            <div className="absolute top-2 left-2 z-10 p-1 bg-amber-500 text-white rounded-md shadow-sm">
              <Pin size={10} fill="currentColor" />
            </div>
          )}
          {link.isPrivate && (
            <div className="absolute top-2 right-2 z-10 p-1 bg-zinc-900/90 text-amber-500 rounded-md border border-amber-500/20 shadow-sm text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 flex items-center gap-1">
              <Lock size={8} />
              <span>Private</span>
            </div>
          )}

          {link.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={link.thumbnail}
              alt=""
              className="w-full h-full object-cover group-hover:scale-101 transition-transform duration-300"
            />
          ) : (
            <div 
              className="w-full h-full flex items-center justify-center relative cursor-pointer"
              onClick={() => onOpenLink(link)}
            >
              <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px] opacity-35" />
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-xs shadow-3xs border border-black/5"
                style={{
                  backgroundColor: collectionColor,
                  color: '#fff',
                }}
              >
                {host.split('.')[0] === 'www' ? host.split('.')[1]?.slice(0, 2).toUpperCase() : host.split('.')[0]?.slice(0, 2).toUpperCase()}
              </div>
            </div>
          )}

          {/* Failed Metadata Indicator Banner */}
          {link.title.toLowerCase() === 'link' && (
            <div className="absolute inset-x-0 bottom-0 bg-black/90 p-1.5 flex items-center justify-between text-[9px] text-white">
              <span className="font-semibold text-slate-300">Preview failed</span>
              <button 
                onClick={(e) => { e.stopPropagation(); onRescrapeMetadata(link); }}
                className="px-2 py-0.5 bg-indigo-600 rounded font-black hover:bg-indigo-500 cursor-pointer uppercase tracking-wider text-[8px]"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Card Content */}
        <div className="p-4 flex-1 flex flex-col justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-2">
              {link.favicon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={link.favicon} alt="" className="w-3.5 h-3.5 rounded-sm object-contain" />
              ) : (
                <Folder size={12} className="text-slate-400" />
              )}
              <span className="text-[9px] font-black text-slate-400 dark:text-zinc-550 uppercase tracking-wider truncate">{host}</span>
              <span className="text-[9px] font-black text-slate-400 dark:text-zinc-550 flex items-center gap-0.5 shrink-0">
                <span>•</span>
                <span>Added {new Date(link.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              </span>
              {link.openCount > 0 && (
                <span className="text-[9px] font-black text-slate-400 dark:text-zinc-550 flex items-center gap-0.5" title={`${link.openCount} views / copies`}>
                  <span>•</span>
                  <span>👁️ {link.openCount}</span>
                </span>
              )}
            </div>

            <h3 className="text-xs font-black text-[var(--color-text-main)] mb-1 leading-snug line-clamp-2 hover:text-[var(--color-primary)] transition-colors">
              <span className="cursor-pointer" onClick={() => onOpenLink(link)}>{link.title}</span>
            </h3>
            {link.description && (
              <p className="text-[10px] text-[var(--color-text-muted)] line-clamp-2 leading-relaxed mb-1.5">
                {link.description}
              </p>
            )}

            {/* Personal Notes */}
            {link.notes && (
              <div className="p-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-base)] text-[9px] font-medium text-slate-500 dark:text-zinc-450 italic leading-relaxed mb-2">
                Notes: {link.notes}
              </div>
            )}

            {/* Tags List */}
            {link.tags && link.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {link.tags.map(t => (
                  <button
                    key={t.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectTagFilter(t.name)
                    }}
                    className="text-[8.5px] font-bold px-1.5 py-0.25 rounded-[3px] bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-450 hover:bg-slate-200 hover:text-[var(--color-primary)] transition-colors cursor-pointer"
                  >
                    #{t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between border-t border-[var(--color-border)]/55 pt-3.5 mt-auto">
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => onOpenEditLink(link)} className="p-1" title="Edit link details">
                <Edit2 size={11} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDeleteLink(link.id)} className="p-1 text-rose-500" title="Delete Link">
                <Trash2 size={11} />
              </Button>
              <div className="w-px h-3 bg-[var(--color-border)] mx-0.5" />
              <Button variant="ghost" size="sm" onClick={() => onToggleArchiveLink(link.id)} className={`p-1 ${link.isArchived ? 'text-indigo-500' : ''}`} title={link.isArchived ? "Restore" : "Archive"}>
                <Archive size={11} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onTogglePinLink(link.id)} className={`p-1 ${link.isPinned ? 'text-amber-500' : ''}`} title={link.isPinned ? "Unpin" : "Pin"}>
                <Pin size={11} fill={link.isPinned ? "currentColor" : "none"} />
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => onCopyLink(link)} className="p-1.5" title="Copy URL">
                {copiedLinkId === link.id ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onTogglePrivateLink(link.id)} className={`p-1.5 ${link.isPrivate ? 'text-amber-500 bg-amber-500/5' : ''}`} title={link.isPrivate ? "Disable incognito" : "Enable incognito"}>
                {link.isPrivate ? <EyeOff size={11} /> : <Eye size={11} />}
              </Button>
              <Button size="sm" onClick={() => onOpenLink(link)} className="p-1.5" title={link.isPrivate ? "Copy & Alert Incognito" : "Open Link"}>
                {link.isPrivate ? <Lock size={10} /> : <ExternalLink size={10} />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // List view render
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, link.id)}
      className={`p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 group relative transition-colors ${
        link.isPinned
          ? 'bg-amber-500/5 dark:bg-amber-500/2 border-l-[3px] border-l-amber-500 pl-3.5'
          : 'border-l-[3px] border-l-transparent'
      }`}
      style={{ borderLeftColor: link.accentColor || undefined }}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {link.favicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={link.favicon} alt="" className="w-4 h-4 rounded-sm object-contain mt-0.5 shrink-0" />
        ) : (
          <Folder size={14} className="text-slate-400 mt-0.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <h3 
              onClick={() => onOpenLink(link)}
              className="text-xs font-black text-[var(--color-text-main)] truncate hover:text-[var(--color-primary)] cursor-pointer"
            >
              {link.title}
            </h3>
            {link.isPinned && <Pin size={9} className="text-amber-500 fill-amber-500 shrink-0" />}
            {link.isPrivate && (
              <span className="px-1 py-0.25 text-[8px] font-black bg-amber-500/10 text-amber-500 rounded border border-amber-500/20 uppercase">Private</span>
            )}
            <span className="text-[9px] font-black text-slate-400 dark:text-zinc-555 uppercase shrink-0">{host}</span>
            <span className="text-[8px] font-black text-slate-400 dark:text-zinc-555 flex items-center gap-0.5 shrink-0">
              <span>•</span>
              <span>Added {new Date(link.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            </span>
            {link.openCount > 0 && (
              <span className="text-[8px] font-black text-slate-400 dark:text-zinc-555 flex items-center gap-0.5 shrink-0" title={`${link.openCount} views / copies`}>
                <span>•</span>
                <span>👁️ {link.openCount}</span>
              </span>
            )}
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)] truncate max-w-2xl leading-normal mb-1">
            {link.description || link.url}
          </p>

          {/* Personal Notes */}
          {link.notes && (
            <p className="text-[9.5px] text-slate-500 dark:text-zinc-450 italic leading-relaxed mb-1">
              Notes: {link.notes}
            </p>
          )}

          {/* Tags List */}
          {link.tags && link.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {link.tags.map(t => (
                <button
                  key={t.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectTagFilter(t.name)
                  }}
                  className="text-[8.5px] font-bold px-1.5 py-0.25 rounded-[3px] bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-450 hover:bg-slate-200 hover:text-[var(--color-primary)] transition-colors cursor-pointer"
                >
                  #{t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 shrink-0">
        <Button variant="ghost" size="sm" onClick={() => onCopyLink(link)} className="p-1.5" title="Copy URL">
          {copiedLinkId === link.id ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
        </Button>

        <Button variant="ghost" size="sm" onClick={() => onTogglePrivateLink(link.id)} className={`p-1.5 ${link.isPrivate ? 'text-amber-500' : ''}`} title={link.isPrivate ? "Disable Privacy" : "Enable Privacy"}>
          {link.isPrivate ? <EyeOff size={11} /> : <Eye size={11} />}
        </Button>

        <Button variant="ghost" size="sm" onClick={() => onToggleArchiveLink(link.id)} className={`p-1.5 ${link.isArchived ? 'text-indigo-500' : ''}`} title={link.isArchived ? "Unarchive" : "Archive"}>
          <Archive size={11} />
        </Button>

        <Button size="sm" onClick={() => onOpenLink(link)} className="p-1.5" title={link.isPrivate ? "Copy & Alert Incognito" : "Open Link"}>
          {link.isPrivate ? <Lock size={10} /> : <ExternalLink size={10} />}
        </Button>

        <div className="w-px h-4 bg-slate-200 dark:bg-zinc-800 mx-1 hidden md:block" />

        <Button variant="ghost" size="sm" onClick={() => onTogglePinLink(link.id)} className={`p-1.5 ${link.isPinned ? 'text-amber-500' : ''}`} title={link.isPinned ? "Unpin" : "Pin"}>
          <Pin size={11} fill={link.isPinned ? "currentColor" : "none"} />
        </Button>

        <Button variant="ghost" size="sm" onClick={() => onOpenEditLink(link)} className="p-1.5" title="Edit">
          <Edit2 size={11} />
        </Button>

        <Button variant="ghost" size="sm" onClick={() => onDeleteLink(link.id)} className="p-1.5 text-rose-500" title="Delete">
          <Trash2 size={11} />
        </Button>
      </div>
    </div>
  )
}
