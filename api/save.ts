import { put } from '@vercel/blob'
import type { IncomingMessage, ServerResponse } from 'http'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') { res.writeHead(405); res.end('Method not allowed'); return }

  const { name, audience, items, descriptions } = JSON.parse(await readBody(req)) as Record<string, any>
  if (typeof name !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(name)) { res.writeHead(400); res.end('Invalid name'); return }

  const audienceSlug = audience ? slugify(String(audience)) : 'default'
  const payload = JSON.stringify({ audience, items, descriptions }, null, 2)

  try {
    const { url } = await put(`illustrations/${name}.${audienceSlug}.data.json`, payload, {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    })
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ url }))
  } catch (err) {
    console.error('Blob put failed:', err)
    res.writeHead(500)
    res.end(JSON.stringify({ error: String(err) }))
  }
}
