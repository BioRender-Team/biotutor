import { Link, useMatch, useNavigate } from 'react-router-dom'
import styles from './Header.module.css'

const modules = import.meta.glob('/public/illustrations/*.png', { eager: true })
const illustrations = Object.keys(modules).map((path) =>
  path.replace('/public/illustrations/', '').replace('.png', ''),
)

function formatLabel(name: string) {
  // All-caps if every word is 1-4 chars or contains a hyphen (acronyms like CAR-T, DNA)
  if (name.includes('-')) return name.toUpperCase()
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export function Header() {
  const match = useMatch('/:name')
  const navigate = useNavigate()

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand}>BioTutor</Link>
      <div className={styles.right}>
        <select
          className={styles.nav}
          value=""
          onChange={(e) => { if (e.target.value) navigate(`/${e.target.value}`) }}
        >
          <option value="">Illustrations ▾</option>
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
