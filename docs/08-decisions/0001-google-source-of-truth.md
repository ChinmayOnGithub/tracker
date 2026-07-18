# ADR 0001: Google Calendar as Scheduling Source of Truth

## Context & Problem Statement
In Tracker v1, calendar events were duplicated locally in the database. Maintaining two independent calendars results in complex two-way sync conflicts, timezone offsets, and data drift.

## Decision
Google Calendar is the absolute source of truth.
* We do NOT replicate entire Google Calendars locally.
* We only store `LinkedEventMapping` to bind local entity logs (e.g. habit logs, workouts) to Google Event IDs.
* Read queries fetch directly from Google Calendar APIs, supported by a short-term caching layer on the server.

## Consequences
* **Positives**: Eliminates data replication, race conditions, and timezone mapping bugs.
* **Negatives**: Displays loading states or offline cache fallbacks when Google API is offline or rate-limited.
