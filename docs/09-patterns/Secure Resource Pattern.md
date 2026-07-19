# Secure Resource Pattern

**Pattern type**: Data  
**Capabilities used**: `ENCRYPTABLE`, `SEARCHABLE`, `AUDITABLE`  
**Used by**: Secure Vault, future: Password Manager, Certificates, Secrets

> **Prerequisite reading**: [SPEC.md §1.9 Capability](../../SPEC.md#19-capability), [Philosophy.md §3 Pillar A](../01-foundation/Philosophy.md#pillar-a--local-ownership--privacy-first)

---

## Intent

Allow sensitive files or credentials to be stored in Tracker with strong encryption at rest, while remaining searchable by metadata (not content), downloadable on demand, and fully audited.

---

## Problem

Users need to store sensitive documents (insurance cards, passports, certificates) inside Tracker alongside their timeline data. These cannot be stored in plaintext — not in the database, not on disk. At the same time, the user needs to browse, find, and download them instantly.

---

## Solution

Files are encrypted client-side before upload using **AES-256-GCM** (`lib/vault-crypto.ts`). Only the encrypted bytes are stored on disk (`uploads/`). The database stores only unencrypted metadata (filename, MIME type, size, tags). Decryption happens on download — the plaintext never touches the server's memory in persisted form.

```
User selects file
       ↓
Client encrypts with AES-256-GCM (lib/vault-crypto.ts)
       ↓
Encrypted bytes → POST /api/vault/upload → Stored on disk (uploads/<id>)
Metadata (name, size, mime, tags) → VaultFile row in DB (plaintext)
       ↓
User requests download
       ↓
GET /api/vault/download/<id> → Read encrypted bytes from disk
       ↓
Client decrypts → User receives plaintext file
```

---

## Schema

```prisma
model VaultFile {
  id          String    @id @default(uuid())
  userId      String
  name        String               // Original filename — stored plaintext for search
  mimeType    String
  sizeBytes   Int
  storagePath String               // Relative path inside uploads/ — encrypted file location
  tags        String?              // JSON array of string tags
  folderId    String?              // Optional folder grouping
  lastUsedAt  DateTime?            // Updated on every download — for "recent files" widget
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  user        User      @relation(...)
}
```

---

## Upload Implementation

```typescript
// app/api/vault/upload/route.ts
export async function POST(req: Request) {
  const user = await getAuthSession()
  const formData = await req.formData()
  const file = formData.get('file') as File
  const encryptedBuffer = Buffer.from(await file.arrayBuffer())

  const id = crypto.randomUUID()
  const storagePath = `uploads/${user.id}/${id}`
  await fs.writeFile(storagePath, encryptedBuffer)

  const vaultFile = await db.vaultFile.create({
    data: {
      userId: user.id,
      name: file.name,          // ← plaintext name for search
      mimeType: file.type,
      sizeBytes: encryptedBuffer.length,
      storagePath,
      lastUsedAt: new Date(),
    }
  })

  return Response.json({ success: true, id: vaultFile.id })
}
```

---

## Recent Files (Dashboard Widget)

The Secure Vault widget on the Dashboard shows the most recently accessed files. This requires a recursive directory scan to include files in subdirectories — handled by `app/lib/vault-utils.ts`:

```typescript
export async function getRecentVaultFiles(userId: string, limit = 5) {
  return db.vaultFile.findMany({
    where: { userId, deletedAt: null },
    orderBy: { lastUsedAt: 'desc' },
    take: limit,
  })
}
```

> **Note**: `lastUsedAt` must be updated on every download — not just on creation. This is how the widget stays accurate.

---

## Search Rules

- Vault files are searchable by `name`, `tags`, and `mimeType` only.
- File **content** is never indexed. Encrypted bytes cannot be searched.
- If full-text content search is needed in the future, consider client-side decryption + local indexing (e.g. MiniSearch).

---

## Rules

1. Plaintext file content must never be stored in the database or logged.
2. `storagePath` in the database references encrypted bytes on disk — it is meaningless without the decryption key.
3. The encryption key is derived from user credentials and never stored on the server.
4. On soft-delete, the database row gets `deletedAt` set. The file on disk is **not** immediately deleted (allow for restore). A cleanup job may remove unreferenced files on a schedule.
5. The `lastUsedAt` column must be updated on every successful download.

---

## See Also

- [SPEC.md §1.9 Capability — ENCRYPTABLE](../../SPEC.md#19-capability)
- [Philosophy.md §3 Pillar A — Local Ownership](../01-foundation/Philosophy.md#pillar-a--local-ownership--privacy-first)
- [`lib/vault-crypto.ts`](../../lib/vault-crypto.ts)
- [`app/lib/vault-utils.ts`](../../app/lib/vault-utils.ts)
- [Audit Pattern.md](./Audit%20Pattern.md)
