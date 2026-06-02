import Anthropic from '@anthropic-ai/sdk'
import type { IncomingMessage, ServerResponse } from 'http'

const client = new Anthropic()

const responseSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          bbox: { type: 'array', items: { type: 'number' } },
        },
        required: ['label', 'bbox'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
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

  const { image, prompt } = body as Record<string, unknown>
  if (typeof image !== 'string' || image.length === 0) {
    res.writeHead(400)
    res.end('Missing image')
    return
  }
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    res.writeHead(400)
    res.end('Missing prompt')
    return
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: image },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
    output_config: {
      format: { type: 'json_schema', schema: responseSchema },
    },
  })

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}'
  res.setHeader('Content-Type', 'application/json')
  res.end(text)
}
