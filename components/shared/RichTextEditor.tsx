"use client"

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import UnderlineExtension from '@tiptap/extension-underline'
import HighlightExtension from '@tiptap/extension-highlight'
import LinkExtension from '@tiptap/extension-link'
import ImageExtension from '@tiptap/extension-image'
import TaskListExtension from '@tiptap/extension-task-list'
import TaskItemExtension from '@tiptap/extension-task-item'
import { Table as TiptapTable } from '@tiptap/extension-table'
import { TableRow as TiptapTableRow } from '@tiptap/extension-table-row'
import { TableHeader as TiptapTableHeader } from '@tiptap/extension-table-header'
import { TableCell as TiptapTableCell } from '@tiptap/extension-table-cell'
import {
  Bold, Italic, Underline as UnderlineIcon, List, CheckSquare,
  Heading1, Heading2, Highlighter, Quote, Code, Undo2, Redo2,
  Eraser, Image as ImageIcon, Table as TableIcon, MoreHorizontal, Link as LinkIcon,
  X
} from 'lucide-react'
import { Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/design-system'

const CustomImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: attributes => {
          if (!attributes.width) return {}
          return {
            width: attributes.width,
            style: `width: ${attributes.width}; max-height: 500px; object-fit: contain; display: block;`
          }
        }
      }
    }
  }
})

export interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
  minHeight?: string
  editable?: boolean
  onFocus?: () => void
  onBlur?: () => void
  onImageUploadRequested?: () => void
  autoFocus?: boolean
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Start writing...',
  className = '',
  minHeight = '300px',
  editable = true,
  onFocus,
  onBlur,
  onImageUploadRequested,
  autoFocus = false,
}) => {
  const [isFocused, setIsFocused] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [selectedImageNode, setSelectedImageNode] = useState<{ element: HTMLImageElement; pos: number } | null>(null)

  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFocusedRef = useRef(false)
  const lastValueRef = useRef(value)

  const handleEditorFocus = useCallback(() => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current)
      blurTimerRef.current = null
    }
    setIsFocused(true)
    isFocusedRef.current = true
    onFocus?.()
  }, [onFocus])

  const handleEditorBlur = useCallback(() => {
    // Graceful delayed collapse so toolbar button clicks aren't lost
    blurTimerRef.current = setTimeout(() => {
      setIsFocused(false)
      isFocusedRef.current = false
      onBlur?.()
    }, 250)
  }, [onBlur])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      UnderlineExtension,
      HighlightExtension.configure({ multicolor: true }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-[var(--color-primary)] hover:underline cursor-pointer',
        },
      }),
      CustomImage.configure({
        HTMLAttributes: {
          class: 'my-4 rounded-lg border border-[var(--color-border)] shadow-xs transition-transform hover:scale-[1.01]',
          style: 'max-height: 500px; object-fit: contain; display: block;',
        },
      }),
      TaskListExtension,
      TaskItemExtension.configure({
        nested: true,
      }),
      TiptapTable.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse border border-[var(--color-border)] my-4 w-full text-sm',
        },
      }),
      TiptapTableRow.configure({
        HTMLAttributes: {
          class: 'border-b border-[var(--color-border)]',
        },
      }),
      TiptapTableHeader.configure({
        HTMLAttributes: {
          class: 'border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-2.5 font-bold text-left',
        },
      }),
      TiptapTableCell.configure({
        HTMLAttributes: {
          class: 'border border-[var(--color-border)] p-2.5 text-left',
        },
      }),
    ],
    content: value,
    editable,
    autofocus: autoFocus,
    immediatelyRender: false,
    onFocus: handleEditorFocus,
    onBlur: handleEditorBlur,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      lastValueRef.current = html
      onChange(html)
    },
    editorProps: {
      attributes: {
        'data-placeholder': placeholder,
        placeholder,
      },
      handleClick: (_view, pos, event) => {
        const target = event.target as HTMLElement
        if (target.tagName === 'IMG') {
          setSelectedImageNode({
            element: target as HTMLImageElement,
            pos
          })
          return true
        } else {
          setSelectedImageNode(null)
        }
      },
    }
  })

  // Synchronize incoming value changes safely (without clobbering active typing)
  useEffect(() => {
    if (!editor) return
    if (value !== lastValueRef.current && value !== editor.getHTML()) {
      editor.commands.setContent(value || '<p></p>', { emitUpdate: false })
      lastValueRef.current = value
    }
  }, [value, editor])

  // Synchronize editable prop
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable)
    }
  }, [editable, editor])

  const resizeSelectedImage = (width: string) => {
    if (!selectedImageNode || !editor) return
    editor.commands.focus()
    editor.commands.command(({ tr }) => {
      const node = tr.doc.nodeAt(selectedImageNode.pos)
      if (node && node.type.name === 'image') {
        tr.setNodeMarkup(selectedImageNode.pos, undefined, {
          ...node.attrs,
          width
        })
      }
      return true
    })
    setSelectedImageNode(null)
  }

  const setLink = () => {
    if (!editor) return
    const prevUrl = editor.getAttributes('link').href || ''
    const url = window.prompt('Enter URL:', prevUrl)
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }

  return (
    <div className={`relative flex flex-col w-full flex-1 h-full min-h-0 ${className}`}>
      {/* ── Slide-Down Formatting Toolbar on Focus ── */}
      <div
        className={`sticky top-0 z-30 mb-2 transition-all duration-200 ease-out shrink-0 ${
          isFocused
            ? 'opacity-100 translate-y-0 pointer-events-auto max-h-24'
            : 'opacity-0 -translate-y-2 pointer-events-none max-h-0 overflow-hidden'
        }`}
      >
        <div className="flex items-center justify-between gap-1 p-1 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--card-radius)] shadow-[var(--card-shadow)] flex-wrap">
          {/* Primary Quick Actions */}
          <div className="flex items-center gap-0.5 flex-wrap">
            <Button
              variant="ghost"
              size="icon-sm"
              onMouseDown={e => { e.preventDefault(); editor?.chain().focus().undo().run() }}
              title="Undo (Ctrl+Z)"
              icon={<Undo2 size={13} />}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onMouseDown={e => { e.preventDefault(); editor?.chain().focus().redo().run() }}
              title="Redo (Ctrl+Y)"
              icon={<Redo2 size={13} />}
            />
            <div className="w-px h-3.5 bg-[var(--color-border)] mx-1" />
            <Button
              variant="ghost"
              size="icon-sm"
              onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBold().run() }}
              title="Bold (Ctrl+B)"
              icon={<Bold size={13} />}
              className={editor?.isActive('bold') ? 'bg-[var(--color-accent)] font-bold text-[var(--color-primary)]' : ''}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleItalic().run() }}
              title="Italic (Ctrl+I)"
              icon={<Italic size={13} />}
              className={editor?.isActive('italic') ? 'bg-[var(--color-accent)] font-bold text-[var(--color-primary)]' : ''}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleUnderline().run() }}
              title="Underline (Ctrl+U)"
              icon={<UnderlineIcon size={13} />}
              className={editor?.isActive('underline') ? 'bg-[var(--color-accent)] font-bold text-[var(--color-primary)]' : ''}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleHighlight().run() }}
              title="Highlight"
              icon={<Highlighter size={13} />}
              className={editor?.isActive('highlight') ? 'bg-[var(--color-accent)] font-bold text-[var(--color-primary)]' : ''}
            />
            <div className="w-px h-3.5 bg-[var(--color-border)] mx-1" />
            <Button
              variant="ghost"
              size="icon-sm"
              onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run() }}
              title="Bullet List"
              icon={<List size={13} />}
              className={editor?.isActive('bulletList') ? 'bg-[var(--color-accent)] font-bold text-[var(--color-primary)]' : ''}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleTaskList().run() }}
              title="Checklist"
              icon={<CheckSquare size={13} />}
              className={editor?.isActive('taskList') ? 'bg-[var(--color-accent)] font-bold text-[var(--color-primary)]' : ''}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onMouseDown={e => { e.preventDefault(); setLink() }}
              title="Add Link"
              icon={<LinkIcon size={13} />}
              className={editor?.isActive('link') ? 'bg-[var(--color-accent)] font-bold text-[var(--color-primary)]' : ''}
            />
            {onImageUploadRequested && (
              <Button
                variant="ghost"
                size="icon-sm"
                onMouseDown={e => { e.preventDefault(); onImageUploadRequested() }}
                title="Insert Image"
                icon={<ImageIcon size={13} />}
              />
            )}
          </div>

          {/* Secondary Formatting Dropdown */}
          <div className="flex items-center gap-1">
            <DropdownMenu open={showMoreMenu} onOpenChange={setShowMoreMenu}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="More formatting"
                  icon={<MoreHorizontal size={13} />}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 text-xs">
                <DropdownMenuItem onSelect={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
                  <Heading1 className="w-3.5 h-3.5 mr-2" /> Heading 1
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
                  <Heading2 className="w-3.5 h-3.5 mr-2" /> Heading 2
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => editor?.chain().focus().toggleBlockquote().run()}>
                  <Quote className="w-3.5 h-3.5 mr-2" /> Quote block
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => editor?.chain().focus().toggleCodeBlock().run()}>
                  <Code className="w-3.5 h-3.5 mr-2" /> Code block
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
                  <TableIcon className="w-3.5 h-3.5 mr-2" /> Insert 3x3 Table
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()} className="text-rose-500">
                  <Eraser className="w-3.5 h-3.5 mr-2" /> Clear formatting
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* ── Editor Canvas: Always Clickable & Editable taking full available area ── */}
      <div
        className="w-full flex-1 h-full min-h-[350px] cursor-text flex flex-col"
        onClick={() => {
          if (editor && !editor.isFocused) {
            editor.commands.focus()
          }
        }}
      >
        <EditorContent
          editor={editor}
          className="w-full flex-1 h-full bg-transparent text-[15px] sm:text-[16px] text-[var(--color-text-main)] placeholder-[var(--color-text-muted)] focus:outline-hidden leading-[1.75] resize-none font-sans border-0 p-0 outline-hidden contenteditable-editor"
          style={{ minHeight }}
        />
      </div>

      {/* ── Image Resize Floating Menu ── */}
      {selectedImageNode && (
        <div
          className="fixed z-50 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-1 shadow-lg flex items-center gap-1 animate-fade-in"
          style={{
            top: `${selectedImageNode.element.getBoundingClientRect().top + window.scrollY - 40}px`,
            left: `${selectedImageNode.element.getBoundingClientRect().left + window.scrollX}px`,
          }}
        >
          {(['25%', '50%', '100%'] as const).map(size => (
            <button
              key={size}
              type="button"
              onClick={() => resizeSelectedImage(size)}
              className="px-2 py-0.5 text-[10px] font-bold rounded hover:bg-[var(--color-accent)] text-[var(--color-text-main)] cursor-pointer"
            >
              {size}
            </button>
          ))}
          <div className="w-px h-3 bg-[var(--color-border)] mx-1" />
          <button
            type="button"
            onClick={() => setSelectedImageNode(null)}
            className="p-1 text-rose-500 hover:bg-rose-500/10 rounded cursor-pointer"
          >
            <X size={11} />
          </button>
        </div>
      )}
    </div>
  )
}
