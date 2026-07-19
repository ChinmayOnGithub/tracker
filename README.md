# Tracker – Personal Life Operating System

Tracker is a production-grade, personal operating system built to manage daily life, routines, habits, fitness, scheduling, and personal records in one unified interface.

---

## 1. Architecture Overview

Tracker conforms to a **Domain-Driven modular boundary design**:
* **Infrastructure Layer (`lib/`)**: Shared database clients (`db.ts`), authentication sessions (`session.ts`), environments validation (`env.ts`), loggers (`logger.ts`), and global constants (`constants.ts`).
* **Design System (`design-system/`)**: Centralized design tokens and custom primitive components (`Button`, `Card`, `Input`, `Modal`, `EmptyState`, `Skeleton`).
* **Domain Modules (`modules/`)**: Fully encapsulated modules with strict internal borders:
  * `core/`: Fundamental routing layout and dashboard composition hosts.
  * `sync/`: Sync channels (e.g. Google Calendar integration).
  * `life/`: Domain managers (e.g. Habits, Workout).

All major design parameters are documented in the [System Architecture handbook](file:///d:/github_projeccts/tracker/docs/02-architecture/System Architecture.md).

---

## 2. Local Setup & Installation

### Prerequisites
* [Bun Runtime](https://bun.sh) (v1.x)
* [PostgreSQL](https://www.postgresql.org) database instance

### 1. Install Dependencies
```bash
bun install
```

### 2. Configure Environment Variables
Create a `.env` file at the root of the project:
```env
# Database Credentials
DATABASE_URL="postgresql://username:password@localhost:5432/tracker?schema=public"
DIRECT_URL="postgresql://username:password@localhost:5432/tracker?schema=public"

# Auth & Passcode
AUTH_SECRET="your-32-character-session-salt-key-string"

# Google Calendar OAuth Credentials
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_OAUTH_ENCRYPTION_KEY="your-oauth-encryption-key-for-refresh-tokens"
```

### 3. Deploy Database Migrations
```bash
bunx prisma migrate deploy
```

### 4. Seed Development Database
```bash
bunx prisma db seed
```

### 5. Launch Development Server
```bash
bun run dev
```
Open `http://localhost:3000` to view the dashboard.

---

## 3. Activity vs Task Logic

The application models tasks and habits based on the following business rules:

1. **Activities (Habits)**: Created as recurring templates (`ActivityTemplate`). Evaluated automatically on any given day (e.g. today) to generate daily timeline occurrences.
2. **Tasks (Occurrences)**: Every evaluated daily activity template translates to a trackable todo **Task** on the dashboard. Users can also add individual, one-off tasks manually.
3. **Cycling Checklist States**: Clicks on any task checkbox cycle its state directly in the database:
   - Non-Daily Activities: `Cleared (Active)` ➔ `Done` ➔ `Canceled (Skipped)` ➔ `Postponed` ➔ `Cleared`
   - Daily Activities: `Cleared (Active)` ➔ `Done` ➔ `Canceled (Skipped)` ➔ `Cleared` (postpone is disabled for daily items to avoid redundancy).
4. **Postpone Next-Day Scheduling**: Marking a task postponed schedules it to automatically move and appear on the next day's timeline. Performing any other action (Done/Canceled) clears the postponed schedule, reverting the task to its standard recurrence rule.

---

## 4. Development Commands

* **Compile Check**: `bunx tsc --noEmit`
* **Run Unit Tests**: `bun test`
* **Build Project**: `bun run build`

Unit tests are automatically executed and must pass on every production build run.
For more details, see [docs/05-engineering/Testing.md](file:///d:/github_projeccts/tracker/docs/05-engineering/Testing.md).
