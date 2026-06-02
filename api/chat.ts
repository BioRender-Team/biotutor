import Anthropic from '@anthropic-ai/sdk'

export const config = { runtime: 'edge' }

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

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { messages } = body as Record<string, unknown>
  if (!isValidMessages(messages)) {
    return new Response('Invalid messages payload', { status: 400 })
  }

  const stream = client.messages.stream({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    messages,
  })

  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
        controller.close()
      },
    }),
    {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }
  )
}
