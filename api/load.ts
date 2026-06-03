import { head, list } from '@vercel/blob'
import type { IncomingMessage, ServerResponse } from 'http'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') { res.writeHead(405); res.end('Method not allowed'); return }

  const url = new URL(req.url ?? '', `http://localhost`)
  const name = url.searchParams.get('name')
  const audience = url.searchParams.get('audience')

  if (typeof name !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(name)) { res.writeHead(400); res.end('Invalid name'); return }

  res.setHeader('Content-Type', 'application/json')

  try {
    if (!audience) {
      // List available audiences for this illustration
      const { blobs } = await list({ prefix: `illustrations/${name}.` })
      const audiences = blobs
        .map(b => b.pathname.replace(`illustrations/${name}.`, '').replace('.data.json', ''))
        .filter(s => s.endsWith('') && !s.includes('.'))  // only direct slugs
      res.end(JSON.stringify({ audiences }))
      return
    }

    const audienceSlug = audience.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const blob = await head(`illustrations/${name}.${audienceSlug}.data.json`)
    const r = await fetch(blob.url, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    })
    if (!r.ok) throw new Error('fetch failed')
    const data = await r.json()
    res.end(JSON.stringify(data))
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}
