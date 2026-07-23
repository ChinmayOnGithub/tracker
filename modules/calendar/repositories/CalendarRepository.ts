import { db } from '@/lib/db'
import { CalendarEvent, CalendarSyncState, Prisma } from '@prisma/client'

export class CalendarRepository {
  static async findEventsForUser(
    userId: string,
    _start: Date,
    end: Date
  ): Promise<CalendarEvent[]> {
    return db.calendarEvent.findMany({
      where: {
        userId,
        deletedAt: null,
        start: { lte: end },
      },
      orderBy: {
        start: 'asc',
      },
    })
  }

  static async findEventById(id: string): Promise<CalendarEvent | null> {
    return db.calendarEvent.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    })
  }

  static async findEventByArtifact(
    trackerArtifactId: string,
    trackerArtifactType: string
  ): Promise<CalendarEvent | null> {
    return db.calendarEvent.findFirst({
      where: {
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
    id: string,
    data: Partial<Omit<CalendarEvent, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'>>
  ): Promise<CalendarEvent> {
    return db.calendarEvent.update({
      where: { id },
      data: {
        ...data,
        externalMetadata: data.externalMetadata !== undefined ? (data.externalMetadata as Prisma.InputJsonValue) : undefined,
      },
    })
  }

  static async deleteEvent(id: string): Promise<CalendarEvent> {
    // Database Safety Safeguard: Always soft delete CalendarEvent using deletedAt
    return db.calendarEvent.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }

  static async deleteEventByArtifact(
    trackerArtifactId: string,
    trackerArtifactType: string
  ): Promise<void> {
    const existing = await this.findEventByArtifact(trackerArtifactId, trackerArtifactType)
    if (existing) {
      await this.deleteEvent(existing.id)
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
