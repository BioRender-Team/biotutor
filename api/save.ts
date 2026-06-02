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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') { res.writeHead(405); res.end('Method not allowed'); return }

  const { name, items, descriptions } = JSON.parse(await readBody(req)) as Record<string, any>
  if (typeof name !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(name)) { res.writeHead(400); res.end('Invalid name'); return }

  const payload = JSON.stringify({ items, descriptions }, null, 2)

  const { url } = await put(`illustrations/${name}.data.json`, payload, {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  })

  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ url }))
}
