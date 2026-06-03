import { useParams } from 'react-router-dom'
import { useState, useRef, useLayoutEffect, useCallback } from 'react'
import Tippy from '@tippyjs/react'
import styles from './IllustrationPage.module.css'

type BoundingBox = { x: number; y: number; width: number; height: number }
type Item = { label: string; bbox: BoundingBox }
type Description = { description: string; source: { title: string; url: string } }

function safeUrl(url: string): string | undefined {
  try {
    const p = new URL(url)
    return p.protocol === 'https:' || p.protocol === 'http:' ? url : undefined
  } catch { return undefined }
}

function formatAudience(slug: string) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function IllustrationPage() {
  const { name } = useParams<{ name: string }>()
  const [audiences, setAudiences] = useState<string[]>([])
  const [audience, setAudience] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [descriptions, setDescriptions] = useState<Record<string, Description>>({})
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgRect, setImgRect] = useState<DOMRect | null>(null)

  const updateRect = useCallback(() => {
    if (imgRef.current) setImgRect(imgRef.current.getBoundingClientRect())
  }, [])

  useLayoutEffect(() => {
    window.addEventListener('resize', updateRect)
    return () => window.removeEventListener('resize', updateRect)
  }, [updateRect])

  // Fetch available audiences on mount
  useLayoutEffect(() => {
    if (!name) return
    setAudiences([])
    setAudience('')
    setItems([])
    setDescriptions({})
    fetch(`/api/load?name=${encodeURIComponent(name)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.audiences?.length) return
        setAudiences(data.audiences)
        setAudience(data.audiences[0])
      })
      .catch(() => {})
  }, [name])

  // Load data when audience is selected
  useLayoutEffect(() => {
    if (!name || !audience) return
    fetch(`/api/load?name=${encodeURIComponent(name)}&audience=${encodeURIComponent(audience)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setItems(data.items ?? [])
        const map: Record<string, Description> = {}
        for (const d of data.descriptions ?? []) map[d.label] = { description: d.description, source: d.source ?? { title: '', url: '' } }
        setDescriptions(map)
        if (imgRef.current) setImgRect(imgRef.current.getBoundingClientRect())
      })
      .catch(() => {})
  }, [name, audience])

  const rect = imgRect

  return (
    <div className={styles.page}>
      {audiences.length > 1 && (
        <div className={styles.audiencePicker}>
          {audiences.map(a => (
            <button
              key={a}
              className={`${styles.audienceBtn} ${audience === a ? styles.audienceBtnActive : ''}`}
              onClick={() => setAudience(a)}
            >
              {formatAudience(a)}
            </button>
          ))}
        </div>
      )}
      <div className={styles.imageContainer}>
        <img
          ref={imgRef}
          src={`/illustrations/${name}.png`}
          alt={name}
          className={styles.image}
          onLoad={updateRect}
        />
        {rect && items.map((item, i) => {
          const { x, y, width, height } = item.bbox
          const freshImg = imgRef.current!.getBoundingClientRect()
          const containerRect = imgRef.current!.parentElement!.getBoundingClientRect()
          const ox = freshImg.left - containerRect.left
          const oy = freshImg.top - containerRect.top
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
                    <div className={styles.tooltipEmpty}>{item.label}</div>
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
            >
              <div
                className={styles.hitTarget}
                style={{
                  left: ox + x * freshImg.width,
                  top: oy + y * freshImg.height,
                  width: width * freshImg.width,
                  height: height * freshImg.height,
                }}
              />
            </Tippy>
          )
        })}
      </div>
    </div>
  )
}
