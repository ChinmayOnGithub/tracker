import { describe, it, expect } from 'bun:test'
import {
  ConflictResolver,
  LastWriterWinsStrategy,
  ThreeWayMergeStrategy,
  BusinessLogicStrategy,
  LastWriteWinsResolver
} from '@/lib/sync/core/ConflictResolver'
import { ConflictContext } from '@/lib/sync/types'

describe('Conflict Resolver Unit Suite — Canonical Decision Engine', () => {
  const createMockContext = <T>(params: {
    localData: T
    remoteData: T
    localTime?: number
    remoteTime?: number
    localVersion?: number
    remoteVersion?: number
    entityType?: string
    entityId?: string
  }): ConflictContext<T> => ({
    entityType: params.entityType || 'test_entity',
    entityId: params.entityId || 'ent-1',
    localData: params.localData,
    remoteData: params.remoteData,
    localMetadata: {
      id: 'local',
      entityType: params.entityType || 'test_entity',
      entityId: params.entityId || 'ent-1',
      lastModified: params.localTime ?? 1000,
      version: params.localVersion ?? 1,
      syncStatus: 'synced',
      retryCount: 0,
      createdAt: params.localTime ?? 1000,
      updatedAt: params.localTime ?? 1000,
    },
    remoteMetadata: {
      id: 'remote',
      entityType: params.entityType || 'test_entity',
      entityId: params.entityId || 'ent-1',
      lastModified: params.remoteTime ?? 1000,
      version: params.remoteVersion ?? 1,
      syncStatus: 'synced',
      retryCount: 0,
      createdAt: params.remoteTime ?? 1000,
      updatedAt: params.remoteTime ?? 1000,
    },
  })

  describe('LastWriterWinsStrategy', () => {
    const lww = new LastWriterWinsStrategy()

    it('resolves local when local timestamp is newer', async () => {
      const context = createMockContext({
        localData: { text: 'local' },
        remoteData: { text: 'remote' },
        localTime: 2000,
        remoteTime: 1000,
      })
      const res = await lww.resolve(context)
      expect(res.resolution).toBe('local')
      expect((res.data as { text: string }).text).toBe('local')
    })

    it('resolves remote when remote timestamp is newer', async () => {
      const context = createMockContext({
        localData: { text: 'local' },
        remoteData: { text: 'remote' },
        localTime: 1000,
        remoteTime: 2000,
      })
      const res = await lww.resolve(context)
      expect(res.resolution).toBe('remote')
      expect((res.data as { text: string }).text).toBe('remote')
    })

    it('evaluates higher version when timestamps are equal', async () => {
      const context = createMockContext({
        localData: { text: 'local' },
        remoteData: { text: 'remote' },
        localTime: 1000,
        remoteTime: 1000,
        localVersion: 3,
        remoteVersion: 2,
      })
      const res = await lww.resolve(context)
      expect(res.resolution).toBe('local')
    })

    it('deterministically prefers local when both timestamps and versions are equal', async () => {
      const context = createMockContext({
        localData: { text: 'local' },
        remoteData: { text: 'remote' },
        localTime: 1000,
        remoteTime: 1000,
        localVersion: 1,
        remoteVersion: 1,
      })
      const res = await lww.resolve(context)
      expect(res.resolution).toBe('local')
      expect((res.data as { text: string }).text).toBe('local')
    })

    it('handles clock skew safely (future timestamps compared numerically)', async () => {
      const futureTime = Date.now() + 100000
      const context = createMockContext({
        localData: { text: 'future-local' },
        remoteData: { text: 'past-remote' },
        localTime: futureTime,
        remoteTime: 1000,
      })
      const res = await lww.resolve(context)
      expect(res.resolution).toBe('local')
      expect((res.data as { text: string }).text).toBe('future-local')
    })

    it('handles local deletion (localData is null)', async () => {
      const context = createMockContext({
        localData: null,
        remoteData: { text: 'remote' },
        localTime: 2000,
        remoteTime: 1000,
      })
      const res = await lww.resolve(context)
      expect(res.resolution).toBe('local')
      expect(res.data).toBeNull()
    })

    it('handles remote deletion (remoteData is null)', async () => {
      const context = createMockContext({
        localData: { text: 'local' },
        remoteData: null,
        localTime: 1000,
        remoteTime: 2000,
      })
      const res = await lww.resolve(context)
      expect(res.resolution).toBe('remote')
      expect(res.data).toBeNull()
    })

    it('handles malformed metadata gracefully without throwing', async () => {
      const context = {
        entityType: 'test',
        entityId: '1',
        localData: { text: 'local' },
        remoteData: { text: 'remote' },
        localMetadata: { lastModified: 'invalid' as unknown as number, version: null as unknown as number } as unknown as import('@/lib/sync/types').SyncMetadata,
        remoteMetadata: {} as unknown as import('@/lib/sync/types').SyncMetadata,
      }
      const res = await lww.resolve(context)
      expect(res.resolution).toBeDefined()
    })
  })

  describe('ThreeWayMergeStrategy', () => {
    const merger = new ThreeWayMergeStrategy()

    it('merges non-conflicting disjoint fields', async () => {
      const context = createMockContext({
        localData: { title: 'Local Title', extraField: 'extra' },
        remoteData: { title: 'Local Title', description: 'Remote Desc' },
      })
      const res = await merger.resolve(context)
      expect(res.resolution).toBe('merge')
      expect(res.data).toEqual({
        title: 'Local Title',
        extraField: 'extra',
        description: 'Remote Desc',
      })
    })

    it('resolves string conflict by preferring longer content', async () => {
      const context = createMockContext({
        localData: { notes: 'Short' },
        remoteData: { notes: 'Longer comprehensive reflection' },
      })
      const res = await merger.resolve(context)
      expect(res.resolution).toBe('merge')
      const data = res.data as { notes?: string }
      expect(data.notes).toBe('Longer comprehensive reflection')
    })

    it('resolves number conflict by preferring higher numerical value', async () => {
      const context = createMockContext({
        localData: { counter: 10 },
        remoteData: { counter: 5 },
      })
      const res = await merger.resolve(context)
      expect(res.resolution).toBe('merge')
      const data = res.data as { counter?: number }
      expect(data.counter).toBe(10)
    })

    it('merges and deduplicates array fields', async () => {
      const context = createMockContext({
        localData: { tags: ['work', 'urgent'] },
        remoteData: { tags: ['work', 'personal'] },
      })
      const res = await merger.resolve(context)
      expect(res.resolution).toBe('merge')
      const data = res.data as { tags?: string[] }
      expect(data.tags).toEqual(['work', 'urgent', 'personal'])
    })

    it('falls back to LastWriterWins when merging non-objects', async () => {
      const context = createMockContext({
        localData: 'simple-string',
        remoteData: 'other-string',
        localTime: 2000,
        remoteTime: 1000,
      })
      const res = await merger.resolve(context)
      expect(res.resolution).toBe('local')
    })
  })

  describe('BusinessLogicStrategy', () => {
    it('executes domain-specific business rules for matched entity', async () => {
      const strategy = new BusinessLogicStrategy('activity_log', async (ctx) => {
        // Business rule: if one log is DONE, DONE always wins
        const localStatus = (ctx.localData as { status?: string })?.status
        if (localStatus === 'DONE') {
          return { resolution: 'local', data: ctx.localData, reason: 'Completed activity always wins' }
        }
        return { resolution: 'remote', data: ctx.remoteData, reason: 'Remote status preserved' }
      })

      const context = createMockContext({
        entityType: 'activity_log',
        localData: { status: 'DONE' },
        remoteData: { status: 'POSTPONED' },
        localTime: 1000,
        remoteTime: 2000, // Remote is newer, but business logic favors DONE
      })

      const res = await strategy.resolve(context)
      expect(res.resolution).toBe('local')
      const data = res.data as { status?: string }
      expect(data.status).toBe('DONE')
    })

    it('throws when evaluated for mismatched entity type', async () => {
      const strategy = new BusinessLogicStrategy('activity_log', async (ctx) => ({
        resolution: 'local',
        data: ctx.localData,
      }))
      const context = createMockContext({ entityType: 'wrong_entity', localData: {}, remoteData: {} })
      expect(strategy.resolve(context)).rejects.toThrow('Business logic strategy is for activity_log')
    })
  })

  describe('ConflictResolver Registry & Fallback Mechanics', () => {
    it('falls back to LastWriterWins when a rule strategy throws an exception', async () => {
      const resolver = new ConflictResolver()
      resolver.addRule({
        entityType: 'fragile_entity',
        priority: 10,
        strategy: {
          name: 'buggy-strategy',
          resolve: async () => {
            throw new Error('Simulated strategy crash')
          },
        },
      })

      const context = createMockContext({
        entityType: 'fragile_entity',
        localData: { name: 'local' },
        remoteData: { name: 'remote' },
        localTime: 2000,
        remoteTime: 1000,
      })

      const res = await resolver.resolve(context)
      expect(res.resolution).toBe('local')
      const data = res.data as { name?: string }
      expect(data.name).toBe('local')
    })

    it('resolveEntity helper parses dates and resolves entities without manual metadata creation', async () => {
      const resolver = new ConflictResolver()
      const resolved = await resolver.resolveEntity({
        local: { id: '1', title: 'Local', updatedAt: '2026-07-28T12:00:00.000Z' },
        remote: { id: '1', title: 'Remote', updatedAt: '2026-07-28T13:00:00.000Z' },
      })
      expect(resolved.title).toBe('Remote')
    })

    it('LastWriteWinsResolver adapter provides complete backward compatibility', async () => {
      const adapter = new LastWriteWinsResolver()
      const resolved = await adapter.resolve({
        entityId: 'e-1',
        localEntity: { id: 'e-1', title: 'Newer Local', updatedAt: '2026-07-28T15:00:00.000Z' },
        remoteEntity: { id: 'e-1', title: 'Older Remote', updatedAt: '2026-07-28T12:00:00.000Z' },
      })
      expect(resolved.title).toBe('Newer Local')
    })
  })
})
