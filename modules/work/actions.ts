"use server"

import { requireCapability } from '@/lib/auth-guards';
import { WorkSessionService } from './services/WorkSessionService';
import { revalidatePath } from 'next/cache';
import { WorkSession } from './types';
import { toSafeActionError } from '@/lib/errors';

export async function createWorkSession(session: Partial<WorkSession>) {
  try {
    const user = await requireCapability('work-hours.write');
    if (!session.date || !session.mode) {
      throw new Error('Missing required session fields: date or mode');
    }
    let record;
    if (session.loggingMode === 'manual') {
      if (session.durationMinutes === undefined) {
        throw new Error('durationMinutes is required for manual sessions');
      }
      record = await WorkSessionService.createManualSession({
        id: session.id,
        userId: user.id,
        date: session.date,
        mode: session.mode,
        durationMinutes: session.durationMinutes
      });
    } else {
      record = await WorkSessionService.startSession(
        user.id,
        session.date,
        session.mode,
        session.id,
        session.inTime
      );
    }
    revalidatePath('/');
    return { success: true, data: record };
  } catch (error) {
    console.error('Failed to create work session action:', error);
    return { success: false, error: toSafeActionError(error).message };
  }
}

export async function updateWorkSession(id: string, session: Partial<WorkSession>) {
  try {
    const user = await requireCapability('work-hours.write');
    let record;
    if (session.endedAt) {
      record = await WorkSessionService.stopSession(user.id, id);
    } else {
      record = await WorkSessionService.updateSession(user.id, id, session);
    }
    revalidatePath('/');
    return { success: true, data: record };
  } catch (error) {
    console.error('Failed to update work session action:', error);
    return { success: false, error: toSafeActionError(error).message };
  }
}

export async function pauseWorkSession(id: string) {
  try {
    const user = await requireCapability('work-hours.write');
    const record = await WorkSessionService.pauseSession(user.id, id);
    revalidatePath('/');
    return { success: true, data: record };
  } catch (error) {
    console.error('Failed to pause work session action:', error);
    return { success: false, error: toSafeActionError(error).message };
  }
}

export async function resumeWorkSession(id: string) {
  try {
    const user = await requireCapability('work-hours.write');
    const record = await WorkSessionService.resumeSession(user.id, id);
    revalidatePath('/');
    return { success: true, data: record };
  } catch (error) {
    console.error('Failed to resume work session action:', error);
    return { success: false, error: toSafeActionError(error).message };
  }
}

export async function finishWorkSession(id: string) {
  try {
    const user = await requireCapability('work-hours.write');
    const record = await WorkSessionService.finishSession(user.id, id);
    revalidatePath('/');
    return { success: true, data: record };
  } catch (error) {
    console.error('Failed to finish work session action:', error);
    return { success: false, error: toSafeActionError(error).message };
  }
}

export async function deleteWorkSession(id: string) {
  try {
    const user = await requireCapability('work-hours.write');
    await WorkSessionService.deleteSession(user.id, id);
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete work session action:', error);
    return { success: false, error: toSafeActionError(error).message };
  }
}
