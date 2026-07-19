import React from 'react'
import { Search, X } from 'lucide-react'

interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value: string
  onValueChange: (value: string) => void
  onClear?: () => void
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onValueChange,
  onClear,
  placeholder = 'Search...',
  className = '',
  ...props
}) => {
  const handleClear = () => {
    onValueChange('')
    onClear?.()
  }

  return (
    <div className={`relative flex-1 ${className}`}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onValueChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-9 py-2 text-sm bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text-main)] placeholder:text-[var(--color-text-muted)]/50 focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors"
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-accent)] transition-colors"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
