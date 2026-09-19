import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('desktop UI density policy', () => {
  const globals = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
  const button = readFileSync(resolve(process.cwd(), 'design-system/components/Button.tsx'), 'utf8')
  const iconButton = readFileSync(resolve(process.cwd(), 'design-system/components/IconButton.tsx'), 'utf8')

  test('uses a wide-screen density layer without CSS zoom', () => {
    expect(globals).toContain('@media screen and (width >= 80rem)')
    expect(globals).toContain('--text-base: 1.0625rem')
    expect(globals).not.toMatch(/(^|[^-])zoom\s*:/)
    expect(globals).not.toContain('transform: scale(')
  })

  test('keeps desktop scaling scoped to design-system control hooks', () => {
    expect(button).toContain('data-tracker-control="button"')
    expect(button).toContain('data-tracker-size={size}')
    expect(iconButton).toContain('data-tracker-control="icon-button"')
    expect(iconButton).toContain('data-tracker-size={size}')
  })

  test('does not change the mobile/tablet control scale', () => {
    expect(globals).toContain('[data-tracker-control="button"][data-tracker-size="md"]')
    expect(globals).toContain('[data-tracker-control="icon-button"][data-tracker-size="lg"]')
  })
})
