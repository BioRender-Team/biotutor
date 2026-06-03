import { Link, useMatch, useNavigate } from 'react-router-dom'
import styles from './Header.module.css'

const modules = import.meta.glob('/public/illustrations/*.png', { eager: true })
const illustrations = Object.keys(modules).map((path) =>
  path.replace('/public/illustrations/', '').replace('.png', ''),
)

const LABELS: Record<string, string> = {
  'car-t':   'CAR-T',
  'water':   'Water (orig)',
  'water2':  'Water 2',
  'water3':  'Water 3',
  'soybean': 'Soybean',
  'tomato':  'Tomato',
}

function formatLabel(name: string) {
  if (LABELS[name]) return LABELS[name]
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export function Header() {
  const match = useMatch('/:name')
  const navigate = useNavigate()

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand}>
        <img src="/biotutor-logo.png" alt="BioTutor" className={styles.logo} />
      </Link>
      <div className={styles.right}>
        <select
          className={styles.nav}
          value=""
          onChange={(e) => { if (e.target.value) navigate(`/${e.target.value}`) }}
        >
          <option value="">Illustrations</option>
          {illustrations.map((name) => (
            <option key={name} value={name}>{formatLabel(name)}</option>
          ))}
        </select>
{match && (
          <Link to={`/${match.params.name}/edit`} className={styles.editButton}>
            Edit
          </Link>
        )}
      </div>
    </header>
  )
}
