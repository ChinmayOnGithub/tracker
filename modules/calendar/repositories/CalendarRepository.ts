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
    const existing = await this.findEventById(userId, id)
    if (!existing) {
      throw new Error(`Calendar event not found or unauthorized for update: ${id}`)
    }

    return db.calendarEvent.update({
      where: { id },
      data: {
        ...data,
        externalMetadata: data.externalMetadata !== undefined ? (data.externalMetadata as Prisma.InputJsonValue) : undefined,
      },
    })
  }

  static async deleteEvent(userId: string, id: string): Promise<CalendarEvent> {
    const existing = await this.findEventById(userId, id)
    if (!existing) {
      throw new Error(`Calendar event not found or unauthorized for deletion: ${id}`)
    }

    // Database Safety Safeguard: Always soft delete CalendarEvent using deletedAt
    return db.calendarEvent.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
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
