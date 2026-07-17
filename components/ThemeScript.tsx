"use client"

import { useServerInsertedHTML } from 'next/navigation'

export default function ThemeScript() {
  useServerInsertedHTML(() => {
    return (
      <script
        id="theme-script"
        dangerouslySetInnerHTML={{
          __html: `
            try {
              const theme = localStorage.getItem('theme') || 'dark';
              if (theme === 'dark') {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
            } catch (_) {}
          `
        }}
      />
    )
  })
  return null
}
