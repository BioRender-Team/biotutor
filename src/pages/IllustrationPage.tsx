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

export function IllustrationPage() {
  const { name } = useParams<{ name: string }>()
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

  useLayoutEffect(() => {
    if (!name) return
    fetch(`/api/load?name=${encodeURIComponent(name)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return
        setItems(data.items ?? [])
        const map: Record<string, Description> = {}
        for (const d of data.descriptions ?? []) map[d.label] = { description: d.description, source: d.source ?? { title: '', url: '' } }
        setDescriptions(map)
      })
      .catch(() => {})
  }, [name])

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
        {rect && items.map((item, i) => {
          const { x, y, width, height } = item.bbox
          const containerRect = imgRef.current!.parentElement!.getBoundingClientRect()
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
                      {safeUrl(desc.source?.url) && (
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
                  left: rect.left - containerRect.left + x * rect.width,
                  top: rect.top - containerRect.top + y * rect.height,
                  width: width * rect.width,
                  height: height * rect.height,
                }}
              />
            </Tippy>
          )
        })}
      </div>
    </div>
  )
}
