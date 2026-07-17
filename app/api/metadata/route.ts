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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Upgrade-Insecure-Requests': '1',
      },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      console.warn(`Scrape failed for URL: ${targetUrl}. Status: ${response.status}`);
      return NextResponse.json({
        title: targetUrl.hostname,
        description: null,
        favicon: `https://www.google.com/s2/favicons?domain=${targetUrl.hostname}&sz=64`,
        thumbnail: null,
      })
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
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
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([\s\S]*?)["']/i) ||
                    html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*property=["']og:title["']/i)
    const twitterTitle = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([\s\S]*?)["']/i) ||
                         html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']twitter:title["']/i)

    if (titleMatch && titleMatch[1]) title = titleMatch[1]
    else if (ogTitle && ogTitle[1]) title = ogTitle[1]
    else if (twitterTitle && twitterTitle[1]) title = twitterTitle[1]
    else title = targetUrl.hostname

    // Description Extraction
    let description = ''
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i) ||
                   html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*property=["']og:description["']/i)
    const twitterDesc = html.match(/<meta[^>]*name=["']twitter:description["'][^>]*content=["']([\s\S]*?)["']/i) ||
                        html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']twitter:description["']/i)
    const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i)

    if (ogDesc && ogDesc[1]) description = ogDesc[1]
    else if (twitterDesc && twitterDesc[1]) description = twitterDesc[1]
    else if (metaDesc && metaDesc[1]) description = metaDesc[1]

    // Image/Thumbnail Extraction
    let thumbnail = ''
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([\s\S]*?)["']/i) ||
                    html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*property=["']og:image["']/i)
    const twitterImage = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([\s\S]*?)["']/i) ||
                         html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']twitter:image["']/i)

    if (ogImage && ogImage[1]) thumbnail = ogImage[1]
    else if (twitterImage && twitterImage[1]) thumbnail = twitterImage[1]

    if (thumbnail && !thumbnail.startsWith('http')) {
      try {
        thumbnail = new URL(thumbnail, targetUrl.origin).toString()
      } catch {
        thumbnail = ''
      }
    }

    // Favicon Extraction
    let favicon = ''
    const fav1 = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([\s\S]*?)["']/i)
    const fav2 = html.match(/<link[^>]*href=["']([\s\S]*?)["'][^>]*rel=["'](?:shortcut )?icon["']/i)
    
    if (fav1 && fav1[1]) favicon = fav1[1]
    else if (fav2 && fav2[1]) favicon = fav2[1]
    
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

    const decodeHtml = (str: string) => {
      return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&ldquo;/g, '"')
        .replace(/&rdquo;/g, '"')
        .replace(/&lsquo;/g, "'")
        .replace(/&rsquo;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
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
