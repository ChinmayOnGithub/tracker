import dns from 'dns/promises'
import net from 'net'

/**
 * SSRF Protection Engine & Safe Outbound Fetcher (#144, #145)
 *
 * Enforces strict RFC destination checks:
 * - Rejects non-HTTP(S) schemes (file, gopher, ftp, data, etc.)
 * - Rejects credentials in URLs (http://user:pass@host)
 * - Rejects loopback (127.0.0.0/8, ::1)
 * - Rejects private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7)
 * - Rejects link-local & cloud metadata (169.254.0.0/16, fe80::/10, 100.64.0.0/10)
 * - Rejects IPv4-mapped / IPv4-compatible IPv6 addresses (::ffff:127.0.0.1, etc.)
 * - Rejects multicast & reserved ranges (224.0.0.0/4, 240.0.0.0/4, ff00::/8)
 * - Resolves all DNS A/AAAA records and inspects every resolved IP before connecting
 * - Re-validates every redirect target (bounded to maxRedirects = 3)
 * - Implements streaming body limit (max 512 KB) to prevent resource exhaustion / DoS
 * - Bounded request timeout (8s)
 */

export const MAX_SAFE_REDIRECTS = 3
export const MAX_METADATA_BYTES = 512 * 1024 // 512 KB

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number)
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true
    }
    const [b0, b1, b2] = parts

    // 0.0.0.0/8 — Current network ("this host")
    if (b0 === 0) return true

    // 10.0.0.0/8 — Private-Use (RFC 1918)
    if (b0 === 10) return true

    // 100.64.0.0/10 — Shared Address Space / CGNAT / Cloud Metadata
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true

    // 127.0.0.0/8 — Loopback
    if (b0 === 127) return true

    // 169.254.0.0/16 — Link-Local & Cloud Metadata (AWS, GCP, Azure, Oracle 169.254.169.254)
    if (b0 === 169 && b1 === 254) return true

    // 172.16.0.0/12 — Private-Use (RFC 1918)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true

    // 192.0.0.0/24 — IETF Protocol Assignments
    if (b0 === 192 && b1 === 0 && b2 === 0) return true

    // 192.0.2.0/24 — TEST-NET-1
    if (b0 === 192 && b1 === 0 && b2 === 2) return true

    // 192.88.99.0/24 — 6to4 Relay Anycast
    if (b0 === 192 && b1 === 88 && b2 === 99) return true

    // 192.168.0.0/16 — Private-Use (RFC 1918)
    if (b0 === 192 && b1 === 168) return true

    // 198.18.0.0/15 — Network Benchmark Tests
    if (b0 === 198 && (b1 === 18 || b1 === 19)) return true

    // 198.51.100.0/24 — TEST-NET-2
    if (b0 === 198 && b1 === 51 && b2 === 100) return true

    // 203.0.113.0/24 — TEST-NET-3
    if (b0 === 203 && b1 === 0 && b2 === 113) return true

    // 224.0.0.0/4 — Multicast
    if (b0 >= 224 && b0 <= 239) return true

    // 240.0.0.0/4 — Reserved for Future Use / Broadcast (255.255.255.255)
    if (b0 >= 240) return true

    return false
  } else if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase().trim()

    // Loopback & Unspecified
    if (normalized === '::1' || normalized === '::') return true

    // Unique Local Addresses (fc00::/7)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true

    // Link-Local Addresses (fe80::/10)
    if (
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true
    }

    // Site-Local Addresses (fec0::/10 - deprecated RFC 3879)
    if (
      normalized.startsWith('fec') ||
      normalized.startsWith('fed') ||
      normalized.startsWith('fee') ||
      normalized.startsWith('fef')
    ) {
      return true
    }

    // Multicast (ff00::/8)
    if (normalized.startsWith('ff')) return true

    // IPv4-mapped / IPv4-compatible IPv6 (::ffff:127.0.0.1, ::ffff:7f00:1)
    if (normalized.includes('::ffff:')) {
      const ipv4Part = normalized.split('::ffff:')[1]
      if (ipv4Part && net.isIPv4(ipv4Part)) {
        return isPrivateIp(ipv4Part)
      }
      return true
    }

    // IPv4-compatible (::127.0.0.1)
    if (normalized.startsWith('::') && normalized.includes('.')) {
      const ipv4Part = normalized.slice(2)
      if (net.isIPv4(ipv4Part)) {
        return isPrivateIp(ipv4Part)
      }
      return true
    }

    // Documentation (2001:db8::/32)
    if (normalized.startsWith('2001:db8:') || normalized.startsWith('2001:0db8:')) return true

    // Discard prefix (100::/64)
    if (normalized.startsWith('100::')) return true

    return false
  }

  // Non-IP or invalid string: treat as restricted
  return true
}

/**
 * Validates a target URL before connection.
 * Checks protocol, credentials, special hostname labels, and resolves DNS to inspect destination IPs.
 */
export async function validateSafePublicUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS protocols are allowed')
  }

  // Disallow userinfo in URL (prevent credential confusion attacks)
  if (url.username || url.password) {
    throw new Error('URLs with embedded credentials are not allowed')
  }

  const hostname = url.hostname.toLowerCase().trim()

  // Prohibit known local and internal domains
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.home.arpa')
  ) {
    throw new Error('Access to local/private addresses is restricted')
  }

  // Directly check literal IP addresses
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error('Access to local/private IP addresses is restricted')
    }
    return
  }

  // Resolve DNS and verify ALL resolved addresses are public
  try {
    const addresses = await dns.lookup(hostname, { all: true })
    if (!addresses || addresses.length === 0) {
      throw new Error('Could not resolve destination hostname')
    }
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        throw new Error('Destination host resolves to a private or restricted address')
      }
    }
  } catch (dnsErr) {
    if (dnsErr instanceof Error && dnsErr.message.includes('restricted')) {
      throw dnsErr
    }
    throw new Error('Failed to verify destination address')
  }
}

/**
 * Safely fetches a public URL:
 * - Enforces SSRF destination validation
 * - Follows redirects manually up to maxRedirects (default 3), re-verifying every hop
 * - Rejects any redirect into a private/restricted address
 * - Enforces timeout (default 8s)
 */
export async function fetchSafeUrl(
  initialUrl: URL,
  maxRedirects = MAX_SAFE_REDIRECTS,
  timeoutMs = 8000
): Promise<Response> {
  let currentUrl = initialUrl
  let redirectsCount = 0

  while (redirectsCount <= maxRedirects) {
    await validateSafePublicUrl(currentUrl)

    const response = await fetch(currentUrl.toString(), {
      redirect: 'manual',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      redirectsCount++
      const location = response.headers.get('location')
      if (!location) {
        throw new Error('Redirect missing location header')
      }
      currentUrl = new URL(location, currentUrl)
      continue
    }

    return response
  }

  throw new Error('Too many redirects')
}

/**
 * Safely reads response body up to maxBytes (default 512 KB) or until closing </head> tag is found.
 * Protects against decompression bombs, infinite streams, and memory exhaustion (#145).
 */
export async function readBoundedResponseBody(
  response: Response,
  maxBytes = MAX_METADATA_BYTES
): Promise<string> {
  if (!response.body) {
    return response.text()
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let bytesReceived = 0
  let html = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        bytesReceived += value.byteLength
        html += decoder.decode(value, { stream: true })
        if (bytesReceived >= maxBytes || html.toLowerCase().includes('</head>')) {
          await reader.cancel()
          break
        }
      }
    }
  } catch {
    // Stream read ended or cancelled
  }

  return html
}
