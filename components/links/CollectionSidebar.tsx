"use client"

import React from 'react'
import {
  Folder, Pin, Lock, Archive, Search, Edit2, Trash2, Tag, Keyboard, Upload, Download, FolderPlus
} from 'lucide-react'

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

interface LinkCollection {
  id: string
  name: string
  color: string
  icon: string | null
  sortOrder: number
  links: SavedLink[]
}

interface CollectionSidebarProps {
  collections: LinkCollection[]
  activeCollectionId: string | null
  setActiveCollectionId: (id: string | null) => void
  activeTab: 'all' | 'pinned' | 'archived' | 'private'
  setActiveTab: (tab: 'all' | 'pinned' | 'archived' | 'private') => void
  selectedTagFilter: string | null
  setSelectedTagFilter: (tag: string | null) => void
  tagsList: LinkTagItem[]
  colSearchQuery: string
  setColSearchQuery: (query: string) => void
  mobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
  dragOverColId: string | null
  onDragOver: (e: React.DragEvent, colId: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, targetColId: string) => void
  onOpenImport: () => void
  onOpenExport: () => void
  onOpenAddCol: () => void
  onOpenEditCol: (col: LinkCollection) => void
  onDeleteCol: (id: string) => void
  onOpenShortcutsHelp: () => void
}

export const CollectionSidebar: React.FC<CollectionSidebarProps> = ({
  collections,
  activeCollectionId,
  setActiveCollectionId,
  activeTab,
  setActiveTab,
  selectedTagFilter,
  setSelectedTagFilter,
  tagsList,
  colSearchQuery,
  setColSearchQuery,
  mobileMenuOpen,
  setMobileMenuOpen,
  dragOverColId,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpenImport,
  onOpenExport,
  onOpenAddCol,
  onOpenEditCol,
  onDeleteCol,
  onOpenShortcutsHelp,
}) => {
  // Filter collections based on search query
  const filteredCols = collections.filter(c =>
    c.name.toLowerCase().includes(colSearchQuery.toLowerCase())
  )

  return (
    <aside className={`w-72 shrink-0 bg-[var(--color-bg-surface)] border-r border-[var(--color-border)] flex flex-col justify-between transition-transform lg:translate-x-0 ${
      mobileMenuOpen ? 'fixed inset-y-0 left-0 z-40 translate-x-0 pt-16' : 'hidden lg:flex'
    }`}>
      <div className="flex-grow flex flex-col min-h-0">
        
        {/* Header Bar */}
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <span className="text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]">Link Library</span>
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenImport}
              className="p-1 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 text-[var(--color-text-main)] transition-colors cursor-pointer"
              title="Import HTML Bookmarks"
            >
              <Upload size={13} />
            </button>
            <button
              onClick={onOpenExport}
              className="p-1 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 text-[var(--color-text-main)] transition-colors cursor-pointer"
              title="Export Bookmarks"
            >
              <Download size={13} />
            </button>
            <button
              onClick={onOpenAddCol}
              className="p-1 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 text-[var(--color-text-main)] transition-colors cursor-pointer"
              title="Create Collection"
            >
              <FolderPlus size={13} />
            </button>
          </div>
        </div>

        {/* Quick Filters */}
        <div className="p-2 border-b border-[var(--color-border)]/50 space-y-0.5 shrink-0">
          <button
            onClick={() => { setActiveTab('all'); setSelectedTagFilter(null); }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[3px] text-xs transition-colors text-left cursor-pointer ${
              activeTab === 'all' && !selectedTagFilter
                ? 'bg-slate-100 dark:bg-zinc-800/80 text-[var(--color-text-main)] font-semibold'
                : 'text-[var(--color-text-muted)] hover:bg-slate-50 dark:hover:bg-zinc-900/40 hover:text-[var(--color-text-main)]'
            }`}
          >
            <Folder size={12} className="text-slate-400 dark:text-zinc-500" />
            <span>All Bookmarks</span>
          </button>
          <button
            onClick={() => { setActiveTab('pinned'); setSelectedTagFilter(null); }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[3px] text-xs transition-colors text-left cursor-pointer ${
              activeTab === 'pinned'
                ? 'bg-slate-100 dark:bg-zinc-800/80 text-[var(--color-text-main)] font-semibold'
                : 'text-[var(--color-text-muted)] hover:bg-slate-50 dark:hover:bg-zinc-900/40 hover:text-[var(--color-text-main)]'
            }`}
          >
            <Pin size={12} className="text-amber-500" />
            <span>Pinned</span>
          </button>
          <button
            onClick={() => { setActiveTab('private'); setSelectedTagFilter(null); }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[3px] text-xs transition-colors text-left cursor-pointer ${
              activeTab === 'private'
                ? 'bg-slate-100 dark:bg-zinc-800/80 text-[var(--color-text-main)] font-semibold'
                : 'text-[var(--color-text-muted)] hover:bg-slate-50 dark:hover:bg-zinc-900/40 hover:text-[var(--color-text-main)]'
            }`}
          >
            <Lock size={12} className="text-indigo-500" />
            <span>Private Lock</span>
          </button>
          <button
            onClick={() => { setActiveTab('archived'); setSelectedTagFilter(null); }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[3px] text-xs transition-colors text-left cursor-pointer ${
              activeTab === 'archived'
                ? 'bg-slate-100 dark:bg-zinc-800/80 text-[var(--color-text-main)] font-semibold'
                : 'text-[var(--color-text-muted)] hover:bg-slate-50 dark:hover:bg-zinc-900/40 hover:text-[var(--color-text-main)]'
            }`}
          >
            <Archive size={12} className="text-slate-400 dark:text-zinc-500" />
            <span>Archived</span>
          </button>
        </div>

        {/* Collections Title and Search */}
        <div className="p-3 shrink-0">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] block mb-2 px-1">Collections</span>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 text-slate-400 dark:text-zinc-550" size={12} />
            <input
              type="text"
              placeholder="Search collections..."
              value={colSearchQuery}
              onChange={e => setColSearchQuery(e.target.value)}
              className="w-full pl-7 pr-3 py-1 text-[11px] rounded-[3px] border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] placeholder-slate-400 dark:placeholder-zinc-650 focus:outline-hidden focus:border-[var(--color-primary)]"
            />
          </div>
        </div>

        {/* Collections List */}
        <div className="overflow-y-auto px-2 space-y-0.5 max-h-48 border-b border-[var(--color-border)]/40 pb-2 shrink-0">
          {filteredCols.map(col => {
            const isActive = col.id === activeCollectionId
            const isDragOver = dragOverColId === col.id
            return (
              <div
                key={col.id}
                onClick={() => {
                  setActiveCollectionId(col.id)
                  setMobileMenuOpen(false)
                }}
                onDragOver={(e) => onDragOver(e, col.id)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, col.id)}
                className={`group flex items-center justify-between px-3 py-1.5 rounded-[3px] cursor-pointer transition-all ${
                  isActive
                    ? 'bg-slate-100 dark:bg-zinc-800/80 text-[var(--color-text-main)] font-semibold border-l-2'
                    : 'text-[var(--color-text-muted)] hover:bg-slate-50 dark:hover:bg-zinc-900/40 hover:text-[var(--color-text-main)]'
                } ${isDragOver ? 'border-dashed border-2 border-indigo-500 scale-[1.02] bg-indigo-50/10' : ''}`}
                style={{ borderLeftColor: isActive ? col.color : undefined }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs shrink-0">{col.icon || '📁'}</span>
                  <span className="text-xs truncate">{col.name}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[9px] bg-slate-200/50 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 px-1.5 py-0.5 rounded-sm font-bold">
                    {col.links.length}
                  </span>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                    <button
                      onClick={e => { e.stopPropagation(); onOpenEditCol(col) }}
                      className="p-0.5 rounded-sm hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-400 hover:text-[var(--color-text-main)] cursor-pointer"
                    >
                      <Edit2 size={10} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onDeleteCol(col.id) }}
                      className="p-0.5 rounded-sm hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {filteredCols.length === 0 && (
            <p className="text-[10px] text-center text-slate-400 dark:text-zinc-550 py-4 font-bold">No collections found.</p>
          )}
        </div>

        {/* Tags List */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col min-h-0">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1 mb-2 px-1 select-none">
            <Tag size={10} />
            <span>Tags</span>
          </span>
          <div className="flex flex-wrap gap-1.5 overflow-y-auto p-0.5 max-h-32">
            {tagsList.map(tag => {
              const isSelected = selectedTagFilter?.toLowerCase() === tag.name.toLowerCase()
              return (
                <button
                  key={tag.id}
                  onClick={() => {
                    setSelectedTagFilter(isSelected ? null : tag.name)
                  }}
                  className={`text-[10px] font-bold px-2 py-0.75 rounded-[3px] border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent shadow-3xs'
                      : 'bg-slate-55 text-slate-600 dark:bg-zinc-900/60 dark:text-zinc-300 border-[var(--color-border)] hover:bg-slate-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  #{tag.name}
                </button>
              )
            })}
            {tagsList.length === 0 && (
              <span className="text-[9px] text-slate-400 dark:text-zinc-555 font-bold px-1 py-1">No tags defined yet.</span>
            )}
          </div>
        </div>

      </div>

      {/* Keyboard Shortcuts Help Link */}
      <div className="p-3 border-t border-[var(--color-border)]/40 flex items-center justify-between text-[10px] text-slate-400 dark:text-zinc-500 font-semibold shrink-0">
        <button
          onClick={onOpenShortcutsHelp}
          className="flex items-center gap-1 hover:text-[var(--color-text-main)] transition-colors cursor-pointer"
        >
          <Keyboard size={12} />
          <span>Keyboard Shortcuts</span>
        </button>
        <span>Ctrl+?</span>
      </div>
    </aside>
  )
}
