import { useParams } from 'react-router-dom'
import { useState, useRef, useLayoutEffect, useCallback } from 'react'
import styles from './EditPage.module.css'

type BoundingBox = { x1: number; x2: number; y1: number; y2: number }
type Item = { label: string; bbox: BoundingBox }

const MODELS = [
  { label: 'Sonnet',  value: 'anthropic/claude-sonnet-4.5' },
  { label: 'Haiku',   value: 'anthropic/claude-haiku-4.5'  },
  { label: 'Gemini 2.0', value: 'google/gemini-2.0-flash' },
  { label: 'Gemini 2.5', value: 'google/gemini-2.5-flash' },
  { label: 'GPT-5.5', value: 'openai/gpt-5.5'              },
]

const AUDIENCES = [
  'Middle school students',
  'High school students',
  'Medical students',
  'Medical patient',
]

const DEFAULT_PROMPT = 'Identify the key labeled parts in this scientific illustration.'

const DEFAULT_DESCRIBE_PROMPT =
  'Please generate a description for each of the objects listed here. ' +
  'You are a science tutor who is explaining these concepts to a group of <audience>. ' +
  'Please output 1-2 sentences per object.'

const EXPECTED_OUTPUT =
  'Expected output: a list of key players. Each item in the list should be JSON with `label` ' +
  'and `bbox`: {x1, x2, y1, y2} with values normalized 0–1 (fraction of image width/height, origin top-left).'

export function EditPage() {
  const { name } = useParams<{ name: string }>()
  const [items, setItems] = useState<Item[]>([])
  const [model, setModel] = useState(MODELS[0].value)
  const [loading, setLoading] = useState(false)
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [describePrompt, setDescribePrompt] = useState(DEFAULT_DESCRIBE_PROMPT)
  const [audience, setAudience] = useState('')
  const [hasTestData, setHasTestData] = useState(false)
  const [hasDescTestData, setHasDescTestData] = useState(false)
  const [descriptions, setDescriptions] = useState<Record<string, string>>({})
  const [describing, setDescribing] = useState(false)

  useLayoutEffect(() => {
    fetch(`/illustrations/${name}.result.json`, { method: 'HEAD' }).then((r) => setHasTestData(r.ok)).catch(() => {})
    fetch(`/illustrations/${name}.descriptions.json`, { method: 'HEAD' }).then((r) => setHasDescTestData(r.ok)).catch(() => {})
  }, [name])
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
        payload = { bioRenderJson, prompt: fullPrompt, model }
      } else {
        // Fall back to image vision
        const imgRes = await fetch(`/illustrations/${name}.png`)
        const blob = await imgRes.blob()
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string).split(',')[1])
          reader.readAsDataURL(blob)
        })
        payload = { image: base64, prompt: fullPrompt, model }
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
        <select className={styles.select} value={model} onChange={(e) => setModel(e.target.value)}>
          {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        <textarea
          className={styles.promptInput}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
        />

        <button
          className={styles.button}
          style={{ width: '100%' }}
          onClick={identify}
          disabled={loading || !prompt.trim()}
        >
          {loading ? 'Identifying…' : 'Identify Key Players'}
        </button>

        {items.length > 0 && (
          <details className={styles.accordion}>
            <summary className={styles.accordionSummary}>
              Key Players ({items.length})
            </summary>
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
          </details>
        )}

        <div className={styles.divider} />

        <textarea
          className={styles.promptInput}
          value={describePrompt}
          onChange={(e) => setDescribePrompt(e.target.value)}
          rows={5}
        />
        <select
          className={styles.select}
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
        >
          <option value="">Audience…</option>
          {AUDIENCES.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <button
          className={styles.button}
          style={{ width: '100%' }}
          onClick={async () => {
            setDescribing(true)
            try {
              const r = await fetch('/api/describe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items, audience, prompt: describePrompt, model }),
              })
              const data = await r.json()
              const map: Record<string, string> = {}
              for (const d of data.descriptions ?? []) map[d.label] = d.description
              setDescriptions(map)
            } finally {
              setDescribing(false)
            }
          }}
          disabled={describing || items.length === 0 || !audience}
        >
          {describing ? 'Generating…' : 'Generate Descriptions'}
        </button>

        {Object.keys(descriptions).length > 0 && (
          <details className={styles.accordion}>
            <summary className={styles.accordionSummary}>
              Descriptions ({Object.keys(descriptions).length})
            </summary>
            <ul className={styles.list}>
              {Object.entries(descriptions).map(([label, desc]) => (
                <li key={label} className={styles.listItem}>
                  <strong>{label}</strong>
                  <span>{desc}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className={styles.spacer} />

        <div className={styles.buttonRow}>
        {(hasTestData || hasDescTestData) && (
          <button
            className={styles.saveButton}
            style={{ flex: 1 }}
            onClick={async () => {
              if (hasTestData) {
                const r = await fetch(`/illustrations/${name}.result.json`)
                const data = await r.json()
                setItems(data.items ?? [])
                updateRect()
              }
              if (hasDescTestData) {
                const r = await fetch(`/illustrations/${name}.descriptions.json`)
                const data = await r.json()
                const map: Record<string, string> = {}
                for (const d of data.descriptions ?? []) map[d.label] = d.description
                setDescriptions(map)
              }
            }}
          >
            Load Test Data
          </button>
        )}
        <button
          className={styles.saveButton}
          style={{ flex: 1 }}
          onClick={() => {
            const content = `# Identify Prompt\n${prompt}\n\n# Describe Prompt\n${describePrompt}`
            const blob = new Blob([content], { type: 'text/plain' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `${name}-prompts.txt`
            a.click()
            URL.revokeObjectURL(a.href)
          }}
        >
          Save Prompts
        </button>
        </div>
      </div>
    </div>
  )
}
