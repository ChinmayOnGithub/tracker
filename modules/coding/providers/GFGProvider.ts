import { DailyCodingProblem, DailyProblemProvider } from '../types'

export class GFGProvider implements DailyProblemProvider {
  private static readonly ENDPOINT = 'https://practiceapi.geeksforgeeks.org/api/v1/problems-of-day/problem/today/'
  private static readonly TIMEOUT_MS = 6000

  async getDailyProblem(_dateStr?: string): Promise<DailyCodingProblem | null> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), GFGProvider.TIMEOUT_MS)

    try {
      const res = await fetch(GFGProvider.ENDPOINT, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Tracker/1.0',
        },
        signal: controller.signal,
        cache: 'no-store',
      })

      if (!res.ok) {
        throw new Error(`GFG API error: HTTP ${res.status}`)
      }

      const data = await res.json()

      if (!data || !data.problem_name || !data.problem_url) {
        return null
      }

      const url = String(data.problem_url).trim()

      // Security check: must be valid HTTP(S) URL
      if (!/^https?:\/\//i.test(url)) {
        return null
      }

      const topicTags: string[] = []
      if (Array.isArray(data.tags?.topic_tags)) {
        topicTags.push(...data.tags.topic_tags.map(String).filter(Boolean))
      }

      const rawDate = data.date ? String(data.date).split(' ')[0] : ''

      return {
        platform: 'gfg',
        title: String(data.problem_name).trim(),
        difficulty: data.difficulty ? String(data.difficulty) : 'Medium',
        date: rawDate,
        url,
        problemNumber: data.problem_id ? String(data.problem_id) : undefined,
        topicTags: topicTags.length > 0 ? topicTags : undefined,
      }
    } catch (err) {
      console.error('[GFGProvider] Failed to fetch daily problem:', err)
      return null
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
