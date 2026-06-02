import { generateObject, jsonSchema } from 'ai'
import type { IncomingMessage, ServerResponse } from 'http'

const schema = jsonSchema<{
  descriptions: Array<{
    label: string
    description: string
    source: { title: string; url: string }
  }>
}>({
  type: 'object',
  properties: {
    descriptions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          description: { type: 'string' },
          source: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
            },
            required: ['title', 'url'],
            additionalProperties: false,
          },
        },
        required: ['label', 'description', 'source'],
        additionalProperties: false,
      },
    },
  },
  required: ['descriptions'],
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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') { res.writeHead(405); res.end('Method not allowed'); return }

  const { items, audience, prompt, model } = JSON.parse(await readBody(req)) as Record<string, any>
  const resolvedModel = typeof model === 'string' ? model : 'anthropic/claude-sonnet-4.5'

  const objectList = items.map((it: any) => it.label).join(', ')
  const userMessage = `Audience: ${audience || 'High School'}\nObjects identified in figure: ${objectList}`

  const { object } = await generateObject({
    model: resolvedModel,
    schema,
    system: prompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(object))
}
