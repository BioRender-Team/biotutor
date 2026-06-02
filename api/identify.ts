import Anthropic from '@anthropic-ai/sdk'

export const config = { runtime: 'edge' }

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

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { image } = body as Record<string, unknown>
  if (typeof image !== 'string' || image.length === 0) {
    return new Response('Missing image', { status: 400 })
  }

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: image },
          },
          {
            type: 'text',
            text: 'Identify the key labeled parts in this scientific illustration. For each part return its label and a tight bounding box as [x1, y1, x2, y2] with values normalized 0–1 (fraction of image width/height, origin top-left).',
          },
        ],
      },
    ],
    output_config: {
      format: { type: 'json_schema', schema: responseSchema },
    },
  })

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}'
  return new Response(text, { headers: { 'Content-Type': 'application/json' } })
}
