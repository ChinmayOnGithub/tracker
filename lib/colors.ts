/**
 * Utility to map template color names to concrete Tailwind classes.
 * Since Tailwind relies on static analysis, dynamic template strings like `text-${color}-500`
 * will not compile and will render as unstyled gray in light mode.
 */
export function getTemplateColorClasses(colorName: string | null | undefined, isActive = true) {
  if (!isActive) {
    return {
      text: 'text-slate-400 dark:text-zinc-500',
      bg: 'bg-transparent',
      border: 'border-slate-200/60 dark:border-zinc-800/60',
    }
  }

  const name = colorName || 'zinc'

  switch (name) {
    case 'red':
      return {
        text: 'text-red-650 dark:text-red-400',
        bg: 'bg-red-50 dark:bg-red-500/10',
        border: 'border-red-100 dark:border-red-400/20',
      }
    case 'orange':
      return {
        text: 'text-orange-600 dark:text-orange-400',
        bg: 'bg-orange-50 dark:bg-orange-500/10',
        border: 'border-orange-100 dark:border-orange-400/20',
      }
    case 'amber':
      return {
        text: 'text-amber-700 dark:text-amber-400',
        bg: 'bg-amber-50 dark:bg-amber-500/10',
        border: 'border-amber-100 dark:border-amber-400/20',
      }
    case 'green':
      return {
        text: 'text-green-700 dark:text-green-400',
        bg: 'bg-green-50 dark:bg-green-500/10',
        border: 'border-green-100 dark:border-green-400/20',
      }
    case 'blue':
      return {
        text: 'text-blue-650 dark:text-blue-400',
        bg: 'bg-blue-50 dark:bg-blue-500/10',
        border: 'border-blue-100 dark:border-blue-400/20',
      }
    case 'purple':
      return {
        text: 'text-purple-650 dark:text-purple-400',
        bg: 'bg-purple-50 dark:bg-purple-500/10',
        border: 'border-purple-100 dark:border-purple-400/20',
      }
    case 'pink':
      return {
        text: 'text-pink-650 dark:text-pink-400',
        bg: 'bg-pink-50 dark:bg-pink-500/10',
        border: 'border-pink-100 dark:border-pink-400/20',
      }
    case 'zinc':
    default:
      return {
        text: 'text-slate-700 dark:text-zinc-350',
        bg: 'bg-slate-100 dark:bg-zinc-900',
        border: 'border-slate-200 dark:border-zinc-800',
      }
  }
}
