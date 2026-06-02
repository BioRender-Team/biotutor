import { Link, useMatch } from 'react-router-dom'
import styles from './Header.module.css'

export function Header() {
  const match = useMatch('/:name')

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand}>BioTutor</Link>
      {match && (
        <Link to={`/${match.params.name}/edit`} className={styles.editButton}>
          Edit
        </Link>
      )}
    </header>
  )
}
