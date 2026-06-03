import { useParams } from 'react-router-dom'
import { DEFAULT_PROMPT, DEFAULT_DESCRIBE_PROMPT, EXPECTED_OUTPUT } from '../prompts'
import { showToast } from '../components/Toast'
import { useState, useRef, useLayoutEffect, useCallback, useEffect } from 'react'
import { HitTarget } from '../components/HitTarget'
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
  const [editingLabelIndex, setEditingLabelIndex] = useState<number | null>(null)
  const [editedDescriptions, setEditedDescriptions] = useState<Record<string, string>>({})
  const [approvals, setApprovals] = useState<Record<string, boolean>>({})
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
    if (!name) return
    try {
      setEditedDescriptions(JSON.parse(localStorage.getItem(`biotutor_edits_${name}`) ?? '{}'))
      setApprovals(JSON.parse(localStorage.getItem(`biotutor_approvals_${name}`) ?? '{}'))
    } catch {}
  }, [name])

  function saveEdit(label: string, text: string) {
    const updated = { ...editedDescriptions, [label]: text }
    setEditedDescriptions(updated)
    if (name) localStorage.setItem(`biotutor_edits_${name}`, JSON.stringify(updated))
  }

  function approveLabel(label: string) {
    const updated = { ...approvals, [label]: true }
    setApprovals(updated)
    if (name) localStorage.setItem(`biotutor_approvals_${name}`, JSON.stringify(updated))
  }

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

            {items.map((item, i) => (
              <HitTarget
                key={i}
                label={item.label}
                bbox={item.bbox}
                index={i}
                imgRect={freshImg}
                containerRect={containerRect}
                description={descriptions[item.label]}
                audience={audience}
                bordered
                targetClassName={mode === 'select' ? styles.selectable : ''}
                tippyDisabled={mode === 'draw'}
                onMouseDown={(e) => handleItemMouseDown(e, i)}
                editable={!!descriptions[item.label]}
                editedDescription={editedDescriptions[item.label]}
                onDescriptionChange={(text) => saveEdit(item.label, text)}
                approved={!!approvals[item.label]}
                onApprove={() => approveLabel(item.label)}
              >
                {editingLabelIndex === i ? (
                  <input
                    autoFocus
                    className={styles.bboxLabelInput}
                    defaultValue={item.label}
                    onBlur={(e) => {
                      const val = e.target.value.trim()
                      if (val) setItems(prev => prev.map((it, j) => j === i ? { ...it, label: val } : it))
                      setEditingLabelIndex(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') { setEditingLabelIndex(null) }
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className={styles.bboxLabel}
                    onDoubleClick={(e) => { e.stopPropagation(); setEditingLabelIndex(i) }}
                  >{item.label}</span>
                )}
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
              </HitTarget>
            ))}

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
                const editedText = editedDescriptions[item.label]
                return {
                  label: item.label,
                  description: editedText ?? d?.description ?? '',
                  source: d?.source ?? { title: '', url: '' },
                }
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
