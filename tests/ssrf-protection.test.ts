import { describe, it, expect, mock } from 'bun:test'
import {
  isPrivateIp,
  validateSafePublicUrl,
  fetchSafeUrl,
  readBoundedResponseBody,
  MAX_SAFE_REDIRECTS,
  MAX_METADATA_BYTES,
} from '@/lib/security/ssrf'

describe('SSRF Protection & Safe Outbound Fetcher (#144, #145)', () => {
  describe('isPrivateIp validation', () => {
    it('blocks IPv4 loopback (127.0.0.0/8)', () => {
      expect(isPrivateIp('127.0.0.1')).toBe(true)
      expect(isPrivateIp('127.0.0.2')).toBe(true)
      expect(isPrivateIp('127.255.255.255')).toBe(true)
    })

    it('blocks RFC 1918 private ranges', () => {
      // 10.0.0.0/8
      expect(isPrivateIp('10.0.0.1')).toBe(true)
      expect(isPrivateIp('10.254.1.50')).toBe(true)

      // 172.16.0.0/12
      expect(isPrivateIp('172.16.0.1')).toBe(true)
      expect(isPrivateIp('172.31.255.255')).toBe(true)
      expect(isPrivateIp('172.15.255.255')).toBe(false)
      expect(isPrivateIp('172.32.0.1')).toBe(false)

      // 192.168.0.0/16
      expect(isPrivateIp('192.168.0.1')).toBe(true)
      expect(isPrivateIp('192.168.1.254')).toBe(true)
    })

    it('blocks link-local & cloud metadata endpoints (169.254.169.254)', () => {
      expect(isPrivateIp('169.254.169.254')).toBe(true) // AWS/GCP/Azure IMDS
      expect(isPrivateIp('169.254.0.1')).toBe(true)
    })

    it('blocks Shared Address Space / CGNAT (100.64.0.0/10)', () => {
      expect(isPrivateIp('100.64.0.1')).toBe(true)
      expect(isPrivateIp('100.100.100.200')).toBe(true) // Alibaba metadata
      expect(isPrivateIp('100.127.255.255')).toBe(true)
      expect(isPrivateIp('100.63.255.255')).toBe(false)
      expect(isPrivateIp('100.128.0.1')).toBe(false)
    })

    it('blocks multicast, broadcast, and reserved networks', () => {
      expect(isPrivateIp('0.0.0.0')).toBe(true)
      expect(isPrivateIp('224.0.0.1')).toBe(true)
      expect(isPrivateIp('239.255.255.250')).toBe(true)
      expect(isPrivateIp('240.0.0.1')).toBe(true)
      expect(isPrivateIp('255.255.255.255')).toBe(true)
    })

    it('blocks TEST-NET and documentation networks', () => {
      expect(isPrivateIp('192.0.2.1')).toBe(true)
      expect(isPrivateIp('198.51.100.1')).toBe(true)
      expect(isPrivateIp('203.0.113.1')).toBe(true)
    })

    it('blocks IPv6 loopback, unspecified, and private ULA/Link-local ranges', () => {
      expect(isPrivateIp('::1')).toBe(true)
      expect(isPrivateIp('::')).toBe(true)
      expect(isPrivateIp('fc00::1')).toBe(true)
      expect(isPrivateIp('fd12:3456:789a::1')).toBe(true)
      expect(isPrivateIp('fe80::1')).toBe(true)
      expect(isPrivateIp('fec0::1')).toBe(true)
      expect(isPrivateIp('ff02::1')).toBe(true)
    })

    it('blocks IPv4-mapped and IPv4-compatible IPv6 addresses', () => {
      expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true)
      expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true)
      expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true)
      expect(isPrivateIp('::127.0.0.1')).toBe(true)
    })

    it('permits genuine public IPv4 and IPv6 addresses', () => {
      expect(isPrivateIp('8.8.8.8')).toBe(false) // Google DNS
      expect(isPrivateIp('1.1.1.1')).toBe(false) // Cloudflare DNS
      expect(isPrivateIp('142.250.190.46')).toBe(false)
      expect(isPrivateIp('2607:f8b0:4005:805::200e')).toBe(false)
    })
  })

  describe('validateSafePublicUrl', () => {
    it('rejects non-HTTP protocols', async () => {
      await expect(validateSafePublicUrl(new URL('file:///etc/passwd'))).rejects.toThrow(
        'Only HTTP and HTTPS protocols are allowed'
      )
      await expect(validateSafePublicUrl(new URL('gopher://example.com/1'))).rejects.toThrow(
        'Only HTTP and HTTPS protocols are allowed'
      )
      await expect(validateSafePublicUrl(new URL('ftp://example.com/file'))).rejects.toThrow(
        'Only HTTP and HTTPS protocols are allowed'
      )
    })

    it('rejects URLs with embedded credentials', async () => {
      await expect(
        validateSafePublicUrl(new URL('http://admin:secret@example.com'))
      ).rejects.toThrow('URLs with embedded credentials are not allowed')
    })

    it('rejects localhost and internal hostname aliases', async () => {
      await expect(validateSafePublicUrl(new URL('http://localhost:3000'))).rejects.toThrow(
        'Access to local/private addresses is restricted'
      )
      await expect(validateSafePublicUrl(new URL('http://service.internal'))).rejects.toThrow(
        'Access to local/private addresses is restricted'
      )
      await expect(validateSafePublicUrl(new URL('http://dev.local'))).rejects.toThrow(
        'Access to local/private addresses is restricted'
      )
    })

    it('rejects literal private IP URLs', async () => {
      await expect(validateSafePublicUrl(new URL('http://127.0.0.1:8080/api'))).rejects.toThrow(
        'Access to local/private addresses is restricted'
      )
      await expect(
        validateSafePublicUrl(new URL('http://169.254.169.254/latest/meta-data/'))
      ).rejects.toThrow('Access to local/private')
    })
  })

  describe('fetchSafeUrl & redirect limits', () => {
    it('bounds redirects to MAX_SAFE_REDIRECTS', async () => {
      const globalFetch = globalThis.fetch
      let callCount = 0

      // Mock fetch to simulate an infinite redirect loop
      globalThis.fetch = mock(() => {
        callCount++
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: `https://example.com/redirect-${callCount}` },
          })
        )
      }) as unknown as typeof fetch

      try {
        await expect(fetchSafeUrl(new URL('https://example.com/start'), MAX_SAFE_REDIRECTS)).rejects.toThrow(
          'Too many redirects'
        )
        expect(callCount).toBe(MAX_SAFE_REDIRECTS + 1) // initial + MAX_SAFE_REDIRECTS redirects
      } finally {
        globalThis.fetch = globalFetch
      }
    })
  })

  describe('readBoundedResponseBody (#145)', () => {
    it('truncates body exceeding maximum byte limit (512 KB)', async () => {
      // Create a 1 MB stream of ASCII text
      const chunkSize = 64 * 1024
      const numChunks = 16 // 16 * 64KB = 1MB
      let chunksRead = 0

      const stream = new ReadableStream({
        pull(controller) {
          if (chunksRead < numChunks) {
            controller.enqueue(new Uint8Array(chunkSize).fill(65)) // 'A'
            chunksRead++
          } else {
            controller.close()
          }
        },
      })

      const response = new Response(stream)
      const content = await readBoundedResponseBody(response, MAX_METADATA_BYTES)

      // Content length must not exceed MAX_METADATA_BYTES (512 KB)
      expect(content.length).toBeLessThanOrEqual(MAX_METADATA_BYTES + chunkSize)
      expect(chunksRead).toBeLessThanOrEqual(9) // Stoped reading once limit exceeded
    })

    it('stops reading as soon as closing </head> tag is encountered', async () => {
      let chunksPushed = 0
      const stream = new ReadableStream({
        pull(controller) {
          chunksPushed++
          if (chunksPushed === 1) {
            controller.enqueue(new TextEncoder().encode('<html><head><title>Test Title</title></head>'))
          } else if (chunksPushed === 2) {
            controller.enqueue(new Uint8Array(100 * 1024).fill(66)) // 100KB body
          } else {
            controller.close()
          }
        },
      })

      const response = new Response(stream)
      const content = await readBoundedResponseBody(response)

      expect(content).toContain('<title>Test Title</title>')
      expect(chunksPushed).toBe(1) // Stopped immediately upon seeing </head>
    })
  })
})
