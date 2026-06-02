import { useNavigate } from 'react-router-dom'
import styles from './HomePage.module.css'

const modules = import.meta.glob('/public/illustrations/*.png', { eager: true })
const illustrations = Object.keys(modules).map(
  (path) => path.replace('/public/illustrations/', '').replace('.png', '')
)

export function HomePage() {
  const navigate = useNavigate()

  return (
    <div className={styles.page}>
      {illustrations.map((name) => (
        <button key={name} className={styles.button} onClick={() => navigate(`/${name}`)}>
          {name}
        </button>
      ))}
    </div>
  )
}
