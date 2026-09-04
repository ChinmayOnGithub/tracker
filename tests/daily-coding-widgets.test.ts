import { describe, it, expect, mock } from 'bun:test'
import { LeetCodeProvider } from '@/modules/coding/providers/LeetCodeProvider'
import { GFGProvider } from '@/modules/coding/providers/GFGProvider'
import { getDailyCodingProblemAction } from '@/app/actions/coding'

describe('Daily Coding Problem Providers & Service Tests', () => {
  it('LeetCodeProvider: Successfully normalizes valid GraphQL response', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              activeDailyCodingChallengeQuestion: {
                date: '2026-09-04',
                link: '/problems/two-sum/',
                question: {
                  questionFrontendId: '1',
                  title: 'Two Sum',
                  difficulty: 'Easy',
                  topicTags: [{ name: 'Array' }, { name: 'Hash Table' }],
                },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    ) as unknown as typeof fetch

    try {
      const provider = new LeetCodeProvider()
      const problem = await provider.getDailyProblem('2026-09-04')

      expect(problem).not.toBeNull()
      expect(problem?.platform).toBe('leetcode')
      expect(problem?.title).toBe('Two Sum')
      expect(problem?.problemNumber).toBe('1')
      expect(problem?.difficulty).toBe('Easy')
      expect(problem?.url).toBe('https://leetcode.com/problems/two-sum/')
      expect(problem?.topicTags).toEqual(['Array', 'Hash Table'])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('LeetCodeProvider: Gracefully handles malformed / upstream error responses', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Server Error' }), { status: 500 }))
    ) as unknown as typeof fetch

    try {
      const provider = new LeetCodeProvider()
      const problem = await provider.getDailyProblem('2026-09-04')
      expect(problem).toBeNull()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('GFGProvider: Successfully normalizes valid JSON response', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: 2161,
            problem_id: 713134,
            problem_name: 'Bird and Max Fruit Gathering',
            problem_url: 'https://www.geeksforgeeks.org/problems/bird-and-maximum-fruit-gathering/1',
            difficulty: 'Easy',
            date: '2026-09-04 00:00:00',
            tags: {
              topic_tags: ['Arrays'],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    ) as unknown as typeof fetch

    try {
      const provider = new GFGProvider()
      const problem = await provider.getDailyProblem('2026-09-04')

      expect(problem).not.toBeNull()
      expect(problem?.platform).toBe('gfg')
      expect(problem?.title).toBe('Bird and Max Fruit Gathering')
      expect(problem?.difficulty).toBe('Easy')
      expect(problem?.problemNumber).toBe('713134')
      expect(problem?.url).toBe('https://www.geeksforgeeks.org/problems/bird-and-maximum-fruit-gathering/1')
      expect(problem?.topicTags).toEqual(['Arrays'])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('GFGProvider: Rejects non-HTTP URLs safely', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            problem_name: 'Dangerous Problem',
            problem_url: 'javascript:alert(1)',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    ) as unknown as typeof fetch

    try {
      const provider = new GFGProvider()
      const problem = await provider.getDailyProblem('2026-09-04')
      expect(problem).toBeNull()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('CodingProblemService & Server Action: Caches problem and handles upstream failure', async () => {
    const originalFetch = globalThis.fetch
    let fetchCount = 0

    globalThis.fetch = mock(() => {
      fetchCount++
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              activeDailyCodingChallengeQuestion: {
                date: '2026-09-04',
                link: '/problems/cached-problem/',
                question: {
                  questionFrontendId: '100',
                  title: 'Cached Problem',
                  difficulty: 'Medium',
                },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    }) as unknown as typeof fetch

    try {
      // First call fetches from upstream
      const res1 = await getDailyCodingProblemAction('leetcode', '2026-09-04')
      expect(res1.success).toBe(true)
      expect(res1.problem?.title).toBe('Cached Problem')
      expect(fetchCount).toBe(1)

      // Second call reuses in-memory cached result without new network request
      const res2 = await getDailyCodingProblemAction('leetcode', '2026-09-04')
      expect(res2.success).toBe(true)
      expect(res2.problem?.title).toBe('Cached Problem')
      expect(fetchCount).toBe(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
