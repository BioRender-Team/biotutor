import { useNavigate } from 'react-router-dom'
import styles from './HomePage.module.css'

const modules = import.meta.glob('/public/illustrations/*.png', { eager: true })
const slugs = Object.keys(modules).map(p => p.replace('/public/illustrations/', '').replace('.png', ''))

const META: Record<string, { label: string; emoji: string }> = {
  'car-t':   { label: 'CAR-T',         emoji: '🧬' },
  'tomato':  { label: 'Tomato',         emoji: '🍅' },
  'soybean': { label: 'Soybean',        emoji: '🌱' },
  'water':   { label: 'Water (orig)',   emoji: '🌊' },
  'water2':  { label: 'Water 2',        emoji: '💧' },
  'water3':  { label: 'Water 3',        emoji: '🌧️' },
}

function getMeta(slug: string) {
  return META[slug] ?? { label: slug.charAt(0).toUpperCase() + slug.slice(1), emoji: '🔬' }
}

export function HomePage() {
  const navigate = useNavigate()

  return (
    <div className={styles.page}>
      {slugs.map((slug) => {
        const { label, emoji } = getMeta(slug)
        return (
          <button key={slug} className={styles.button} onClick={() => navigate(`/${slug}`)}>
            <span className={styles.emoji}>{emoji}</span>
            {label}
          </button>
        )
      })}
    </div>
  )
}
