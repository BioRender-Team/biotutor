import { useParams } from 'react-router-dom'
import { showToast } from '../components/Toast'
import { useState, useRef, useLayoutEffect, useCallback, useEffect } from 'react'
import Tippy from '@tippyjs/react'
import 'tippy.js/dist/tippy.css'
import 'tippy.js/animations/shift-away.css'
import styles from './EditPage.module.css'

type BoundingBox = { x: number; y: number; width: number; height: number }
type Item = { label: string; bbox: BoundingBox }
type Description = { description: string; source: { title: string; url: string } }
type Mode = 'select' | 'draw'

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const HANDLES: HandleDir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function safeUrl(url: string): string | undefined {
  try {
    const p = new URL(url)
    return p.protocol === 'https:' || p.protocol === 'http:' ? url : undefined
  } catch { return undefined }
}

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

const DEFAULT_DESCRIBE_PROMPT = `You are a science educator tasked with generating clear, accurate, and audience-appropriate descriptions for each object or process identified in a scientific figure. You will be given a list of objects or processes extracted from a figure, and a specified audience level. Your goal is to describe each item in a way that is optimally suited to that audience's vocabulary, prior knowledge, and learning needs.

BEFORE WRITING ANY DESCRIPTIONS YOU MUST COMPLETE THE FOLLOWING TWO PHASES IN ORDER. DO NOT SKIP PHASE 1. DO NOT COMBINE PHASES.

Phase 1 — Source Verification (complete for all objects before writing any descriptions)
For each object in the input list, perform a web search and fetch at least one credible, accessible source. Confirm the URL loads and is directly relevant to the object. Record the confirmed title, organization, and URL for each object. Do not write any description until every object has a verified source recorded.

Phase 2 — Description and Citation (one object at a time, in sequence)
Only after Phase 1 is complete, write the audience-appropriate description for the first object, then place its verified source citation immediately beneath it. Do not begin the next object until the current object's description and citation are both written. Repeat this sequence for every object in the list. The pattern is strictly: name → description → citation → name → description → citation.


Audience Levels and Writing Rules
Apply the following rules strictly based on the specified audience:

Elementary / Middle School
Open with a relatable analogy — never restate the object name as a definition
Follow with one key fact
Close with why it matters to the bigger process
Maximum 3–4 sentences per object
Use everyday vocabulary; define any new term immediately using analogy
Tone: warm, curious, second person where appropriate
One idea per sentence

High School
Open with the core mechanism or function — not a restatement of the name
Follow with a cause-and-effect link
Close with one named example relevant to the concept
Maximum 4–6 sentences per object
Introduce technical terms with brief inline context; assume some prior knowledge
Tone: neutral, methodical, objective
No exhaustive lists — one named example per concept maximum

Patient
Open with what this object or process means for the patient's body or health
Follow with what the patient should expect or understand about it
Close with one clinical action or red flag only where genuinely relevant
Maximum 3–5 sentences per object
Plain language first; clinical term in parentheses immediately after
Tone: empathetic, action-oriented, second person
One reassurance maximum per object; no mechanism detail unless directly tied to a care decision

Medical Student
Open with a precise mechanistic statement
Follow with the key molecular or cellular detail
Close with one to two clinical implications maximum
Maximum 4–6 sentences per object
Full technical nomenclature; no definitions required
Tone: formal, impersonal, objective; hedged where evidence is evolving
Main players only — no exhaustive enumeration; limit inline lists to three to four items maximum

Universal Rules Across All Levels
Never open a description by restating the object name as a definition
The first sentence must deliver the strongest fact, analogy, or mechanism immediately
Cut any sentence that does not add new information
Do not include mechanism detail at the patient level unless it directly explains a care decision or expectation
Do not include exhaustive component lists at the medical student level — select the most mechanistically or clinically significant players only


Output Format
Each object or process must be completed in full before moving to the next. For every object, the output must follow this exact sequence without exception:

[Object or Process Name]
[Description written for the specified audience]
Source: [Title], [Author or Organization], [URL]

Referencing Rules
Every source must be searched for and fetched in Phase 1 before any description is written
Every description must be followed immediately by its own verified source before the next object begins
Credible sources include: peer-reviewed journals, government health agencies (NIH, CDC, WHO), academic medical centers, established medical education platforms (StatPearls, OpenStax), and reputable patient advocacy organizations
Do not cite any source that has not been verified as accessible and directly relevant
Format: Source: [Title], [Author or Organization], [URL]


Input Format
The tool will provide input in the following structure:
Audience: [Elementary / High School / Patient / Medical Student]
Objects identified in figure: [Object 1], [Object 2], [Object 3] …


Example Input and Output
Audience: Elementary
Objects identified in figure: Evaporation, Condensation, Precipitation

Evaporation
Heat from the sun turns liquid water in lakes and oceans into invisible water vapour that floats up into the sky — like steam rising from a hot cup of tea. This is how water begins its journey from the ground all the way up to the clouds. Without evaporation, the water cycle could not get started.
Source: The Water Cycle, United States Geological Survey (USGS), https://www.usgs.gov/special-topics/water-science-school/science/water-cycle

Condensation
As water vapour rises and cools, it turns back into tiny liquid droplets that cling to dust particles in the air — the same thing you see forming on a cold glass on a warm day. These droplets cluster together to begin forming clouds. Condensation is the step that turns invisible vapour back into something we can see.
Source: The Water Cycle, United States Geological Survey (USGS), https://www.usgs.gov/special-topics/water-science-school/science/water-cycle

Precipitation
When water droplets inside a cloud grow too heavy for the air to hold, gravity pulls them back down to Earth as rain, snow, sleet, or hail. This returns water to the land and oceans so the whole cycle can begin again. Precipitation is the step that connects the sky back to the ground.
Source: Precipitation, National Oceanic and Atmospheric Administration (NOAA), https://www.noaa.gov/education/resource-collections/weather-atmosphere/precipitation`

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
  const [descriptions, setDescriptions] = useState<Record<string, Description>>({})
  const [describing, setDescribing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [summary, setSummary] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [mode, setMode] = useState<Mode>('select')
  const [drawing, setDrawing] = useState<BoundingBox | null>(null)
  const [pendingBox, setPendingBox] = useState<BoundingBox | null>(null)
  const [pendingLabel, setPendingLabel] = useState('')
  const dragRef = useRef<{
    type: 'draw' | 'move' | 'resize'
    startX: number; startY: number
    origBbox?: BoundingBox
    itemIndex?: number
    handle?: HandleDir
  } | null>(null)

  // Convert page coords to normalized image coords
  function toNorm(pageX: number, pageY: number) {
    if (!imgRef.current) return { nx: 0, ny: 0 }
    const r = imgRef.current.getBoundingClientRect()
    const cr = imgRef.current.parentElement!.getBoundingClientRect()
    const ox = r.left - cr.left
    const oy = r.top - cr.top
    return {
      nx: Math.max(0, Math.min(1, (pageX - cr.left - ox) / r.width)),
      ny: Math.max(0, Math.min(1, (pageY - cr.top - oy) / r.height)),
    }
  }

  function handleContainerMouseDown(e: React.MouseEvent) {
    if (mode !== 'draw') return
    if ((e.target as HTMLElement).closest('[data-nodraw]')) return
    e.preventDefault()
    const { nx, ny } = toNorm(e.clientX, e.clientY)
    dragRef.current = { type: 'draw', startX: nx, startY: ny }
    setDrawing({ x: nx, y: ny, width: 0, height: 0 })
  }

  function handleItemMouseDown(e: React.MouseEvent, i: number) {
    if (mode !== 'select') return
    e.stopPropagation()
    e.preventDefault()
    const { nx, ny } = toNorm(e.clientX, e.clientY)
    dragRef.current = { type: 'move', startX: nx, startY: ny, itemIndex: i, origBbox: { ...items[i].bbox } }
  }

  function handleHandleMouseDown(e: React.MouseEvent, i: number, handle: HandleDir) {
    if (mode !== 'select') return
    e.stopPropagation()
    e.preventDefault()
    const { nx, ny } = toNorm(e.clientX, e.clientY)
    dragRef.current = { type: 'resize', startX: nx, startY: ny, itemIndex: i, handle, origBbox: { ...items[i].bbox } }
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const d = dragRef.current
      if (!d) return
      const { nx, ny } = toNorm(e.clientX, e.clientY)
      const dx = nx - d.startX
      const dy = ny - d.startY

      if (d.type === 'draw') {
        const x = Math.min(d.startX, nx)
        const y = Math.min(d.startY, ny)
        const w = Math.abs(nx - d.startX)
        const h = Math.abs(ny - d.startY)
        setDrawing({ x, y, width: w, height: h })
      } else if (d.type === 'move' && d.origBbox !== undefined && d.itemIndex !== undefined) {
        const ob = d.origBbox
        const nx2 = Math.max(0, Math.min(1 - ob.width, ob.x + dx))
        const ny2 = Math.max(0, Math.min(1 - ob.height, ob.y + dy))
        setItems(prev => prev.map((it, i) => i === d.itemIndex ? { ...it, bbox: { ...ob, x: nx2, y: ny2 } } : it))
      } else if (d.type === 'resize' && d.origBbox !== undefined && d.itemIndex !== undefined && d.handle) {
        const ob = d.origBbox
        let { x, y, width, height } = ob
        const h = d.handle
        if (h.includes('w')) { x = Math.min(ob.x + ob.width - 0.01, ob.x + dx); width = ob.width - dx }
        if (h.includes('e')) { width = Math.max(0.01, ob.width + dx) }
        if (h.includes('n')) { y = Math.min(ob.y + ob.height - 0.01, ob.y + dy); height = ob.height - dy }
        if (h.includes('s')) { height = Math.max(0.01, ob.height + dy) }
        x = Math.max(0, x); y = Math.max(0, y)
        width = Math.min(1 - x, width); height = Math.min(1 - y, height)
        setItems(prev => prev.map((it, i) => i === d.itemIndex ? { ...it, bbox: { x, y, width, height } } : it))
      }
    }

    function onMouseUp(e: MouseEvent) {
      const d = dragRef.current
      if (!d) return
      dragRef.current = null

      if (d.type === 'draw') {
        const { nx, ny } = toNorm(e.clientX, e.clientY)
        const x = Math.min(d.startX, nx)
        const y = Math.min(d.startY, ny)
        const w = Math.abs(nx - d.startX)
        const h = Math.abs(ny - d.startY)
        setDrawing(null)
        if (w > 0.01 && h > 0.01) {
          setPendingBox({ x, y, width: w, height: h })
          setPendingLabel('')
        }
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [items])

  function confirmPendingLabel() {
    if (!pendingBox) return
    const label = pendingLabel.trim() || `Region ${items.length + 1}`
    setItems(prev => [...prev, { label, bbox: pendingBox! }])
    setPendingBox(null)
    setPendingLabel('')
  }

  const imgRef = useRef<HTMLImageElement>(null)
  const [imgRect, setImgRect] = useState<DOMRect | null>(null)

  const updateRect = useCallback(() => {
    if (imgRef.current) setImgRect(imgRef.current.getBoundingClientRect())
  }, [])

  useLayoutEffect(() => {
    window.addEventListener('resize', updateRect)
    return () => window.removeEventListener('resize', updateRect)
  }, [updateRect])

  useEffect(() => {
    if (imgRef.current?.complete) summarize()
  }, [model]) // eslint-disable-line react-hooks/exhaustive-deps

  const summarize = useCallback(() => {
    if (!name) return
    setSummarizing(true)
    setSummary('')
    fetch(`/illustrations/${name}.png`)
      .then(r => r.blob())
      .then(blob => new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(blob)
      }))
      .then(base64 => fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, model }),
      }))
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(data => setSummary(data.summary ?? ''))
      .catch((e) => showToast(`Summarize error: ${e}`))
      .finally(() => setSummarizing(false))
  }, [name, model])

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
      if (!response.ok) { showToast(`Identify failed (${response.status})`); return }
      const data = await response.json()
      setItems(data.items ?? [])
      updateRect()
    } catch (e) {
      showToast(`Identify error: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  const rect = imgRect

  return (
    <div className={styles.page}>
      <div
        className={`${styles.imageContainer} ${mode === 'draw' ? styles.drawMode : ''}`}
        onMouseDown={handleContainerMouseDown}
      >
        <img
          ref={imgRef}
          src={`/illustrations/${name}.png`}
          alt={name}
          className={styles.image}
          onLoad={() => { updateRect(); summarize() }}
          draggable={false}
        />
        {rect && (() => {
          const freshImg = imgRef.current!.getBoundingClientRect()
          const containerRect = imgRef.current!.parentElement!.getBoundingClientRect()
          const ox = freshImg.left - containerRect.left
          const oy = freshImg.top - containerRect.top
          return <>
            <div
              data-nodraw
              className={styles.imageToolbar}
            >
              <button
                className={`${styles.toolbarBtn} ${mode === 'select' ? styles.toolbarBtnActive : ''}`}
                onClick={() => setMode('select')}
              >↖ Select</button>
              <button
                className={`${styles.toolbarBtn} ${mode === 'draw' ? styles.toolbarBtnActive : ''}`}
                onClick={() => setMode('draw')}
              >⬚ Draw</button>
            </div>

            {items.map((item, i) => {
              const { x, y, width, height } = item.bbox
              const pxLeft = ox + x * freshImg.width
              const pxTop = oy + y * freshImg.height
              const pxW = width * freshImg.width
              const pxH = height * freshImg.height
              const desc = descriptions[item.label]
              return (
                <Tippy
                  key={i}
                  content={
                    <div className={styles.tooltipContent}>
                      <div className={styles.tooltipHeader}>{item.label}</div>
                      {desc ? (
                        <div className={styles.tooltipBody}>
                          {desc.description}
                          {/medical/i.test(audience) && safeUrl(desc.source?.url) && (
                            <a className={styles.citationRef} href={safeUrl(desc.source.url)} target="_blank" rel="noreferrer">
                              [{i + 1}]
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className={styles.tooltipEmpty}>No description yet</div>
                      )}
                    </div>
                  }
                  placement="right"
                  popperOptions={{ modifiers: [{ name: 'flip', options: { fallbackPlacements: ['left', 'bottom', 'top'] } }] }}
                  animation="shift-away"
                  interactive={true}
                  arrow={true}
                  theme="biotutor"
                  trigger="click"
                  disabled={mode === 'draw'}
                  hideOnClick={true}
                >
                  <div
                    data-nodraw
                    className={`${styles.hitTarget} ${mode === 'select' ? styles.selectable : ''}`}
                    style={{ left: pxLeft, top: pxTop, width: pxW, height: pxH }}
                    onMouseDown={(e) => handleItemMouseDown(e, i)}
                  >
                    <span className={styles.bboxLabel}>{item.label}</span>
                    {mode === 'select' && <>
                      {HANDLES.map(h => (
                        <div
                          key={h}
                          data-nodraw
                          className={`${styles.handle} ${styles[`handle-${h}`]}`}
                          onMouseDown={(e) => handleHandleMouseDown(e, i, h)}
                        />
                      ))}
                      <button
                        data-nodraw
                        className={styles.deleteBtn}
                        onClick={(e) => { e.stopPropagation(); setItems(prev => prev.filter((_, j) => j !== i)) }}
                        title="Delete"
                      >×</button>
                    </>}
                  </div>
                </Tippy>
              )
            })}

            {/* Ghost box while drawing */}
            {drawing && (
              <div
                className={styles.ghostBox}
                style={{
                  left: ox + drawing.x * freshImg.width,
                  top: oy + drawing.y * freshImg.height,
                  width: drawing.width * freshImg.width,
                  height: drawing.height * freshImg.height,
                }}
              />
            )}

            {/* Inline label input after draw */}
            {pendingBox && (
              <div
                data-nodraw
                className={styles.labelPrompt}
                style={{
                  left: ox + pendingBox.x * freshImg.width,
                  top: oy + pendingBox.y * freshImg.height - 34,
                }}
              >
                <div className={styles.ghostBox} style={{
                  position: 'absolute',
                  left: 0, top: 34,
                  width: pendingBox.width * freshImg.width,
                  height: pendingBox.height * freshImg.height,
                }} />
                <input
                  className={styles.labelInput}
                  autoFocus
                  placeholder="Label…"
                  value={pendingLabel}
                  onChange={(e) => setPendingLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmPendingLabel()
                    if (e.key === 'Escape') { setPendingBox(null); setPendingLabel('') }
                  }}
                  onBlur={confirmPendingLabel}
                />
              </div>
            )}
          </>
        })()}
      </div>

      <div className={styles.sidebar}>

        {/* Model */}
        <select className={styles.select} value={model} onChange={(e) => setModel(e.target.value)}>
          {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        {/* Figure Summary */}
        <div className={styles.summaryLabel}>
          {summarizing ? 'Summarizing figure…' : 'Figure summary'}
        </div>
        <textarea
          className={styles.promptInput}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          placeholder={summarizing ? 'Generating…' : 'Figure summary will appear here…'}
          disabled={summarizing}
        />

        <div className={styles.divider} />

        {/* Identify */}
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
          {loading ? 'Identifying…' : 'Identify Key Figures'}
        </button>

        {items.length > 0 && (
          <details className={styles.accordion}>
            <summary className={styles.accordionSummary}>
              Key Figures ({items.length})
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

        {/* Describe */}
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
                body: JSON.stringify({ items, audience, prompt: describePrompt, model, summary }),
              })
              if (!r.ok) { showToast(`Describe failed (${r.status})`); return }
              const data = await r.json()
              const map: Record<string, Description> = {}
              for (const d of data.descriptions ?? []) map[d.label] = { description: d.description, source: d.source ?? { title: '', url: '' } }
              setDescriptions(map)
            } catch (e) {
              showToast(`Describe error: ${e}`)
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
                  <span>{desc.description}</span>
                  {safeUrl(desc.source?.url) && (
                    <a className={styles.sourceLink} href={safeUrl(desc.source.url)} target="_blank" rel="noreferrer">
                      {desc.source.title || desc.source.url}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className={styles.spacer} />

        <div className={styles.divider} />

        <button
          className={styles.publishButton}
          disabled={publishing || items.length === 0 || Object.keys(descriptions).length === 0}
          onClick={async () => {
            setPublishing(true)
            try {
              const descList = items.map((item) => {
                const d = descriptions[item.label]
                return { label: item.label, ...(d ?? { description: '', source: { title: '', url: '' } }) }
              })
              const r = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, audience, items, descriptions: descList }),
              })
              if (!r.ok) {
                const body = await r.json().catch(() => ({}))
                showToast(`Publish failed (${r.status})${body.error ? `\n${body.error}` : ''}`)
              }
            } catch (e) {
              showToast(`Publish error: ${e}`)
            } finally {
              setPublishing(false)
            }
          }}
        >
          {publishing ? 'Publishing…' : 'Publish'}
        </button>
      </div>
    </div>
  )
}
