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
        text: 'text-red-500 dark:text-red-400',
        bg: 'bg-transparent',
        border: 'border-red-500/20 dark:border-red-400/30',
      }
    case 'orange':
      return {
        text: 'text-orange-500 dark:text-orange-400',
        bg: 'bg-transparent',
        border: 'border-orange-500/20 dark:border-orange-400/30',
      }
    case 'amber':
      return {
        text: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-transparent',
        border: 'border-amber-500/25 dark:border-amber-400/30',
      }
    case 'green':
      return {
        text: 'text-green-600 dark:text-green-400',
        bg: 'bg-transparent',
        border: 'border-green-500/20 dark:border-green-400/30',
      }
    case 'blue':
      return {
        text: 'text-blue-500 dark:text-blue-400',
        bg: 'bg-transparent',
        border: 'border-blue-500/20 dark:border-blue-400/30',
      }
    case 'purple':
      return {
        text: 'text-purple-500 dark:text-purple-400',
        bg: 'bg-transparent',
        border: 'border-purple-500/20 dark:border-purple-400/30',
      }
    case 'pink':
      return {
        text: 'text-pink-500 dark:text-pink-400',
        bg: 'bg-transparent',
        border: 'border-pink-500/20 dark:border-pink-400/30',
      }
    case 'zinc':
    default:
      return {
        text: 'text-slate-650 dark:text-zinc-350',
        bg: 'bg-transparent',
        border: 'border-slate-250 dark:border-zinc-800',
      }
  }
}
