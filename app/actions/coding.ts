"use server"

import { CodingProblemService } from '@/modules/coding/services/CodingProblemService'
import { DailyCodingProblem } from '@/modules/coding/types'

export async function getDailyCodingProblemAction(
  platform: 'leetcode' | 'gfg',
  dateParam?: string
): Promise<{ success: boolean; problem?: DailyCodingProblem | null; error?: string }> {
  try {
    const problem = await CodingProblemService.getDailyProblem(platform, dateParam)
    if (!problem) {
      return { success: false, error: `Unable to load today's ${platform === 'leetcode' ? 'LeetCode' : 'GFG'} problem` }
    }
    return { success: true, problem }
  } catch (error) {
    console.error(`[getDailyCodingProblemAction] Error fetching ${platform} problem:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : `Failed to load ${platform} problem`,
    }
  }
}
