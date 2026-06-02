import Anthropic from '@anthropic-ai/sdk'
import type { IncomingMessage, ServerResponse } from 'http'

const client = new Anthropic()

const MAX_MESSAGES = 20
const MAX_CONTENT_LENGTH = 8000

function isValidMessages(val: unknown): val is Anthropic.MessageParam[] {
  if (!Array.isArray(val) || val.length === 0 || val.length > MAX_MESSAGES) return false
  return val.every(
    (m) =>
      m !== null &&
      typeof m === 'object' &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' &&
      m.content.length > 0 &&
      m.content.length <= MAX_CONTENT_LENGTH,
  )
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.writeHead(405)
    res.end('Method not allowed')
    return
  }

  let body: unknown
  try {
    body = JSON.parse(await readBody(req))
  } catch {
    res.writeHead(400)
    res.end('Invalid JSON')
    return
  }

  const { messages } = body as Record<string, unknown>
  if (!isValidMessages(messages)) {
    res.writeHead(400)
    res.end('Invalid messages payload')
    return
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    messages,
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      res.write(event.delta.text)
    }
  }

  res.end()
}
