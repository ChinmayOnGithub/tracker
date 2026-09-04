export interface DailyCodingProblem {
  platform: 'leetcode' | 'gfg'
  title: string
  difficulty?: string
  date: string
  url: string
  problemNumber?: string
  topicTags?: string[]
  description?: string
}

export interface DailyProblemProvider {
  getDailyProblem(dateStr?: string): Promise<DailyCodingProblem | null>
}
