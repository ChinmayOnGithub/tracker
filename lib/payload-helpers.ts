export function arePayloadsEquivalent(a: unknown, b: unknown): boolean {
  if (a === b) return true

  const isAEmpty =
    a === undefined ||
    a === null ||
    (typeof a === 'object' && !Array.isArray(a) && Object.keys(a as object).length === 0)
  const isBEmpty =
    b === undefined ||
    b === null ||
    (typeof b === 'object' && !Array.isArray(b) && Object.keys(b as object).length === 0)

  if (isAEmpty && isBEmpty) return true
  if (isAEmpty !== isBEmpty) return false

  return deepEqual(a, b)
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true

  if (typeof a !== typeof b) return false
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b
  }

  if (typeof a !== 'object') {
    if (typeof a === 'number' && typeof b === 'number') {
      return Number.isNaN(a) && Number.isNaN(b)
    }
    return a === b
  }

  const aIsArray = Array.isArray(a)
  const bIsArray = Array.isArray(b)

  if (aIsArray !== bIsArray) return false

  if (aIsArray && bIsArray) {
    const arrA = a as unknown[]
    const arrB = b as unknown[]
    if (arrA.length !== arrB.length) return false
    for (let i = 0; i < arrA.length; i++) {
      if (!deepEqual(arrA[i], arrB[i])) return false
    }
    return true
  }

  // Both are non-null plain objects
  const objA = a as Record<string, unknown>
  const objB = b as Record<string, unknown>

  const keysA = Object.keys(objA).filter((k) => objA[k] !== undefined).sort()
  const keysB = Object.keys(objB).filter((k) => objB[k] !== undefined).sort()

  if (keysA.length !== keysB.length) return false

  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false
  }

  for (const key of keysA) {
    if (!deepEqual(objA[key], objB[key])) return false
  }

  return true
}
