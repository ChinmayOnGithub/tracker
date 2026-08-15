/**
 * Client-safe Vault constants.
 *
 * vault-crypto.ts imports Node's `crypto` module and is server-only.
 * This file re-exports only the constants that UI components need,
 * without pulling in any server-only code.
 */

/** Maximum file size enforced by the Vault upload API (50 MB). */
export const VAULT_MAX_FILE_SIZE_CLIENT = 50 * 1024 * 1024
