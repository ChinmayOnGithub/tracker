import { describe, it, expect } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { ProductionSyncEngine, SyncEngine } from '@/lib/sync/core/ProductionSyncEngine'
import { ConflictResolver, LastWriterWinsStrategy } from '@/lib/sync/core/ConflictResolver'
import { SyncCoordinator } from '@/lib/sync/core/SyncCoordinator'
import { writeQueue } from '@/lib/store/write-queue'
import { SyncQueue } from '@/lib/sync/queue/SyncQueue'

describe('Architecture Boundary: Synchronization, Queues & Conflict Resolution Authority', () => {
  const rootDir = process.cwd()

  it('obsolete synchronization files in lib/database/sync are completely removed', () => {
    const obsoleteSyncEngine = path.join(rootDir, 'lib', 'database', 'sync', 'SyncEngine.ts')
    const obsoleteConflictResolver = path.join(rootDir, 'lib', 'database', 'sync', 'ConflictResolver.ts')
    const obsoleteConnectivityMonitor = path.join(rootDir, 'lib', 'database', 'sync', 'ConnectivityMonitor.ts')

    expect(fs.existsSync(obsoleteSyncEngine)).toBe(false)
    expect(fs.existsSync(obsoleteConflictResolver)).toBe(false)
    expect(fs.existsSync(obsoleteConnectivityMonitor)).toBe(false)
  })

  it('no application source files import from obsolete lib/database/sync path', () => {
    const checkDirectories = ['app', 'components', 'modules', 'lib']

    const scanDirectory = (dirPath: string) => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== '.next') {
            scanDirectory(fullPath)
          }
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const content = fs.readFileSync(fullPath, 'utf8')
          expect(content).not.toContain('@/lib/database/sync')
          expect(content).not.toContain("from '../sync/SyncEngine'")
          expect(content).not.toContain("from '../sync/ConflictResolver'")
        }
      }
    }

    for (const dir of checkDirectories) {
      const fullDir = path.join(rootDir, dir)
      if (fs.existsSync(fullDir)) {
        scanDirectory(fullDir)
      }
    }
  })

  it('ProductionSyncEngine is the authoritative canonical sync engine', () => {
    expect(ProductionSyncEngine).toBeDefined()
    expect(SyncEngine).toBe(ProductionSyncEngine)
  })

  it('ConflictResolver is the authoritative canonical conflict resolver', () => {
    const resolver = new ConflictResolver()
    expect(typeof resolver.resolve).toBe('function')
    expect(typeof resolver.resolveEntity).toBe('function')

    const strategies = resolver.getStrategies()
    expect(strategies).toContain('last-writer-wins')
    expect(strategies).toContain('three-way-merge')
    expect(strategies).toContain('operational-transform')
    expect(typeof LastWriterWinsStrategy).toBe('function')
  })

  it('writeQueue and SyncQueue maintain distinct and explicit responsibility boundaries', () => {
    // writeQueue: UI optimistic persistence and mutation deduplication
    expect(typeof writeQueue.add).toBe('function')
    expect(typeof writeQueue.getStatus).toBe('function')

    // SyncQueue: Durable background synchronization with storage provider
    expect(typeof SyncQueue).toBe('function')
  })

  it('SyncCoordinator provides the unified entry point for background sync queueing and connectivity', () => {
    const coordinator = SyncCoordinator.getInstance()
    expect(typeof coordinator.enqueue).toBe('function')
    expect(typeof coordinator.triggerSync).toBe('function')
    expect(typeof coordinator.isOnline).toBe('function')
    expect(typeof coordinator.subscribeConnectivity).toBe('function')
  })
})
