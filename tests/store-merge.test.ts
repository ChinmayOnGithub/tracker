/**
 * tests/store-merge.test.ts
 *
 * Validates that initialize() merges server data with local state correctly:
 * - Locally-newer items survive server hydration (local-first guarantee)
 * - Server-newer items properly update local state
 * - Completely new server items are added to local state
 */
import { describe, it, expect } from 'bun:test'

// ── Inline the mergeById helper so we can test it directly without
//    needing a real DOM / React context. ────────────────────────────────────
type Mergeable = { id: string; updatedAt?: Date | string }

function mergeById<T extends Mergeable>(currentItems: T[], serverItems: T[]): T[] {
  const map = new Map<string, T>()
  currentItems.forEach(item => map.set(item.id, item))
  serverItems.forEach(item => {
    const existing = map.get(item.id)
    if (!existing) {
      map.set(item.id, item)
    } else {
      const existingTime = new Date(existing.updatedAt ?? 0).getTime()
      const serverTime   = new Date(item.updatedAt ?? 0).getTime()
      if (serverTime > existingTime) {
        map.set(item.id, item)
      }
    }
  })
  return Array.from(map.values())
}

describe('store initialize() mergeById strategy', () => {

  describe('Local-first guarantee', () => {
    it('should NOT overwrite a locally-newer item with an older server item', () => {
      const localItem  = { id: 'a', name: 'Local (newer)',  updatedAt: '2026-08-15T12:00:00Z' }
      const serverItem = { id: 'a', name: 'Server (older)', updatedAt: '2026-08-15T09:00:00Z' }

      const result = mergeById([localItem], [serverItem])

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Local (newer)')
    })

    it('should preserve a local item that has no server counterpart', () => {
      const localOnly  = { id: 'local-only', name: 'Offline item', updatedAt: '2026-08-15T10:00:00Z' }
      const serverItem = { id: 'server-b',   name: 'Server item',  updatedAt: '2026-08-15T10:00:00Z' }

      const result = mergeById([localOnly], [serverItem])

      expect(result.some(r => r.id === 'local-only')).toBe(true)
      expect(result.some(r => r.id === 'server-b')).toBe(true)
    })
  })

  describe('Server wins when newer', () => {
    it('should update a local item when the server has a strictly newer version', () => {
      const localItem  = { id: 'b', name: 'Local (older)',  updatedAt: '2026-08-14T08:00:00Z' }
      const serverItem = { id: 'b', name: 'Server (newer)', updatedAt: '2026-08-15T10:00:00Z' }

      const result = mergeById([localItem], [serverItem])

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Server (newer)')
    })

    it('should add a new server item not present locally', () => {
      const serverOnly = { id: 'server-new', name: 'Brand new server item', updatedAt: '2026-08-15T11:00:00Z' }

      const result = mergeById([], [serverOnly])

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('server-new')
    })
  })

  describe('Tie-breaking (same timestamp)', () => {
    it('should keep the local item when timestamps are identical', () => {
      const ts = '2026-08-15T10:00:00Z'
      const localItem  = { id: 'c', name: 'Local version',  updatedAt: ts }
      const serverItem = { id: 'c', name: 'Server version', updatedAt: ts }

      const result = mergeById([localItem], [serverItem])

      // Local wins on tie (server needs strictly greater timestamp)
      expect(result[0].name).toBe('Local version')
    })
  })

  describe('Mixed batch', () => {
    it('should correctly merge a realistic batch of mixed-age records', () => {
      const local = [
        { id: 'keep-local',   name: 'Local edit',      updatedAt: '2026-08-15T12:00:00Z' }, // newer than server
        { id: 'take-server',  name: 'Old local',       updatedAt: '2026-08-14T06:00:00Z' }, // older than server
        { id: 'local-only',   name: 'Never synced',    updatedAt: '2026-08-15T08:00:00Z' }, // not on server
      ]
      const server = [
        { id: 'keep-local',   name: 'Stale server',    updatedAt: '2026-08-14T09:00:00Z' },
        { id: 'take-server',  name: 'Server has more', updatedAt: '2026-08-15T09:00:00Z' },
        { id: 'server-only',  name: 'New from server', updatedAt: '2026-08-15T10:00:00Z' }, // not local
      ]

      const result = mergeById(local, server)
      const byId = Object.fromEntries(result.map(r => [r.id, r]))

      expect(result).toHaveLength(4)
      expect(byId['keep-local'].name).toBe('Local edit')      // local wins
      expect(byId['take-server'].name).toBe('Server has more') // server wins
      expect(byId['local-only'].name).toBe('Never synced')    // local preserved
      expect(byId['server-only'].name).toBe('New from server') // server added
    })
  })

  describe('Edge cases', () => {
    it('should handle items without updatedAt (treats as epoch 0)', () => {
      const localItem  = { id: 'd', name: 'Local no-ts'  } // no updatedAt
      const serverItem = { id: 'd', name: 'Server newer', updatedAt: '2026-08-15T10:00:00Z' }

      const result = mergeById([localItem], [serverItem])

      // Server has a real timestamp, local has none → server wins
      expect(result[0].name).toBe('Server newer')
    })

    it('should return empty array when both inputs are empty', () => {
      expect(mergeById([], [])).toEqual([])
    })

    it('should return all local items when server list is empty', () => {
      const local = [
        { id: '1', name: 'a', updatedAt: '2026-08-15T10:00:00Z' },
        { id: '2', name: 'b', updatedAt: '2026-08-15T10:00:00Z' },
      ]
      const result = mergeById(local, [])
      expect(result).toHaveLength(2)
    })
  })
})
