import { generateObject, jsonSchema } from 'ai'
import type { IncomingMessage, ServerResponse } from 'http'
import { preprocessBioRenderJson } from './_preprocess'

const schema = jsonSchema<{
  items: Array<{
    label: string
    bbox: { x1: number; x2: number; y1: number; y2: number }
  }>
}>({
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          bbox: {
            type: 'object',
            properties: {
              x1: { type: 'number' },
              x2: { type: 'number' },
              y1: { type: 'number' },
              y2: { type: 'number' },
            },
            required: ['x1', 'x2', 'y1', 'y2'],
            additionalProperties: false,
          },
        },
        required: ['label', 'bbox'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
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

  const { image, bioRenderJson, prompt } = body as Record<string, unknown>

  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    res.writeHead(400)
    res.end('Missing prompt')
    return
  }

  let messages: any[]

  if (typeof bioRenderJson === 'string') {
    // JSON mode: preprocess BioRender JSON and send as structured text
    let parsed: unknown
    try {
      parsed = JSON.parse(bioRenderJson)
    } catch {
      res.writeHead(400)
      res.end('Invalid bioRenderJson')
      return
    }
    const figure = preprocessBioRenderJson(parsed)
    messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `${prompt}\n\n` +
              `The following is a structured representation of the illustration. ` +
              `Each object includes its kind (icon or label), name/text, and a pre-computed bbox ` +
              `with normalized coordinates (0–1, origin top-left). ` +
              `Use these bboxes directly — do not recalculate them.\n\n` +
              JSON.stringify(figure, null, 2),
          },
        ],
      },
    ]
  } else if (typeof image === 'string' && image.length > 0) {
    // Vision mode: analyze image directly
    messages = [
      {
        role: 'user',
        content: [
          { type: 'image', image, mimeType: 'image/png' },
          { type: 'text', text: prompt },
        ],
      },
    ]
  } else {
    res.writeHead(400)
    res.end('Provide either image or bioRenderJson')
    return
  }

  const { object } = await generateObject({
    model: 'anthropic/claude-sonnet-4-5',
    schema,
    messages,
  })

  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(object))
}
