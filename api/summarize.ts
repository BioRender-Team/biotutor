import { generateObject, jsonSchema } from 'ai'
import type { IncomingMessage, ServerResponse } from 'http'

const schema = jsonSchema<{ summary: string }>({
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary'],
  additionalProperties: false,
})

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

const SYSTEM_PROMPT =
  'You are a science teacher. You want to explain this figure in more detail for your students. ' +
  'But before we begin, you need to summarize the context of this figure. Use 3 sentences maximum.'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') { res.writeHead(405); res.end('Method not allowed'); return }

  const { image, model } = JSON.parse(await readBody(req)) as Record<string, any>
  if (!image) { res.writeHead(400); res.end('Missing image'); return }

  const resolvedModel = typeof model === 'string' ? model : 'anthropic/claude-sonnet-4.5'

  const { object } = await generateObject({
    model: resolvedModel,
    schema,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [{ type: 'image' as const, image }] }],
  })

  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(object))
}
