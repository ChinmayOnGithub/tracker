# Personal Life Dashboard

A clean, functional, end-to-end full-stack personal operations dashboard built with Next.js (App Router), TypeScript, Tailwind CSS, and Prisma ORM. It provides a dual-column layout: a left-side monthly calendar and a right-side activity tracking panel.

## Features

1.  **Monthly Calendar View (Left Column):**
    *   Responsive, beautiful grid showing the current month.
    *   Indicators (dots) showing completed activities on specific days.
    *   Daily Note indicator showing standalone notes.
    *   Activity density heatmap styling (cells darken based on logged completion volume).
    *   Month-by-month back/forward navigation.
    *   Clicking a day opens the log manager modal for that date.

2.  **Dashboard Panel (Right Column):**
    *   Smart task sections: **Due Today / Overdue**, **Due This Week**, **Due Later This Month**, and **Upcoming Yearly Renewals**.
    *   **Milestones / Last-Done Trackers** (e.g. Haircut card calculating precises months/days since last done).
    *   **Recently Completed Logs** with instant "Undo" (deletion) support.
    *   Search and filter capability (filter by category, tag, or search by name).
    *   One-click quick "Mark Complete" for pending items.

3.  **Template Management:**
    *   Full CRUD for activity configurations.
    *   Reorder templates using simple Up/Down arrow sorting controls.
    *   Create, edit, duplicate, archive/unarchive, and delete templates at any time.

4.  **Daily Log & Note Manager (Day Detail Modal):**
    *   Standalone daily freeform note creator (independent of any task).
    *   Log custom details (notes, amounts) for any template.
    *   **Dynamic Workout Builder:** Log exercises, and for each exercise build reps, sets, and weights. Saves dynamically into the log's JSONB payload.

---

## Technical Architecture

### 1. Date & Timezone Strategy
To eliminate day-shifting timezone bugs (which commonly occur when timezone conversions shift dates to the previous or next day), this app stores calendar dates as **date-only strings** in the format `YYYY-MM-DD` (e.g. `"2026-06-13"`).
*   No UTC `DateTime` values are used for calendar events.
*   Only system audit timestamps (`createdAt`, `updatedAt`) use standard database timestamps.
*   This makes calculations completely immune to client/server timezone differences.

### 2. Recurrence Calculation Engine
A modular utility layer in `lib/recurrence.ts` handles all recurrence arithmetic on the server. Supported types:
*   `daily`: Due every day. Calculates streaks.
*   `weekly`: Due weekly. Supports custom weekdays (e.g. Mon, Wed, Fri).
*   `monthly`: Due monthly. Optionally targets a specific day of the month.
*   `yearly`: Due yearly. Optionally targets a specific month and day of the month.
*   `custom`: Due every $X$ days.
*   `one_time`: Due on a target date once.
*   `milestone`: Not due; tracks and displays the elapsed time since the last completion (e.g. haircuts).

---

## Local Development (SQLite)

For ease of local testing with zero external database dependencies, this project defaults to **SQLite** (`dev.db`).

### 1. Setup Environment
Create a `.env` file in the root of the project:
```bash
DATABASE_URL="file:./dev.db"
```

### 2. Install Packages
```bash
bun install
```

### 3. Initialize Database
Create the database tables and apply schema:
```bash
bunx prisma db push
```

### 4. Seed Database
Pre-populate the database with 30 days of mock log data (workouts with sets, daily journals, multivitamin habits, Spotify subscriptions):
```bash
bunx prisma db seed
```

### 5. Launch Local Server
```bash
bun run dev
```
Open `http://localhost:3000` to inspect and interact.

---

## Production Deployment (PostgreSQL + Vercel)

Vercel functions are serverless and read-only, which means a local SQLite file won't persist. For production, you must use a hosted PostgreSQL instance (e.g. Supabase, Neon).

### 1. Update Provider
In `prisma/schema.prisma`, change the database provider to `postgresql`:
```prisma
datasource db {
  provider = "postgresql"
}
```

### 2. Configure Database URL
In your `.env` (locally) and on Vercel (environment variables), set the `DATABASE_URL` to your live Postgres connection string:
```bash
DATABASE_URL="postgresql://user:password@host:5432/db?schema=public"
```

### 3. Update Client Singleton
In `lib/db.ts`, swap the database client initialization. Comment out the SQLite section (Option A) and uncomment the PostgreSQL section (Option B):
```typescript
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const prismaClientSingleton = () => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL env variable is not set")
  }
  const pool = new Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}
```

### 4. Deploy
Prisma v7 will generate type definitions automatically during the Vercel build step. Apply migrations and push schemas:
```bash
bunx prisma db push
```
Deploy the folder to Vercel via CLI or GitHub integration.
