import { useParams } from 'react-router-dom'
import styles from './IllustrationPage.module.css'

export function IllustrationPage() {
  const { name } = useParams<{ name: string }>()

  return (
    <div className={styles.page}>
      <img
        src={`/illustrations/${name}.png`}
        alt={name}
        className={styles.image}
      />
    </div>
  )
}
