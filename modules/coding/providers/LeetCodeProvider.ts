import { DailyCodingProblem, DailyProblemProvider } from '../types'

export class LeetCodeProvider implements DailyProblemProvider {
  private static readonly GRAPHQL_ENDPOINT = 'https://leetcode.com/graphql'
  private static readonly TIMEOUT_MS = 6000

  async getDailyProblem(_dateStr?: string): Promise<DailyCodingProblem | null> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), LeetCodeProvider.TIMEOUT_MS)

    try {
      const query = `
        query questionOfToday {
          activeDailyCodingChallengeQuestion {
            date
            link
            question {
              questionFrontendId
              title
              difficulty
              topicTags {
                name
              }
            }
          }
        }
      `

      const res = await fetch(LeetCodeProvider.GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Tracker/1.0',
        },
        body: JSON.stringify({ query }),
        signal: controller.signal,
        cache: 'no-store',
      })

      if (!res.ok) {
        throw new Error(`LeetCode GraphQL error: HTTP ${res.status}`)
      }

      const json = await res.json()
      const data = json?.data?.activeDailyCodingChallengeQuestion

      if (!data || !data.question?.title) {
        return null
      }

      const rawLink = data.link || ''
      const url = rawLink.startsWith('http')
        ? rawLink
        : `https://leetcode.com${rawLink}`

      // Security check: must be a valid HTTP(S) url
      if (!/^https?:\/\//i.test(url)) {
        return null
      }

      return {
        platform: 'leetcode',
        title: String(data.question.title).trim(),
        difficulty: data.question.difficulty || 'Medium',
        date: data.date || '',
        url,
        problemNumber: data.question.questionFrontendId ? String(data.question.questionFrontendId) : undefined,
        topicTags: Array.isArray(data.question.topicTags)
          ? data.question.topicTags.map((t: { name: string }) => t.name).filter(Boolean)
          : undefined,
      }
    } catch (err) {
      console.error('[LeetCodeProvider] Failed to fetch daily problem:', err)
      return null
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
