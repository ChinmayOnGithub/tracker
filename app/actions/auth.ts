"use server"

import { db } from '@/lib/db'
import crypto from 'crypto'

const SALT = process.env.AUTH_SALT || 'personal-dashboard-ops-salt-108-prayer-beads'

function hashPin(pin: string): string {
  return crypto.pbkdf2Sync(pin, SALT, 1000, 64, 'sha512').toString('hex')
}

/**
 * Checks if the system has been initialized with a password yet.
 */
export async function isPinSetup(): Promise<boolean> {
  try {
    const user = await db.user.findFirst({
      where: { username: 'admin' },
    })
    return !!user
  } catch (error) {
    console.error('Failed to check PIN setup:', error)
    return false
  }
}

/**
 * Saves a new system PIN in the database.
 */
export async function registerPin(pin: string): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await db.user.findFirst({
      where: { username: 'admin' },
    })
    if (existing) {
      return { success: false, error: 'A PIN has already been configured for this system.' }
    }
    const passwordHash = hashPin(pin)
    await db.user.create({
      data: {
        username: 'admin',
        passwordHash,
      },
    })
    return { success: true }
  } catch (error) {
    console.error('Failed to setup PIN:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Database error during PIN configuration' }
  }
}

/**
 * Verifies a PIN code against the stored hash in the database.
 */
export async function verifyPinAction(pin: string): Promise<{ success: boolean }> {
  try {
    const user = await db.user.findFirst({
      where: { username: 'admin' },
    })
    if (!user) {
      return { success: false }
    }
    const passwordHash = hashPin(pin)
    if (user.passwordHash === passwordHash) {
      return { success: true }
    }
    return { success: false }
  } catch (error) {
    console.error('Failed to verify PIN:', error)
    return { success: false }
  }
}
