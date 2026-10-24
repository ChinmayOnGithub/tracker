import { describe, it, expect, beforeEach } from 'bun:test'
import { writeQueue } from '@/lib/store/write-queue'

describe('Settings Write Race & Local Revision Synchronization Suite (#47)', () => {
  beforeEach(() => {
    // The queue is a process-wide singleton; isolate this suite from other tests.
    writeQueue.drain()
  })

  it('deduplicates rapid consecutive setting mutations using dedupKey', async () => {
    const executedUpdates: string[] = []

    writeQueue.add({
      id: 'update-1',
      dedupKey: 'settings-appearance-accent',
      run: async () => {
        executedUpdates.push('blue')
        return { success: true }
      },
      rollback: () => {},
    })

    writeQueue.add({
      id: 'update-2',
      dedupKey: 'settings-appearance-accent',
      run: async () => {
        executedUpdates.push('purple')
        return { success: true }
      },
      rollback: () => {},
    })

    writeQueue.add({
      id: 'update-3',
      dedupKey: 'settings-appearance-accent',
      run: async () => {
        executedUpdates.push('green')
        return { success: true }
      },
      rollback: () => {},
    })

    // Wait for the singleton queue to finish, with a bounded timeout.
    const deadline = Date.now() + 1_000
    while (writeQueue.getStatus() !== 'idle' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    expect(writeQueue.getStatus()).toBe('idle')

    // Because update-1 may start immediately, update-2 is replaced by update-3 in queue
    // The final applied state MUST be the latest 'green'
    expect(executedUpdates[executedUpdates.length - 1]).toBe('green')
  })

  it('preserves local revision when stale server payload arrives', () => {
    const revisions: Record<string, number> = {}

    const recordLocalRevision = (key: string) => {
      revisions[key] = Date.now()
    }

    const isLocalRevisionNewer = (key: string, thresholdMs = 5000): boolean => {
      const lastEdit = revisions[key]
      if (!lastEdit) return false
      return Date.now() - lastEdit < thresholdMs
    }

    // User edits accent to 'emerald'
    recordLocalRevision('personal_accent_color')

    // Stale server response returns 'blue'
    const staleServerValue = 'blue'
    let currentClientValue = 'emerald'

    if (!isLocalRevisionNewer('personal_accent_color')) {
      currentClientValue = staleServerValue
    }

    // Must NOT be overwritten by stale server value
    expect(currentClientValue).toBe('emerald')

    // For a key that was NOT edited locally (e.g. fontSize), server value is accepted
    let currentFontSize = 'md'
    const serverFontSize = 'lg'

    if (!isLocalRevisionNewer('personal_font_size')) {
      currentFontSize = serverFontSize
    }

    expect(currentFontSize).toBe('lg')
  })
})
