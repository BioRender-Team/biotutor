import { head } from '@vercel/blob'
import type { IncomingMessage, ServerResponse } from 'http'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') { res.writeHead(405); res.end('Method not allowed'); return }

  const url = new URL(req.url ?? '', `http://localhost`)
  const name = url.searchParams.get('name')
  if (!name) { res.writeHead(400); res.end('Missing name'); return }

  try {
    const blob = await head(`illustrations/${name}.data.json`)
    const r = await fetch(blob.url)
    if (!r.ok) throw new Error('fetch failed')
    const data = await r.json()
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(data))
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}
