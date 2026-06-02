import { useParams } from 'react-router-dom'
import { useState, useRef, useLayoutEffect, useCallback } from 'react'
import Tippy from '@tippyjs/react'
import 'tippy.js/dist/tippy.css'
import 'tippy.js/animations/shift-away.css'
import styles from './EditPage.module.css'

type BoundingBox = { x: number; y: number; width: number; height: number }
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

const DEFAULT_PROMPT = `You are a science figure analyst. Your job is to read a scientific process figure and produce a structured, ordered list of the key steps that make up the story being told — along with precise bounding box coordinates anchoring each step to its location in the image.

You are not writing descriptions yet. Focus entirely on accurate identification, clear naming, and precise spatial anchoring.



USER PROMPT
===========
Analyze this scientific process figure and identify its key steps.

## Step 1 — Understand the story
Read the figure carefully. Identify the process being shown from beginning to end — what starts it, what happens in between, and what the outcome is.

## Step 2 — Identify the ordered steps
List the key steps of the process in chronological order. Each step is a meaningful phase or event — something is transferred, transformed, activated, produced, or destroyed. Steps should be exhaustive enough that a viewer following them in order would understand the full story.

Name each step as a short action phrase (e.g., "Receptor Binding", "Enzyme Cleavage", "Signal Amplification", "Cell Division", "Nutrient Absorption"). Aim for 3–8 steps.

## Step 3 — Write a one-sentence summary for each step
Explain what happens at this step and why it matters to the overall process. One sentence, grounded in what this specific figure is showing.

## Step 4 — Assign a bounding box to each step

Each bounding box defines a clickable region. It should wrap the focal element of that step — the specific illustration, icon, or panel that visually represents the step — not the broad region of the figure where the step happens.

What to include inside a box:
- The primary illustration or icon representing this step's action
- Any label or annotation text directly associated with it
- Closely associated secondary elements (e.g., particles, molecules, or sub-elements that are part of the same visual unit)
- If the step is shown in an inset or callout panel, box the inset panel itself — not the larger background structure it refers to

What to exclude from a box:
- Background structures that are present across multiple steps (e.g., a full organism, an entire cell, a connecting pathway)
- Arrows and connectors leading to the next step — unless the arrow itself is the step
- Empty whitespace beyond a small margin around the element

Sizing principle: prefer tight over wide. Tight boxes are also less likely to conflict with neighboring steps — when in doubt, go closer to the element rather than expanding into surrounding space.

When an element manifest is provided (see below): compute each step's bounds as the union of all manifest elements involved in that step. Take the minimum x, minimum y, maximum (x+w), and maximum (y+h) across all involved elements, then add a small uniform margin (~0.02) on each side. Clamp all values to [0, 1].

When no manifest is provided: estimate bounds visually using the principles above.

Coordinate rules:
- All values must be in [0, 1]. Origin is top-left; x increases rightward, y increases downward.
- x, y is the top-left corner; width and height are the box dimensions.

## Step 5 — Verify and fix all overlaps before outputting

Bounding boxes must not overlap. Overlapping boxes create ambiguous click targets and break the user experience.

For every pair of steps (A, B), check whether their boxes intersect. Two boxes intersect if ALL four of these are true simultaneously:
  A.x < B.x + B.width
  B.x < A.x + A.width
  A.y < B.y + B.height
  B.y < A.y + A.height

If any pair intersects:
1. Identify which step's box is too large or misplaced.
2. Shrink the offending edge(s) until the boxes no longer touch. Do not grow the other box.
3. Re-check all pairs after each adjustment.

Aim for a small visible gap between adjacent boxes — boxes that merely touch (share an edge) are acceptable only if no gap is geometrically possible. Boxes that overlap are never acceptable.`

const DEFAULT_DESCRIBE_PROMPT =
  'Please generate a description for each of the objects listed here. ' +
  'You are a science tutor who is explaining these concepts to a group of <audience>. ' +
  'Please output 1-2 sentences per object.'

const EXPECTED_OUTPUT =
  'Expected output: a list of key players. Each item in the list should be JSON with `label` ' +
  'and `bbox`: {x, y, width, height} where x and y are the top-left corner, all values normalized 0–1 (fraction of image width/height, origin top-left).'

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

      const [jsonRes, imgRes] = await Promise.all([
        fetch(`/illustrations/${name}.json`),
        fetch(`/illustrations/${name}.png`),
      ])
      const blob = await imgRes.blob()
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(blob)
      })

      let payload: Record<string, string>
      if (jsonRes.ok) {
        const bioRenderJson = await jsonRes.text()
        payload = { bioRenderJson, image: base64, prompt: fullPrompt, model }
      } else {
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
            const { x, y, width, height } = item.bbox
            const containerRect = imgRef.current!.parentElement!.getBoundingClientRect()
            const desc = descriptions[item.label]
            return (
              <Tippy
                key={i}
                content={
                  <div className={styles.tooltipContent}>
                    <div className={styles.tooltipHeader}>{item.label}</div>
                    {desc && <div className={styles.tooltipBody}>{desc}</div>}
                    {!desc && <div className={styles.tooltipEmpty}>No description yet</div>}
                  </div>
                }
                placement="right"
                popperOptions={{ modifiers: [{ name: 'flip', options: { fallbackPlacements: ['left', 'bottom', 'top'] } }] }}
                animation="shift-away"
                interactive={false}
                arrow={true}
                theme="biotutor"
                trigger="click"
                hideOnClick={true}
              >
                <div
                  className={styles.hitTarget}
                  style={{
                    left: rect.left - containerRect.left + x * rect.width,
                    top: rect.top - containerRect.top + y * rect.height,
                    width: width * rect.width,
                    height: height * rect.height,
                  }}
                >
                  <span className={styles.bboxLabel}>{item.label}</span>
                </div>
              </Tippy>
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
                    x:{item.bbox.x.toFixed(2)} y:{item.bbox.y.toFixed(2)}{' '}
                    w:{item.bbox.width.toFixed(2)} h:{item.bbox.height.toFixed(2)}
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
