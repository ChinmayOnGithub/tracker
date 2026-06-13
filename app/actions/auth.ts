"use server"

import { db } from '@/lib/db'
import crypto from 'crypto'
import { cookies } from 'next/headers'
import { signSession, verifySession } from '@/lib/session'

const SALT = process.env.AUTH_SALT || 'personal-dashboard-ops-salt-108-prayer-beads'

function hashPin(pin: string, username: string): string {
  // Use unique salt per user by combining global salt with user's lowercase username
  const userSalt = `${SALT}-${username.toLowerCase()}`
  return crypto.pbkdf2Sync(pin, userSalt, 1000, 64, 'sha512').toString('hex')
}

function legacyHashPin(pin: string): string {
  return crypto.pbkdf2Sync(pin, SALT, 1000, 64, 'sha512').toString('hex')
}

/**
 * Retrieves the currently logged-in user from the signed session token cookie.
 */
export async function getLoggedUser(): Promise<{ id: string; username: string } | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('session_token')?.value
    const session = verifySession(token)
    if (!session) return null
    return { id: session.userId, username: session.username }
  } catch (error) {
    console.error('Failed to get logged user:', error)
    return null
  }
}

/**
 * Registers a new user with a unique username and a 4-digit PIN.
 */
export async function registerUserAction(usernameInput: string, pin: string): Promise<{ success: boolean; error?: string; user?: { id: string; username: string } }> {
  try {
    const username = usernameInput.trim().toLowerCase()
    if (!username || username.length < 2) {
      return { success: false, error: 'Username must be at least 2 characters.' }
    }
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      return { success: false, error: 'PIN must be exactly 4 digits.' }
    }

    // Check if user already exists
    const existing = await db.user.findUnique({
      where: { username }
    })

    if (existing) {
      return { success: false, error: 'Username is already taken.' }
    }

    const passwordHash = hashPin(pin, username)
    const newUser = await db.user.create({
      data: {
        username,
        passwordHash,
      }
    })

    // Create 3 default starter activities for new users
    await db.activityTemplate.createMany({
      data: [
        {
          userId: newUser.id,
          name: 'Reading Book',
          category: 'personal',
          icon: 'BookOpen',
          color: 'green',
          recurrenceType: 'daily',
          sortOrder: 1,
          notes: 'Read at least 15 pages',
        },
        {
          userId: newUser.id,
          name: 'Wash Hairs',
          category: 'personal',
          icon: 'ShowerHead',
          color: 'blue',
          recurrenceType: 'custom',
          recurrenceInterval: 3,
          sortOrder: 2,
          notes: 'Wash and condition hair',
        },
        {
          userId: newUser.id,
          name: 'Netflix Subscription',
          category: 'finance',
          icon: 'Tv',
          color: 'red',
          recurrenceType: 'monthly',
          recurrenceDayOfMonth: 15,
          amount: 199.00,
          sortOrder: 3,
          notes: 'Monthly standard stream plan',
        }
      ]
    })

    // Set signed cookie
    const token = signSession(newUser.id, newUser.username)
    const cookieStore = await cookies()
    cookieStore.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/'
    })

    return { success: true, user: { id: newUser.id, username: newUser.username } }
  } catch (error) {
    console.error('Registration failed:', error)
    return { success: false, error: 'Database error during registration.' }
  }
}

/**
 * Verifies a PIN code and username against the database, sets session cookie.
 */
export async function verifyPinAction(usernameInput: string, pin: string): Promise<{ success: boolean; error?: string; user?: { id: string; username: string } }> {
  try {
    const username = usernameInput.trim().toLowerCase()
    if (!username) {
      return { success: false, error: 'Username is required.' }
    }
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      return { success: false, error: 'PIN must be exactly 4 digits.' }
    }

    const user = await db.user.findUnique({
      where: { username }
    })

    if (!user) {
      return { success: false, error: 'Incorrect username or PIN.' }
    }

    const passwordHash = hashPin(pin, username)
    let isMatch = user.passwordHash === passwordHash

    // Safe migration/fallback for legacy single-user 'admin' account
    if (!isMatch && username === 'admin') {
      const legacyHash = legacyHashPin(pin)
      if (user.passwordHash === legacyHash) {
        isMatch = true
        // Upgrade admin's hash to the secure username-salted hash format
        try {
          const newHash = hashPin(pin, username)
          await db.user.update({
            where: { id: user.id },
            data: { passwordHash: newHash }
          })
        } catch (upgradeError) {
          console.warn('Failed to upgrade admin password hash format:', upgradeError)
        }
      }
    }

    if (!isMatch) {
      return { success: false, error: 'Incorrect username or PIN.' }
    }

    // Set signed cookie
    const token = signSession(user.id, user.username)
    const cookieStore = await cookies()
    cookieStore.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/'
    })

    return { success: true, user: { id: user.id, username: user.username } }
  } catch (error) {
    console.error('Login failed:', error)
    return { success: false, error: 'Database error during login.' }
  }
}

/**
 * Logs out the current user by deleting the session token cookie.
 */
export async function logoutAction(): Promise<{ success: boolean }> {
  try {
    const cookieStore = await cookies()
    cookieStore.delete('session_token')
    return { success: true }
  } catch (error) {
    console.error('Logout failed:', error)
    return { success: false }
  }
}

/**
 * Simple helper to check if any user is configured in the system.
 */
export async function isPinSetup(): Promise<boolean> {
  try {
    const count = await db.user.count()
    return count > 0
  } catch (error) {
    console.error('Failed to check user counts:', error)
    return false
  }
}
