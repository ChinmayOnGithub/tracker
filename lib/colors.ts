/**
 * Utility to map template color names to concrete Tailwind classes.
 * Since Tailwind relies on static analysis, dynamic template strings like `text-${color}-500`
 * will not compile and will render as unstyled gray in light mode.
 */
export function getTemplateColorClasses(colorName: string | null | undefined, isActive = true) {
  if (!isActive) {
    return {
      text: 'text-slate-400 dark:text-zinc-500',
      bg: 'bg-slate-100/50 dark:bg-zinc-950/20',
      border: 'border-slate-200 dark:border-zinc-900/40',
    }
  }

  const name = colorName || 'zinc'

  switch (name) {
    case 'red':
      return {
        text: 'text-red-500 dark:text-red-400',
        bg: 'bg-red-50 dark:bg-red-950/20',
        border: 'border-red-100 dark:border-red-900/30',
      }
    case 'orange':
      return {
        text: 'text-orange-500 dark:text-orange-400',
        bg: 'bg-orange-50 dark:bg-orange-950/20',
        border: 'border-orange-100 dark:border-orange-900/30',
      }
    case 'amber':
      return {
        text: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-50 dark:bg-amber-950/20',
        border: 'border-amber-100 dark:border-amber-900/30',
      }
    case 'green':
      return {
        text: 'text-green-600 dark:text-green-400',
        bg: 'bg-green-50 dark:bg-green-950/20',
        border: 'border-green-100 dark:border-green-900/30',
      }
    case 'blue':
      return {
        text: 'text-blue-500 dark:text-blue-400',
        bg: 'bg-blue-50 dark:bg-blue-950/20',
        border: 'border-blue-100 dark:border-blue-900/30',
      }
    case 'purple':
      return {
        text: 'text-purple-500 dark:text-purple-400',
        bg: 'bg-purple-50 dark:bg-purple-950/20',
        border: 'border-purple-100 dark:border-purple-900/30',
      }
    case 'pink':
      return {
        text: 'text-pink-500 dark:text-pink-400',
        bg: 'bg-pink-50 dark:bg-pink-950/20',
        border: 'border-pink-100 dark:border-pink-900/30',
      }
    case 'zinc':
    default:
      return {
        text: 'text-slate-600 dark:text-zinc-350',
        bg: 'bg-slate-50 dark:bg-zinc-900/50',
        border: 'border-slate-200 dark:border-zinc-800',
      }
  }
}
