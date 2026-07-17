import { NextRequest, NextResponse } from 'next/server'
import { getLoggedUser } from '@/app/actions/auth'

export async function GET(req: NextRequest) {
  try {
    const user = await getLoggedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const urlString = searchParams.get('url')
    if (!urlString) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
    }

    let targetUrl: URL
    try {
      targetUrl = new URL(urlString)
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    const response = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      next: { revalidate: 86400 }, // Cache on server for 24h
      signal: AbortSignal.timeout(6000), // Timeout after 6s
    })

    if (!response.ok) {
      // Return basic fallback data instead of crashing
      return NextResponse.json({
        title: targetUrl.hostname,
        description: null,
        favicon: `https://www.google.com/s2/favicons?domain=${targetUrl.hostname}&sz=64`,
        thumbnail: null,
      })
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      // Non-HTML resource, e.g., direct image/video
      return NextResponse.json({
        title: targetUrl.pathname.split('/').pop() || targetUrl.hostname,
        description: `Direct link to ${contentType.split(';')[0]} file.`,
        favicon: `https://www.google.com/s2/favicons?domain=${targetUrl.hostname}&sz=64`,
        thumbnail: contentType.startsWith('image/') ? targetUrl.toString() : null,
      })
    }

    const html = await response.text()

    // Title Extraction
    let title = ''
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)
    const twitterTitle = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:title["']/i)
    const pageTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)

    if (ogTitle) title = ogTitle[1]
    else if (twitterTitle) title = twitterTitle[1]
    else if (pageTitle) title = pageTitle[1]
    else title = targetUrl.hostname

    // Description Extraction
    let description = ''
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
                   html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i)
    const twitterDesc = html.match(/<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:description["']/i)
    const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                     html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)

    if (ogDesc) description = ogDesc[1]
    else if (twitterDesc) description = twitterDesc[1]
    else if (metaDesc) description = metaDesc[1]
    else description = ''

    // Image/Thumbnail Extraction
    let thumbnail = ''
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
    const twitterImage = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i)
    const linkSrc = html.match(/<link[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/i)

    if (ogImage) thumbnail = ogImage[1]
    else if (twitterImage) thumbnail = twitterImage[1]
    else if (linkSrc) thumbnail = linkSrc[1]
    else thumbnail = ''

    // Make relative thumbnail URL absolute
    if (thumbnail && !thumbnail.startsWith('http')) {
      try {
        thumbnail = new URL(thumbnail, targetUrl.origin).toString()
      } catch {
        thumbnail = ''
      }
    }

    // Favicon Extraction
    let favicon = ''
    const fav1 = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)
    const fav2 = html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i)
    
    if (fav1) favicon = fav1[1]
    else if (fav2) favicon = fav2[1]
    
    if (favicon && !favicon.startsWith('http')) {
      try {
        favicon = new URL(favicon, targetUrl.origin).toString()
      } catch {
        favicon = ''
      }
    }

    if (!favicon) {
      favicon = `https://www.google.com/s2/favicons?domain=${targetUrl.hostname}&sz=64`
    }

    // Clean HTML entities from title/description
    const decodeHtml = (str: string) => {
      return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&nbsp;/g, ' ')
    }

    return NextResponse.json({
      title: decodeHtml(title).trim(),
      description: decodeHtml(description).trim() || null,
      favicon,
      thumbnail: thumbnail || null,
    })
  } catch (error) {
    console.error('Metadata API error:', error)
    return NextResponse.json({
      title: 'Link',
      description: null,
      favicon: null,
      thumbnail: null,
    })
  }
}
