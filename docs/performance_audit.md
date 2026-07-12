# Tracker OS – Performance Audit & N+1 Query Review

This report analyzes rendering cycles, query payloads, network traffic, and potential performance blockages in Tracker OS.

---

## 1. Database Query Performance & N+1 Audits

We audited all database operations to identify N+1 query patterns.

### A. Activity Templates Loading (`app/page.tsx`)
* **Status**: **Optimized**.
* **Analysis**: When loading the dashboard, the page fetches all activity templates and their tags. Instead of fetching tags iteratively per template (N+1 query pattern), we utilize Prisma's `include: { tags: true }` parameter.
* **Database Actions**: Triggers a single batch query utilizing a `LEFT JOIN` or multiple sub-queries, resulting in exactly **1 database roundtrip** for templates and tags.

### B. Activity Logs Fetching (`app/page.tsx`)
* **Status**: **Optimized**.
* **Analysis**: Fetches all activity logs for the current user in a single request sorted by `logDate` (`db.activityLog.findMany`).
* **Database Actions**: 1 unified select query.

---

## 2. API Caching & Network Optimization

### A. Google Calendar API Rate Limits
* **Caching Layer**: Calendar requests are cached in-memory (`calendarCache`) for 10 minutes.
* **Access Token Memoization**: Access tokens are cached in-memory mapped to their expiration timestamps. We reuse valid access tokens instead of issuing OAuth requests on every API call.
* **Network Retries**: Built-in exponential backoff automatically intercepts 429 (rate-limited) and 5xx responses, delaying retries to smooth out load spikes.

---

## 3. UI Render Optimizations

### A. Avoid Layout Shifts (CLS)
* **Agenda Skeleton**: The `AgendaWidget` displays animated loading skeletons while fetching data asynchronously, eliminating content layout shifts.
* **Deferred state updates**: Restructured the client-side settings and agenda widgets to load connection data inside `useEffect` post-mount. This prevents React hydration mismatches and cascading render cycles.
