# Provider Pattern

**Pattern type**: Integration  
**Capabilities used**: `SCHEDULABLE`, `SYNCABLE`  
**Used by**: Google Calendar, future: Outlook, Apple Calendar, Strava, GitHub

> **Prerequisite reading**: [SPEC.md §1.7 Provider](../../SPEC.md#17-provider), [SPEC.md §1.6 Event](../../SPEC.md#16-event)

---

## Intent

Allow external data sources to contribute Events to the Timeline through a standardized adapter interface, without coupling the Timeline to any specific provider's SDK or API.

---

## Problem

The Timeline must merge local Template Occurrences with external calendar events from Google Calendar (and eventually Outlook, Apple, etc.). Each provider has a completely different API, authentication model, and data shape. The Timeline cannot have provider-specific code.

Additionally, providers must support write-back: when the user marks an event complete in Tracker, that status may need to be synced back to the external calendar.

---

## Solution

Every provider implements the `ICalendarProvider` interface. The `ProviderService` maintains a registry of providers and queries them uniformly. The Timeline consumes only `CalendarEvent[]` — it never knows which provider produced them.

```
ICalendarProvider (interface)
       ↑ implements
GoogleCalendarProvider     OutlookProvider (future)    AppleProvider (future)
       ↓
ProviderService (registry + cache)
       ↓
TimelineService (merges with local Occurrences)
       ↓
Timeline UI
```

---

## Interface Contract

```typescript
// lib/providers.ts
export interface ICalendarProvider {
  readonly name: string

  /**
   * Fetch all events for a given date range.
   * Must return CalendarEvent[] — never throw on provider errors.
   * Return empty array if the provider is disconnected or rate-limited.
   */
  fetchEvents(userId: string, from: Date, to: Date): Promise<CalendarEvent[]>

  /**
   * Optional write-back: update event status on the external provider.
   */
  updateEventStatus?(eventId: string, status: 'completed' | 'cancelled'): Promise<void>
}

export interface CalendarEvent {
  id: string
  source: string          // Provider name — displayed in UI as "from Google Calendar"
  title: string
  start: Date | null      // null for all-day events
  end: Date | null
  isAllDay: boolean
  location?: string
  description?: string
  htmlLink?: string       // Deep link back to external calendar
}
```

---

## Implementation Steps

### 1. Create the Provider class

```typescript
// modules/sync/my-provider/providers/MyCalendarProvider.ts
export class MyCalendarProvider implements ICalendarProvider {
  readonly name = 'My Calendar'

  async fetchEvents(userId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
    const creds = await getCredentials(userId)
    if (!creds) return []    // Never throw — return empty if disconnected

    try {
      const raw = await myCalendarSdk.list({ from, to, token: creds.accessToken })
      return raw.map(e => ({
        id: e.id,
        source: this.name,
        title: e.summary ?? '(No title)',
        start: e.start ? new Date(e.start) : null,
        end: e.end ? new Date(e.end) : null,
        isAllDay: !e.start?.includes('T'),
      }))
    } catch {
      return []    // Degrade gracefully — never crash the Timeline
    }
  }
}
```

### 2. Register in ProviderService

```typescript
// lib/services/ProviderService.ts
import { MyCalendarProvider } from '@/modules/sync/my-provider'

const PROVIDERS: ICalendarProvider[] = [
  new GoogleCalendarProvider(),
  new MyCalendarProvider(),    // ← add here
]
```

### 3. Store credentials in the Integration table

```prisma
// New credential model in schema.prisma
model MyCalendarCredential {
  id           String   @id @default(uuid())
  userId       String   @unique
  accessToken  String
  refreshToken String
  tokenExpiry  DateTime
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user User @relation(...)
}
```

---

## Auto-Completion Rule

If an external Event's end time is in the past when the Timeline is assembled, it is marked as `completed = true` automatically. This prevents past meetings from cluttering the active task list.

```typescript
const completed = event.end ? event.end < now : false
```

---

## Caching Rules

Providers are expensive (network + rate limits). Cache their output:
- Cache key: `provider:{userId}:{date}`
- TTL: 5 minutes (configurable per provider)
- Invalidate: on explicit user `forceRefresh` or after a write-back operation

---

## Rules

1. Providers **never own data**. They are sources, never stores.
2. Provider errors must degrade gracefully — return `[]`, never throw to the Timeline.
3. Never call a Provider directly from a Server Action or Component. Always go through `ProviderService`.
4. Credentials are stored encrypted. Refresh tokens are AES-256-GCM encrypted at rest.

---

## See Also

- [SPEC.md §1.7 Provider](../../SPEC.md#17-provider)
- [SPEC.md §1.12 Integration](../../SPEC.md#112-integration)
- [Timeline Pattern.md](./Timeline%20Pattern.md)
- [`lib/providers.ts`](../../lib/providers.ts)
- [`modules/sync/google-calendar/`](../../modules/sync/google-calendar/)
