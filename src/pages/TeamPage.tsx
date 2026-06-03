import styles from './TeamPage.module.css'

const TEAM = [
  { name: 'Nick DelRose', img: '/team/nick-delrose.png', tilt: -4  },
  { name: 'Emily Lee',    img: '/team/emily-lee.png',    tilt:  4  },
  { name: 'Jamey Lowen', img: '/team/jamey-lowen.png',  tilt: -4  },
  { name: 'Jessica Yu',  img: '/team/jessica-yu.png',   tilt:  4  },
]

export function TeamPage() {
  return (
    <div className={styles.page}>
      <h2 className={styles.subtitle}>Team BioTutor · Summer Synergy 2026</h2>
      <div className={styles.row}>
        {TEAM.map(({ name, img, tilt }) => (
          <div key={name} className={styles.member}>
            <img
              src={img}
              alt={name}
              className={styles.avatar}
              style={{ '--tilt': `${tilt}deg` } as React.CSSProperties}
            />
            <span className={styles.name}>{name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
