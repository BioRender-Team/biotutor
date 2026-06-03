import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Header } from './components/Header'
import { HomePage } from './pages/HomePage'
import { IllustrationPage } from './pages/IllustrationPage'
import { EditPage } from './pages/EditPage'
import { TeamPage } from './pages/TeamPage'
import { ToastProvider } from './components/Toast'
import styles from './App.module.css'

export default function App() {
  return (
    <BrowserRouter>
      <div className={styles.app}>
        <ToastProvider />
        <Header />
        <main className={styles.main}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/:name" element={<IllustrationPage />} />
            <Route path="/:name/edit" element={<EditPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
