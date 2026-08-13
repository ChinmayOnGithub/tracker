"use server"

import { requireAuth } from '@/lib/auth-guards';
import { WorkSessionService } from './services/WorkSessionService';
import { revalidatePath } from 'next/cache';

export async function createWorkSession(session: any) {
  try {
    const user = await requireAuth();
    let record;
    if (session.loggingMode === 'manual') {
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

export async function updateWorkSession(id: string, session: any) {
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
