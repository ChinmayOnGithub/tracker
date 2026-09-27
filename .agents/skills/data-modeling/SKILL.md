---
name: data-modeling
description: Design domain data models, multi-tenancy isolation patterns, audit history, soft deletion, retention policies, and archival strategies.
---

# Data Modeling Skill

Use this workflow when establishing data ownership, entity lifecycle, multi-tenant isolation, or audit strategies for projects that require them.

## 1. Tenancy and Ownership Patterns
- **User Ownership**: In consumer applications, entities belong directly to a user (`userId`).
- **Organization / Tenant Ownership**: In B2B SaaS, entities belong to an account or workspace (`tenantId` or `organizationId`).
- **Query Scoping**: Enforce tenant boundaries at the repository/query interceptor layer to guarantee queries cannot accidentally return another tenant's data.

## 2. Deletion Strategies
- **Universal Soft Deletion (`deletedAt`)**:
  - When to Use: Historical business facts, user logs, financial records, audit trails, and entities subject to recovery or regulatory retention.
  - Pattern: Add `deletedAt DateTime?` column. Update `deletedAt = new Date()` instead of running SQL `DELETE`. Filter out `WHERE deletedAt IS NULL` in active views.
- **Hard Deletion (`DELETE`)**:
  - When to Use: Transient caches, temporary verification tokens, unverified draft records, or compliance with GDPR "Right to be Forgotten" requests.
- **Archival and Retention**:
  - Move soft-deleted records older than a configured retention period (e.g. 90 days) into cold storage tables or compressed blobs before permanent purging.

## 3. Audit Logging Pattern
- Track entity modifications with an immutable audit table (`EntityAuditLog`):
  - Fields: `entityId`, `entityType`, `action` (`CREATE`, `UPDATE`, `DELETE`), `changedByUserId`, `timestamp`, `beforeSnapshot`, `afterSnapshot`.
