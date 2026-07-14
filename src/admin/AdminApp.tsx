import { useEffect, useState } from 'react'
import { useAuth, roleLabel } from '../auth'
import { navigate, ADMIN_BASE } from '../router'
import { isRemote } from '../config'
import { enterAdmin, stopPersisting } from '../session'
import { LoginScreen } from './LoginScreen'
import { BookingsPage } from './BookingsPage'
import { ServicesPage } from './ServicesPage'
import { SpecialistsPage } from './SpecialistsPage'
import { SchedulePage } from './SchedulePage'
import { UsersPage } from './UsersPage'
import { SettingsPage } from './SettingsPage'
import { ReviewsPage } from './ReviewsPage'
import { ClientsPage } from './ClientsPage'
import { Avatar } from '../ui'
import { Icon, type IconName } from '../icons'

type Tab = 'bookings' | 'services' | 'specialists' | 'schedule' | 'reviews' | 'clients' | 'users' | 'settings'

// primary — в нижнем меню на телефоне; остальное прячется в кнопку «Ещё».
const TABS: { id: Tab; path: string; label: string; icon: IconName; ownerOnly?: boolean; primary?: boolean }[] = [
  { id: 'bookings', path: ADMIN_BASE, label: 'Записи', icon: 'calendarDays', primary: true },
  { id: 'schedule', path: `${ADMIN_BASE}/schedule`, label: 'Расписание', icon: 'calendarClock', primary: true },
  { id: 'reviews', path: `${ADMIN_BASE}/reviews`, label: 'Отзывы', icon: 'message', primary: true },
  { id: 'clients', path: `${ADMIN_BASE}/clients`, label: 'Клиенты', icon: 'contact', primary: true },
  { id: 'services', path: `${ADMIN_BASE}/services`, label: 'Услуги', icon: 'sparkles' },
  { id: 'specialists', path: `${ADMIN_BASE}/specialists`, label: 'Специалисты', icon: 'users' },
  { id: 'users', path: `${ADMIN_BASE}/users`, label: 'Пользователи', icon: 'key', ownerOnly: true },
  { id: 'settings', path: `${ADMIN_BASE}/settings`, label: 'Бренд', icon: 'tag', ownerOnly: true },
]

function tabForPath(path: string): Tab {
  if (path.startsWith(`${ADMIN_BASE}/services`)) return 'services'
  if (path.startsWith(`${ADMIN_BASE}/specialists`)) return 'specialists'
  if (path.startsWith(`${ADMIN_BASE}/schedule`)) return 'schedule'
  if (path.startsWith(`${ADMIN_BASE}/reviews`)) return 'reviews'
  if (path.startsWith(`${ADMIN_BASE}/clients`)) return 'clients'
  if (path.startsWith(`${ADMIN_BASE}/users`)) return 'users'
  if (path.startsWith(`${ADMIN_BASE}/settings`)) return 'settings'
  return 'bookings'
}

export function AdminApp({ path }: { path: string }) {
  const { user, ready, logout, canManageUsers } = useAuth()

  const [moreOpen, setMoreOpen] = useState(false)
  // remote-режим: подгрузить полные данные и включить сохранение на сервер,
  // когда сотрудник авторизован (в т.ч. при возврате в админку с витрины).
  const [dataReady, setDataReady] = useState(!isRemote())
  useEffect(() => {
    if (!isRemote()) return
    if (!user) {
      setDataReady(true)
      return
    }
    setDataReady(false)
    let alive = true
    enterAdmin()
      .catch((e) => console.error('Не удалось загрузить данные:', e))
      .finally(() => alive && setDataReady(true))
    return () => {
      alive = false
    }
  }, [user])

  const onLogout = () => {
    stopPersisting()
    logout()
  }

  if (!ready) return <AdminLoading />
  // Регистрации нет: если не авторизован — только вход. Суперадминистратор
  // заводится вручную (worker/seed-owner.mjs), сотрудники — внутри панели.
  if (!user) return <LoginScreen />
  if (!dataReady) return <AdminLoading />

  const tab = tabForPath(path)
  const visibleTabs = TABS.filter((t) => !t.ownerOnly || canManageUsers)
  const primaryTabs = visibleTabs.filter((t) => t.primary)
  const moreTabs = visibleTabs.filter((t) => !t.primary)
  const tabInMore = moreTabs.some((t) => t.id === tab)

  return (
    <div className="admin">
      <aside className="admin-side">
        <div className="admin-brand">
          <span className="admin-brand-logo">
            <Icon name="flower" size={22} />
          </span>
          <span className="admin-brand-name">Админка</span>
        </div>
        <nav className="admin-nav">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              className={`admin-nav-item${tab === t.id ? ' active' : ''}`}
              onClick={() => navigate(t.path)}
            >
              <span className="admin-nav-icon">
                <Icon name={t.icon} size={19} />
              </span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="admin-user">
          <Avatar src={null} name={user.name} size={34} />
          <div className="admin-user-info">
            <div className="admin-user-name">{user.name}</div>
            <div className="admin-user-role">{roleLabel(user.role)}</div>
          </div>
        </div>
        <div className="admin-side-actions">
          <button className="linkbtn" onClick={() => navigate('/')}>
            Витрина записи ↗
          </button>
          <button className="linkbtn danger" onClick={onLogout}>
            Выйти
          </button>
        </div>
      </aside>

      <main className="admin-main">
        {tab === 'bookings' && <BookingsPage />}
        {tab === 'schedule' && <SchedulePage />}
        {tab === 'clients' && <ClientsPage />}
        {tab === 'services' && <ServicesPage />}
        {tab === 'specialists' && <SpecialistsPage />}
        {tab === 'reviews' && <ReviewsPage />}
        {tab === 'users' && (canManageUsers ? <UsersPage /> : <NoAccess />)}
        {tab === 'settings' && (canManageUsers ? <SettingsPage /> : <NoAccess />)}
      </main>

      {/* Мобильная нижняя навигация: основные разделы + «Ещё» */}
      <nav className="admin-bottomnav">
        {primaryTabs.map((t) => (
          <button
            key={t.id}
            className={`admin-bottomnav-item${tab === t.id ? ' active' : ''}`}
            onClick={() => navigate(t.path)}
          >
            <Icon name={t.icon} size={20} />
            <span className="admin-bottomnav-label">{t.label}</span>
          </button>
        ))}
        {moreTabs.length > 0 && (
          <button
            className={`admin-bottomnav-item${tabInMore || moreOpen ? ' active' : ''}`}
            onClick={() => setMoreOpen(true)}
          >
            <Icon name="more" size={20} />
            <span className="admin-bottomnav-label">Ещё</span>
          </button>
        )}
      </nav>

      {moreOpen && (
        <div className="admin-more-overlay" onClick={() => setMoreOpen(false)}>
          <div className="admin-more-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="admin-more-title">Ещё</div>
            {moreTabs.map((t) => (
              <button
                key={t.id}
                className={`admin-more-item${tab === t.id ? ' active' : ''}`}
                onClick={() => {
                  navigate(t.path)
                  setMoreOpen(false)
                }}
              >
                <Icon name={t.icon} size={20} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function NoAccess() {
  return (
    <div className="page">
      <div className="empty">
        <div className="empty-emoji">
          <Icon name="lock" size={44} />
        </div>
        <p>Этот раздел доступен только суперадминистратору.</p>
      </div>
    </div>
  )
}

function AdminLoading() {
  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="spinner" />
        <p className="muted">Загрузка…</p>
      </div>
    </div>
  )
}
