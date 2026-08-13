"use server"

import { requireAuth } from '@/lib/auth-guards';
import { WorkSessionService } from './services/WorkSessionService';
import { revalidatePath } from 'next/cache';
import { WorkSession } from './types';

export async function createWorkSession(session: Partial<WorkSession>) {
  try {
    const user = await requireAuth();
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
        session.id
      );
    }
    revalidatePath('/');
    return { success: true, data: record };
  } catch (error) {
    console.error('Failed to create work session action:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function updateWorkSession(id: string, session: Partial<WorkSession>) {
  try {
    const user = await requireAuth();
    let record;
    if (session.endedAt) {
      record = await WorkSessionService.stopSession(user.id, id);
    }
    revalidatePath('/');
    return { success: true, data: record };
  } catch (error) {
    console.error('Failed to update work session action:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deleteWorkSession(id: string) {
  try {
    const user = await requireAuth();
    await WorkSessionService.deleteSession(user.id, id);
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete work session action:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
