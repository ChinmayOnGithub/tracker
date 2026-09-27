---
name: database-design
description: Model relational and document database schemas, design indexes based on query access patterns, manage transactions, and execute safe migrations.
---

# Database Design Skill

Use this workflow when creating or modifying database schemas, writing queries, or generating migrations.

## 1. Schema Modeling Checklist
1. **Relational Constraints**:
   - Define primary keys and explicit foreign key constraints to preserve referential integrity.
   - Use non-nullable columns by default; make nullable only when absence of data has explicit domain meaning.
2. **Index Optimization**:
   - Create indexes on all columns frequently used in `WHERE`, `JOIN`, `ORDER BY`, or uniqueness constraints.
   - Avoid over-indexing columns with low cardinality (e.g. boolean flags) unless part of a compound index.
3. **Migration Safety**:
   - Migrations must be versioned, idempotent, and backward-compatible.
   - Follow the expand-contract pattern: add new nullable columns first, deploy code, backfill data, and remove old columns in a separate release.
   - Never run destructive migrations (`db push --force-reset` or `migrate reset`) on live environments.
4. **Query Performance**:
   - Inspect query plans (`EXPLAIN ANALYZE`) for sequential scans on large tables.
   - Eliminate N+1 query loops using eager joins or batch fetches.
