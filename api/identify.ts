import { generateObject, jsonSchema } from 'ai'
import type { IncomingMessage, ServerResponse } from 'http'

function preprocessBioRenderJson(raw: unknown) {
  const objects = (raw as any).bioData.objects as Record<string, any>

  // Find canvas: largest RECT gives us the coordinate space root
  let canvasW = 0, canvasH = 0, canvasCX = 0, canvasCY = 0
  for (const obj of Object.values(objects)) {
    const size = obj.path?.size
    if (obj.path?.type === 'RECT' && size && size.x > canvasW) {
      canvasW = size.x
      canvasH = size.y
      canvasCX = obj.relativeTransform?.translate?.x ?? 0
      canvasCY = obj.relativeTransform?.translate?.y ?? 0
    }
  }

  const left = canvasCX - canvasW / 2
  const top  = canvasCY - canvasH / 2

  // Walk up the parent chain accumulating transforms to get absolute center + total scale.
  // BioRender uses center-origin: each object's translate is its center in parent space.
  // Composition: abs = parent.translate + localPos * parent.scale (per axis)
  function resolve(id: string): { ax: number; ay: number; totalScale: number } {
    let ax = 0, ay = 0, totalScale = 1
    let curId: string | undefined = id
    let first = true
    while (curId && objects[curId]) {
      const obj = objects[curId]
      const tx = obj.relativeTransform?.translate?.x ?? 0
      const ty = obj.relativeTransform?.translate?.y ?? 0
      const sx = obj.relativeTransform?.scale?.x ?? 1
      if (first) {
        ax = tx; ay = ty; totalScale = sx; first = false
      } else {
        ax = tx + ax * sx
        ay = ty + ay * sx
        totalScale *= sx
      }
      curId = obj.parent?.parentId
    }
    return { ax, ay, totalScale }
  }

  function normBbox(cx: number, cy: number, w: number, h: number) {
    return {
      x1: Math.max(0, (cx - w / 2 - left) / canvasW),
      y1: Math.max(0, (cy - h / 2 - top)  / canvasH),
      x2: Math.min(1, (cx + w / 2 - left) / canvasW),
      y2: Math.min(1, (cy + h / 2 - top)  / canvasH),
    }
  }

  const items: { kind: string; name: string; bbox: object }[] = []

  for (const [id, obj] of Object.entries(objects)) {
    if (obj.text) {
      const lines = obj.text.textData?.lines ?? []
      const label = lines.map((l: any) => l.text ?? '').join(' ').trim()
      if (!label) continue
      const fontSize = lines[0]?.runs?.[0]?.style?.fontSize ?? 16
      const { ax, ay, totalScale } = resolve(id)
      const w = label.length * fontSize * totalScale * 0.55
      const h = fontSize * totalScale * 1.5
      items.push({ kind: 'label', name: label, bbox: normBbox(ax, ay, w, h) })
    } else if (obj.image && obj.name) {
      const baseSize = obj.image.size ?? { x: 100, y: 100 }
      const { ax, ay, totalScale } = resolve(id)
      items.push({ kind: 'icon', name: obj.name, bbox: normBbox(ax, ay, baseSize.x * totalScale, baseSize.y * totalScale) })
    }
  }

  return { canvas: { width: canvasW, height: canvasH }, objects: items }
}

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

  const { image, bioRenderJson, prompt, model } = body as Record<string, unknown>
  const resolvedModel = typeof model === 'string' ? model : 'anthropic/claude-sonnet-4.5'

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
    model: resolvedModel,
    schema,
    messages,
  })

  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(object))
}
