type Vec2 = { x: number; y: number }

interface FigureObject {
  relativeTransform?: { translate?: Vec2; scale?: Vec2 }
  path?: { type: string; size?: Vec2 }
  text?: { textData?: { lines?: Array<{ text?: string; runs?: Array<{ style?: { fontSize?: number } }> }> } }
  image?: { size?: Vec2 }
  name?: string
}

export interface CanvasObject {
  kind: 'icon' | 'label'
  name: string
  bbox: { x1: number; y1: number; x2: number; y2: number }
}

export interface PreprocessedFigure {
  canvas: { width: number; height: number }
  objects: CanvasObject[]
}

export function preprocessBioRenderJson(raw: unknown): PreprocessedFigure {
  const objects = (raw as any).bioData.objects as Record<string, FigureObject>

  // Find the largest RECT — that's the canvas background
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

  // BioRender uses center-origin: translate = center of object, canvas center = (canvasCX, canvasCY)
  const left = canvasCX - canvasW / 2
  const top = canvasCY - canvasH / 2

  function normBbox(cx: number, cy: number, w: number, h: number) {
    return {
      x1: Math.max(0, (cx - w / 2 - left) / canvasW),
      y1: Math.max(0, (cy - h / 2 - top) / canvasH),
      x2: Math.min(1, (cx + w / 2 - left) / canvasW),
      y2: Math.min(1, (cy + h / 2 - top) / canvasH),
    }
  }

  const items: CanvasObject[] = []

  for (const obj of Object.values(objects)) {
    const translate = obj.relativeTransform?.translate
    if (!translate) continue
    const { x, y } = translate

    if (obj.text) {
      const lines = obj.text.textData?.lines ?? []
      const label = lines.map((l) => l.text ?? '').join(' ').trim()
      if (!label) continue
      const fontSize = lines[0]?.runs?.[0]?.style?.fontSize ?? 16
      const estW = label.length * fontSize * 0.55
      const estH = fontSize * 1.5
      items.push({ kind: 'label', name: label, bbox: normBbox(x, y, estW, estH) })
    } else if (obj.image && obj.name) {
      const baseSize = obj.image.size ?? { x: 100, y: 100 }
      const scale = obj.relativeTransform?.scale?.x ?? 1
      items.push({
        kind: 'icon',
        name: obj.name,
        bbox: normBbox(x, y, baseSize.x * scale, baseSize.y * scale),
      })
    }
  }

  return { canvas: { width: canvasW, height: canvasH }, objects: items }
}
