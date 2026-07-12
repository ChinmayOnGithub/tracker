import { NextResponse } from 'next/server'

export interface Contest {
  id: string
  platform: 'codeforces' | 'leetcode'
  name: string
  startTime: number // unix timestamp (seconds)
  durationSeconds: number
  url: string
}

// --- Codeforces ---
async function fetchCodeforcesContests(): Promise<Contest[]> {
  try {
    const res = await fetch('https://codeforces.com/api/contest.list?gym=false', {
      next: { revalidate: 1800 }, // cache 30 min
    })
    if (!res.ok) return []
    const data = await res.json()
    if (data.status !== 'OK') return []
    return (data.result as any[])
      .filter((c: any) => c.phase === 'BEFORE')
      .sort((a: any, b: any) => a.startTimeSeconds - b.startTimeSeconds)
      .slice(0, 3)
      .map((c: any) => ({
        id: String(c.id),
        platform: 'codeforces',
        name: c.name,
        startTime: c.startTimeSeconds,
        durationSeconds: c.durationSeconds,
        url: `https://codeforces.com/contest/${c.id}`,
      }))
  } catch {
    return []
  }
}

// --- LeetCode ---
async function fetchLeetCodeContests(): Promise<Contest[]> {
  try {
    const query = `
      query {
        topTwoContests {
          title
          titleSlug
          startTime
          duration
          __typename
        }
      }
    `
    const res = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': 'https://leetcode.com',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({ query }),
      next: { revalidate: 1800 },
    })
    if (!res.ok) return []
    const data = await res.json()
    const contests = data?.data?.topTwoContests ?? []
    const now = Date.now() / 1000
    return contests
      .filter((c: any) => c.startTime > now)
      .map((c: any) => ({
        id: c.titleSlug,
        platform: 'leetcode',
        name: c.title,
        startTime: c.startTime,
        durationSeconds: c.duration * 60, // LeetCode duration is in minutes
        url: `https://leetcode.com/contest/${c.titleSlug}`,
      }))
  } catch {
    return []
  }
}

export async function GET() {
  const [cf, lc] = await Promise.allSettled([
    fetchCodeforcesContests(),
    fetchLeetCodeContests(),
  ])

  const cfContests = cf.status === 'fulfilled' ? cf.value : []
  const lcContests = lc.status === 'fulfilled' ? lc.value : []

  // Merge and sort by startTime
  const all = [...cfContests, ...lcContests].sort((a, b) => a.startTime - b.startTime)

  return NextResponse.json({ contests: all, fetchedAt: Date.now() })
}
