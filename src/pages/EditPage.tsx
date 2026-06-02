import { useParams } from 'react-router-dom'
import { useState, useRef, useLayoutEffect, useCallback } from 'react'
import styles from './EditPage.module.css'

type BoundingBox = { x1: number; x2: number; y1: number; y2: number }
type Item = { label: string; bbox: BoundingBox }

const AUDIENCES = [
  'Middle school students',
  'High school students',
  'Medical students',
  'Medical patient',
]

const DEFAULT_PROMPT = 'Identify the key labeled parts in this scientific illustration.'

const EXPECTED_OUTPUT =
  'Expected output: a list of key players. Each item in the list should be JSON with `label` ' +
  'and `bbox`: {x1, x2, y1, y2} with values normalized 0–1 (fraction of image width/height, origin top-left).'

export function EditPage() {
  const { name } = useParams<{ name: string }>()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [audience, setAudience] = useState('')
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgRect, setImgRect] = useState<DOMRect | null>(null)

  const updateRect = useCallback(() => {
    if (imgRef.current) setImgRect(imgRef.current.getBoundingClientRect())
  }, [])

  useLayoutEffect(() => {
    window.addEventListener('resize', updateRect)
    return () => window.removeEventListener('resize', updateRect)
  }, [updateRect])

  async function identify() {
    if (!name) return
    setLoading(true)
    try {
      const fullPrompt = [prompt, EXPECTED_OUTPUT].join('\n\n')

      // Try loading BioRender JSON first
      const jsonRes = await fetch(`/illustrations/${name}.json`)
      let payload: Record<string, string>

      if (jsonRes.ok) {
        const bioRenderJson = await jsonRes.text()
        payload = { bioRenderJson, prompt: fullPrompt }
      } else {
        // Fall back to image vision
        const imgRes = await fetch(`/illustrations/${name}.png`)
        const blob = await imgRes.blob()
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string).split(',')[1])
          reader.readAsDataURL(blob)
        })
        payload = { image: base64, prompt: fullPrompt }
      }

      const response = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      setItems(data.items ?? [])
      updateRect()
    } finally {
      setLoading(false)
    }
  }

  const rect = imgRect

  return (
    <div className={styles.page}>
      <div className={styles.imageContainer}>
        <img
          ref={imgRef}
          src={`/illustrations/${name}.png`}
          alt={name}
          className={styles.image}
          onLoad={updateRect}
        />
        {rect &&
          items.map((item, i) => {
            const { x1, y1, x2, y2 } = item.bbox
            const containerRect = imgRef.current!.parentElement!.getBoundingClientRect()
            return (
              <div
                key={i}
                className={styles.bbox}
                style={{
                  left: rect.left - containerRect.left + x1 * rect.width,
                  top: rect.top - containerRect.top + y1 * rect.height,
                  width: (x2 - x1) * rect.width,
                  height: (y2 - y1) * rect.height,
                }}
              >
                <span className={styles.bboxLabel}>{item.label}</span>
              </div>
            )
          })}
      </div>

      <div className={styles.sidebar}>
        <select
          className={styles.select}
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
        >
          <option value="">Select an audience</option>
          {AUDIENCES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <textarea
          className={styles.promptInput}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
        />

        <button
          className={styles.button}
          onClick={identify}
          disabled={loading || !prompt.trim()}
        >
          {loading ? 'Identifying…' : 'Identify Key Players'}
        </button>

        {items.length > 0 && (
          <ul className={styles.list}>
            {items.map((item, i) => (
              <li key={i} className={styles.listItem}>
                <strong>{item.label}</strong>
                <span className={styles.coords}>
                  x1:{item.bbox.x1.toFixed(2)} x2:{item.bbox.x2.toFixed(2)}{' '}
                  y1:{item.bbox.y1.toFixed(2)} y2:{item.bbox.y2.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
