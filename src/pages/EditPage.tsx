import { useParams } from 'react-router-dom'
import { useState, useRef, useLayoutEffect, useCallback } from 'react'
import styles from './EditPage.module.css'

type Item = { label: string; bbox: [number, number, number, number] }

export function EditPage() {
  const { name } = useParams<{ name: string }>()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
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
      const res = await fetch(`/illustrations/${name}.png`)
      const blob = await res.blob()
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(blob)
      })

      const response = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
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
            const [x1, y1, x2, y2] = item.bbox
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
        <button className={styles.button} onClick={identify} disabled={loading}>
          {loading ? 'Identifying…' : 'Identify Key Players'}
        </button>

        {items.length > 0 && (
          <ul className={styles.list}>
            {items.map((item, i) => (
              <li key={i} className={styles.listItem}>
                <strong>{item.label}</strong>
                <span className={styles.coords}>
                  [{item.bbox.map((n) => n.toFixed(2)).join(', ')}]
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
