/**
 * tests/task-state-machine-store.test.ts
 *
 * Validates that the TaskStateMachine defines the correct legal transitions
 * and that the cycle implemented in cycleTaskStatusAction is consistent with it.
 */
import { describe, it, expect } from 'bun:test'
import { TaskStateMachine, TaskOccurrenceState } from '@/modules/activities/domain/TaskStateMachine'

describe('TaskStateMachine', () => {

  describe('Legal forward transitions', () => {
    it('pending → done is valid', () => {
      expect(TaskStateMachine.isValidTransition('pending', 'done')).toBe(true)
    })

    it('pending → skipped is valid', () => {
      expect(TaskStateMachine.isValidTransition('pending', 'skipped')).toBe(true)
    })

    it('pending → postponed is valid', () => {
      expect(TaskStateMachine.isValidTransition('pending', 'postponed')).toBe(true)
    })

    it('done → pending is valid (undo)', () => {
      expect(TaskStateMachine.isValidTransition('done', 'pending')).toBe(true)
    })

    it('skipped → pending is valid (undo)', () => {
      expect(TaskStateMachine.isValidTransition('skipped', 'pending')).toBe(true)
    })

    it('postponed → pending is valid (un-postpone)', () => {
      expect(TaskStateMachine.isValidTransition('postponed', 'pending')).toBe(true)
    })

    it('postponed → done is valid (complete after postpone)', () => {
      expect(TaskStateMachine.isValidTransition('postponed', 'done')).toBe(true)
    })
  })

  describe('Illegal transitions', () => {
    it('done → done should NOT be valid', () => {
      expect(TaskStateMachine.isValidTransition('done', 'done')).toBe(false)
    })

    it('done → postponed directly should NOT be valid', () => {
      expect(TaskStateMachine.isValidTransition('done', 'postponed')).toBe(false)
    })

    it('skipped → done should NOT be valid', () => {
      expect(TaskStateMachine.isValidTransition('skipped', 'done')).toBe(false)
    })

    it('skipped → skipped should NOT be valid', () => {
      expect(TaskStateMachine.isValidTransition('skipped', 'skipped')).toBe(false)
    })

    it('pending → pending should NOT be valid', () => {
      expect(TaskStateMachine.isValidTransition('pending', 'pending')).toBe(false)
    })
  })

  describe('Additional valid transitions per UI cycle spec', () => {
    it('done → skipped is valid (cycle: Done to Canceled)', () => {
      expect(TaskStateMachine.isValidTransition('done', 'skipped')).toBe(true)
    })

    it('skipped → postponed is valid (cycle: Canceled to Postponed for non-daily)', () => {
      expect(TaskStateMachine.isValidTransition('skipped', 'postponed')).toBe(true)
    })
  })

  describe('Cycle sequence consistency', () => {
    /**
     * Simulate the cycle logic from cycleTaskStatusAction:
     * Cleared (pending) → Done → Skipped → Postponed → Cleared (non-daily)
     */
    const simulateCycle = (
      currentCompleted: boolean,
      currentStatus: string | undefined,
      isDaily: boolean
    ): { nextCompleted: boolean; nextStatus: string | undefined; nextMachineState: TaskOccurrenceState | null } => {
      const isCanceled  = currentStatus === 'skipped'
      const isPostponed = currentStatus === 'postponed'
      const isDone      = currentCompleted && !isCanceled && !isPostponed

      let nextCompleted  = false
      let nextStatus: string | undefined = undefined
      let nextMachineState: TaskOccurrenceState | null = null

      if (!currentCompleted && !isCanceled && !isPostponed) {
        nextMachineState = 'done'; nextCompleted = true; nextStatus = 'done'
      } else if (isDone) {
        nextMachineState = 'skipped'; nextCompleted = true; nextStatus = 'skipped'
      } else if (isCanceled) {
        if (isDaily) {
          nextMachineState = 'pending'; nextCompleted = false; nextStatus = undefined
        } else {
          nextMachineState = 'postponed'; nextCompleted = true; nextStatus = 'postponed'
        }
      } else if (isPostponed) {
        nextMachineState = 'pending'; nextCompleted = false; nextStatus = undefined
      }

      return { nextCompleted, nextStatus, nextMachineState }
    }

    it('non-daily: full cycle cleared→done→skipped→postponed→cleared produces valid transitions', () => {
      const transitions: Array<{ from: TaskOccurrenceState; to: TaskOccurrenceState }> = []

      // State 0: cleared (pending)
      let completed = false
      let status: string | undefined = undefined

      for (let i = 0; i < 4; i++) {
        const currentMachineState: TaskOccurrenceState =
          status === 'postponed' ? 'postponed' :
          status === 'skipped'   ? 'skipped'   :
          completed              ? 'done'       :
          'pending'

        const { nextCompleted, nextStatus, nextMachineState } = simulateCycle(completed, status, false)

        if (nextMachineState !== null && nextMachineState !== 'pending') {
          transitions.push({ from: currentMachineState, to: nextMachineState })
          expect(TaskStateMachine.isValidTransition(currentMachineState, nextMachineState)).toBe(true)
        }

        completed = nextCompleted
        status    = nextStatus
      }

      // Should have gone: pending→done, done→skipped, skipped→postponed
      expect(transitions.length).toBe(3)
      expect(transitions[0]).toEqual({ from: 'pending',   to: 'done'      })
      expect(transitions[1]).toEqual({ from: 'done',      to: 'skipped'   })
      expect(transitions[2]).toEqual({ from: 'skipped',   to: 'postponed' })
    })

    it('daily: cycle cleared→done→skipped→cleared (no postponed step)', () => {
      let completed = false
      let status: string | undefined = undefined

      // Step 1: pending → done
      const step1 = simulateCycle(completed, status, true)
      expect(step1.nextMachineState).toBe('done')
      completed = step1.nextCompleted; status = step1.nextStatus

      // Step 2: done → skipped
      const step2 = simulateCycle(completed, status, true)
      expect(step2.nextMachineState).toBe('skipped')
      completed = step2.nextCompleted; status = step2.nextStatus

      // Step 3: skipped → pending (daily skips postponed)
      const step3 = simulateCycle(completed, status, true)
      expect(step3.nextMachineState).toBe('pending')
      expect(step3.nextCompleted).toBe(false)
      expect(step3.nextStatus).toBeUndefined()
    })
  })
})
