# ADR 0003: Secure Document Vault Security Architecture

## Context & Problem Statement
Users store highly sensitive personal identification documents (e.g. Passport, PAN card). These files must be protected against malicious access, data breaches, and indirect leaks.

## Decision
Enforce zero public file exposure and payload encryption:
* Files are encrypted on-the-fly using `AES-256-CBC` (or GCM) before writing to the storage provider.
* The initialization vector (`iv`) is stored as a column in the database record.
* Sensitive metadata (such as document titles) is encrypted in-database.
* Download actions are streamed through a secured endpoint `/api/documents/download/[id]` verifying session ownership before in-memory decryption.

## Consequences
* **Positives**: Complete security at rest and in transit. Leak of files folder or DB rows does not expose document names or contents.
* **Negatives**: High CPU usage during stream decryption and no public file links for convenience.
