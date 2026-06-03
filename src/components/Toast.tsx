import { useState, useCallback, useEffect } from 'react'
import styles from './Toast.module.css'

type ToastState = { message: string; id: number } | null

let _show: ((msg: string) => void) | null = null

export function showToast(message: string) {
  _show?.(message)
}

export function ToastProvider() {
  const [toast, setToast] = useState<ToastState>(null)

  const show = useCallback((message: string) => {
    setToast({ message, id: Date.now() })
  }, [])

  useEffect(() => { _show = show; return () => { _show = null } }, [show])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 20000)
    return () => clearTimeout(t)
  }, [toast?.id])

  if (!toast) return null

  return (
    <div className={styles.toast} onClick={() => setToast(null)}>
      <span className={styles.icon}>⚠️</span>
      {toast.message}
    </div>
  )
}
