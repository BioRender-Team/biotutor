import { useParams } from 'react-router-dom'
import { useState, useRef, useLayoutEffect, useCallback } from 'react'
import { HitTarget } from '../components/HitTarget'
import styles from './IllustrationPage.module.css'

type BoundingBox = { x: number; y: number; width: number; height: number }
type Item = { label: string; bbox: BoundingBox }
type Description = { description: string; source: { title: string; url: string } }

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
          const freshImg = imgRef.current!.getBoundingClientRect()
          const containerRect = imgRef.current!.parentElement!.getBoundingClientRect()
          return (
            <HitTarget
              key={i}
              label={item.label}
              bbox={item.bbox}
              index={i}
              imgRect={freshImg}
              containerRect={containerRect}
              description={descriptions[item.label]}
              audience={audience}
            />
          )
        })}
      </div>
    </div>
  )
}
