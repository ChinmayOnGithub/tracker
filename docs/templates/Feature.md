# Feature Design Blueprint: [Feature Name]

* **Domain Module**: `modules/[module-name]`
* **Owner**: [Engineer Name]

---

## 1. Purpose & Scope

[What does this feature solve? What are the key customer/user requirements? Specify dependencies on other domain services.]

## 2. Database Schema Design

[If database additions are needed, write the prisma block here. Note that all models must support soft-deletion via `deletedAt` and user scoping via `userId`.]

```prisma
model [ModelName] {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime? // Soft Delete
}
```

## 3. Architecture & Data Flow

[Describe the flow from UI to Database client. Ensure compliance with AI Constitution Law 1.3 (no raw queries in UI components).]

```
[UI Components]
     ↓
[Server Actions / app/actions]
     ↓
[Domain Service class]
     ↓
[Prisma / lib/db]
```

## 4. UI / Visual Layout

[Detail the components structure. Note that all page blocks must utilize `@/design-system/components/*` primitives like `<Card>`, `<Button>`, and `<Input>`. Custom elements are prohibited.]

## 5. Verification Checklist

* [ ] Schema defined with soft-delete support (`deletedAt`).
* [ ] Database operations encapsulated in service layer.
* [ ] TypeScript check compiles cleanly (`tsc --noEmit`).
* [ ] Inter-Sans typography and theme variables conform to tokens.
* [ ] Tests implemented under `tests/` and run successfully.
