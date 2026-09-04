import { db } from '@/lib/db'
import { CalendarEvent, CalendarSyncState, Prisma } from '@prisma/client'

export class CalendarRepository {
  static async findEventsForUser(
    userId: string,
    start: Date,
    end: Date
  ): Promise<CalendarEvent[]> {
    return db.calendarEvent.findMany({
      where: {
        userId,
        deletedAt: null,
        start: { lte: end },
        end: { gte: start },
      },
      orderBy: {
        start: 'asc',
      },
    })
  }

  static async findEventById(userId: string, id: string): Promise<CalendarEvent | null> {
    return db.calendarEvent.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    })
  }

  static async findEventByArtifact(
    userId: string,
    trackerArtifactId: string,
    trackerArtifactType: string
  ): Promise<CalendarEvent | null> {
    return db.calendarEvent.findFirst({
      where: {
        userId,
        trackerArtifactId,
        trackerArtifactType,
        deletedAt: null,
      },
    })
  }

  static async createEvent(
    userId: string,
    data: Omit<CalendarEvent, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'>
  ): Promise<CalendarEvent> {
    return db.calendarEvent.create({
      data: {
        ...data,
        userId,
        externalMetadata: data.externalMetadata as Prisma.InputJsonValue,
      },
    })
  }

  static async updateEvent(
    userId: string,
    id: string,
    data: Partial<Omit<CalendarEvent, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'>>
  ): Promise<CalendarEvent> {
    // Atomic mutation predicate: strictly bound by both id and userId
    const updateResult = await db.calendarEvent.updateMany({
      where: {
        id,
        userId,
        deletedAt: null,
      },
      data: {
        ...data,
        externalMetadata: data.externalMetadata !== undefined ? (data.externalMetadata as Prisma.InputJsonValue) : undefined,
      },
    })

    if (updateResult.count === 0) {
      throw new Error(`Calendar event not found or unauthorized for update: ${id}`)
    }

    const updated = await this.findEventById(userId, id)
    if (!updated) {
      throw new Error(`Calendar event not found after update: ${id}`)
    }
    return updated
  }

  static async deleteEvent(userId: string, id: string): Promise<CalendarEvent> {
    // Soft delete safeguard: strictly bound by both id and userId in atomic mutation
    const deleteResult = await db.calendarEvent.updateMany({
      where: {
        id,
        userId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    })

    if (deleteResult.count === 0) {
      throw new Error(`Calendar event not found or unauthorized for deletion: ${id}`)
    }

    const deleted = await db.calendarEvent.findFirst({
      where: { id, userId },
    })
    return deleted!
  }

  static async deleteEventByArtifact(
    userId: string,
    trackerArtifactId: string,
    trackerArtifactType: string
  ): Promise<void> {
    const existing = await this.findEventByArtifact(userId, trackerArtifactId, trackerArtifactType)
    if (existing) {
      await this.deleteEvent(userId, existing.id)
    }
  }

  static async getSyncState(
    userId: string,
    provider: string
  ): Promise<CalendarSyncState | null> {
    return db.calendarSyncState.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
    })
  }

  static async updateSyncState(
    userId: string,
    provider: string,
    data: Partial<Omit<CalendarSyncState, 'id' | 'userId' | 'provider' | 'createdAt' | 'updatedAt'>>
  ): Promise<CalendarSyncState> {
    return db.calendarSyncState.upsert({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
      update: data,
      create: {
        ...data,
        userId,
        provider,
      },
    })
  }
}
