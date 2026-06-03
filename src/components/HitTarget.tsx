import Tippy from '@tippyjs/react'
import styles from './HitTarget.module.css'

type BoundingBox = { x: number; y: number; width: number; height: number }
type Description = { description: string; source: { title: string; url: string } }

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
  /** Extra class(es) for the hit target div, e.g. for move/select mode styling */
  targetClassName?: string
  /** Extra children inside the hit target div, e.g. resize handles */
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
        className={`${styles.hitTarget} ${targetClassName}`}
        style={{
          left: ox + x * imgRect.width,
          top: oy + y * imgRect.height,
          width: width * imgRect.width,
          height: height * imgRect.height,
        }}
        onMouseDown={onMouseDown}
      >
        {children}
      </div>
    </Tippy>
  )
}
