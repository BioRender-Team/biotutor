import { Link, useMatch, useNavigate } from 'react-router-dom'
import styles from './Header.module.css'

const DEMO_ILLUSTRATIONS: { name: string; label: string }[] = [
  { name: 'hiv-cycle', label: 'HIV Cycle' },
  { name: 'car-t',     label: 'CAR T' },
  { name: 'water3',    label: 'Water Cycle' },
]

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
          {DEMO_ILLUSTRATIONS.map(({ name, label }) => (
            <option key={name} value={name}>{label}</option>
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
