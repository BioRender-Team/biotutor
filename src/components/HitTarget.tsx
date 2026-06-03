import { useRef, useEffect } from 'react'
import Tippy from '@tippyjs/react'
import styles from './HitTarget.module.css'

type BoundingBox = { x: number; y: number; width: number; height: number }
type Description = { description: string; source: { title: string; url: string } }
type Particle = { x: number; y: number; r: number; phase: number; speed: number }

function safeUrl(url: string): string | undefined {
  try {
    const p = new URL(url)
    return p.protocol === 'https:' || p.protocol === 'http:' ? url : undefined
  } catch { return undefined }
}

interface HitTargetProps {
  label: string
  bbox: BoundingBox
  index: number
  imgRect: DOMRect
  containerRect: DOMRect
  description?: Description
  audience?: string
  bordered?: boolean
  targetClassName?: string
  children?: React.ReactNode
  onMouseDown?: (e: React.MouseEvent) => void
  tippyDisabled?: boolean
  'data-nodraw'?: boolean
}

export function HitTarget({
  label,
  bbox,
  index,
  imgRect,
  containerRect,
  description,
  audience = '',
  bordered = false,
  targetClassName = '',
  children,
  onMouseDown,
  tippyDisabled,
  ...rest
}: HitTargetProps) {
  const { x, y, width, height } = bbox
  const ox = imgRect.left - containerRect.left
  const oy = imgRect.top - containerRect.top
  const showCitation = /medical/i.test(audience) && description && safeUrl(description.source?.url)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])

  function initParticles(w: number, h: number) {
    particlesRef.current = Array.from({ length: 60 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.5 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.2,
    }))
  }

  function draw(ts: number) {
    const canvas = canvasRef.current
    const mouse = mouseRef.current
    if (!canvas || !mouse) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const sigma = Math.min(canvas.width, canvas.height) * 0.45

    for (const p of particlesRef.current) {
      const dist = Math.hypot(p.x - mouse.x, p.y - mouse.y)
      const gaussian = Math.exp(-(dist * dist) / (2 * sigma * sigma))
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(ts * 0.001 * p.speed + p.phase))
      const alpha = gaussian * twinkle * 0.55
      if (alpha < 0.01) continue
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(140, 155, 170, ${alpha})`
      ctx.fill()
    }

    rafRef.current = requestAnimationFrame(draw)
  }

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  function handleMouseEnter(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    initParticles(rect.width, rect.height)
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    rafRef.current = requestAnimationFrame(draw)
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handleMouseLeave() {
    mouseRef.current = null
    cancelAnimationFrame(rafRef.current)
    const canvas = canvasRef.current
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  }

  const pw = width * imgRect.width
  const ph = height * imgRect.height

  return (
    <Tippy
      content={
        <div className={styles.tooltipContent}>
          <div className={styles.tooltipHeader}>{label}</div>
          {description ? (
            <div className={styles.tooltipBody}>
              {description.description}
              {showCitation && (
                <a className={styles.citationRef} href={safeUrl(description.source.url)} target="_blank" rel="noreferrer">
                  [{index + 1}]
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
      hideOnClick={true}
      disabled={tippyDisabled}
    >
      <div
        {...rest}
        data-nodraw
        className={[
          styles.hitTarget,
          bordered ? styles.hitTargetBordered : styles.hitTargetHoverable,
          targetClassName,
        ].filter(Boolean).join(' ')}
        style={{
          left: ox + x * imgRect.width,
          top: oy + y * imgRect.height,
          width: pw,
          height: ph,
        }}
        onMouseDown={onMouseDown}
        onMouseEnter={bordered ? undefined : handleMouseEnter}
        onMouseMove={bordered ? undefined : handleMouseMove}
        onMouseLeave={bordered ? undefined : handleMouseLeave}
      >
        {!bordered && (
          <canvas
            ref={canvasRef}
            className={styles.particleCanvas}
            width={pw}
            height={ph}
          />
        )}
        {children}
      </div>
    </Tippy>
  )
}
