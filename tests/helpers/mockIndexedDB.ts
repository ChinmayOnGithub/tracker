import { mock } from 'bun:test'
import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine'

export function setupMockIndexedDB() {
  const originalGetInstance = IndexedDBEngine.getInstance

  // Clear cached db on singleton before test begins
  const initInstance = IndexedDBEngine.getInstance() as any
  initInstance.db = null
  initInstance.dbPromise = null

  const localStore: Record<string, Record<string, unknown>[]> = {
    journal_entries: [],
    activity_templates: [],
    activity_logs: [],
    weight_records: [],
    leave_records: [],
    work_sessions: [],
    link_library: [],
    settings: [],
    sync_queue: [],
    sync_metadata: []
  }

  const mockIndexedDB = {
    open: mock(() => {
      const request = {
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        result: {
          transaction: mock((stores: string[], _mode: string) => {
            const storeMocks: Record<string, any> = {}
            let activeRequests = 0
            let completed = false

            const tx = {
              objectStore: mock((name: string) => storeMocks[name]),
              abort: mock(() => {}),
              oncomplete: null as (() => void) | null,
              onerror: null as (() => void) | null,
              onabort: null as (() => void) | null
            }

            const triggerComplete = () => {
              if (activeRequests === 0 && !completed) {
                completed = true
                // Use setTimeout to ensure all microtasks (promises) have resolved
                setTimeout(() => {
                  if (tx.oncomplete) tx.oncomplete()
                }, 0)
              }
            }

            const createRequestMock = (result: any = null) => {
              activeRequests++
              const req = {
                onsuccess: null as (() => void) | null,
                onerror: null as (() => void) | null,
                result
              }
              queueMicrotask(() => {
                if (req.onsuccess) req.onsuccess()
                activeRequests--
                triggerComplete()
              })
              return req
            }

            for (const s of stores) {
              storeMocks[s] = {
                put: mock((item: any) => {
                  if (!localStore[s]) localStore[s] = []
                  const list = localStore[s]
                  const idx = list.findIndex((i: any) => i.id === item?.id)
                  if (idx >= 0) {
                    list[idx] = item
                  } else {
                    list.push(item)
                  }
                  return createRequestMock(item?.id)
                }),
                get: mock((id: any) => {
                  const item = localStore[s]?.find((i: any) => i.id === id) || null
                  return createRequestMock(item)
                }),
                getAll: mock(() => {
                  const items = localStore[s] || []
                  return createRequestMock(items)
                }),
                delete: mock((id: any) => {
                  if (localStore[s]) {
                    localStore[s] = localStore[s].filter((i: any) => i.id !== id)
                  }
                  return createRequestMock()
                }),
                clear: mock(() => {
                  localStore[s] = []
                  return createRequestMock()
                }),
                index: mock(() => ({
                  getAll: mock((_val: any) => {
                    const items = localStore[s] || []
                    return createRequestMock(items)
                  }),
                  get: mock((id: any) => {
                    const item = localStore[s]?.find((i: any) => i.id === id) || null
                    return createRequestMock(item)
                  })
                }))
              }
            }

            queueMicrotask(() => {
              triggerComplete()
            })

            return tx
          })
        }
      }
      setTimeout(() => {
        if (request.onsuccess) request.onsuccess()
      }, 0)
      return request
    })
  }

  global.window = {
    indexedDB: mockIndexedDB,
    addEventListener: mock(() => {}),
    removeEventListener: mock(() => {}),
    navigator: {
      onLine: true
    }
  } as unknown as Window & typeof globalThis

  return {
    localStore,
    restore: () => {
      IndexedDBEngine.getInstance = originalGetInstance
      const instance = IndexedDBEngine.getInstance() as any
      instance.db = null
      instance.dbPromise = null
      delete (global as unknown as { window?: unknown }).window
    }
  }
}
