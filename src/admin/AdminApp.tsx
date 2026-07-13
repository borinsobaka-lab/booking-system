import { useAuth, roleLabel } from '../auth'
import { navigate } from '../router'
import { SetupScreen } from './SetupScreen'
import { LoginScreen } from './LoginScreen'
import { BookingsPage } from './BookingsPage'
import { ServicesPage } from './ServicesPage'
import { SpecialistsPage } from './SpecialistsPage'
import { SchedulePage } from './SchedulePage'
import { UsersPage } from './UsersPage'
import { SettingsPage } from './SettingsPage'
import { Avatar } from '../ui'

type Tab = 'bookings' | 'services' | 'specialists' | 'schedule' | 'users' | 'settings'

const TABS: { id: Tab; path: string; label: string; icon: string; ownerOnly?: boolean }[] = [
  { id: 'bookings', path: '/admin', label: 'Записи', icon: '📅' },
  { id: 'schedule', path: '/admin/schedule', label: 'Расписание', icon: '🗓️' },
  { id: 'services', path: '/admin/services', label: 'Услуги', icon: '💆' },
  { id: 'specialists', path: '/admin/specialists', label: 'Специалисты', icon: '🧑‍⚕️' },
  { id: 'users', path: '/admin/users', label: 'Пользователи', icon: '🔑', ownerOnly: true },
  { id: 'settings', path: '/admin/settings', label: 'Бренд', icon: '🏷️', ownerOnly: true },
]

function tabForPath(path: string): Tab {
  if (path.startsWith('/admin/services')) return 'services'
  if (path.startsWith('/admin/specialists')) return 'specialists'
  if (path.startsWith('/admin/schedule')) return 'schedule'
  if (path.startsWith('/admin/users')) return 'users'
  if (path.startsWith('/admin/settings')) return 'settings'
  return 'bookings'
}

export function AdminApp({ path }: { path: string }) {
  const { user, ownerExists, logout, canManageUsers } = useAuth()

  if (!ownerExists) return <SetupScreen />
  if (!user) return <LoginScreen />

  const tab = tabForPath(path)
  const visibleTabs = TABS.filter((t) => !t.ownerOnly || canManageUsers)

  return (
    <div className="admin">
      <aside className="admin-side">
        <div className="admin-brand">
          <span className="admin-brand-logo">💆</span>
          <span className="admin-brand-name">Админка</span>
        </div>
        <nav className="admin-nav">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              className={`admin-nav-item${tab === t.id ? ' active' : ''}`}
              onClick={() => navigate(t.path)}
            >
              <span className="admin-nav-icon">{t.icon}</span>
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
          <button className="linkbtn danger" onClick={logout}>
            Выйти
          </button>
        </div>
      </aside>

      <main className="admin-main">
        {tab === 'bookings' && <BookingsPage />}
        {tab === 'schedule' && <SchedulePage />}
        {tab === 'services' && <ServicesPage />}
        {tab === 'specialists' && <SpecialistsPage />}
        {tab === 'users' && (canManageUsers ? <UsersPage /> : <NoAccess />)}
        {tab === 'settings' && (canManageUsers ? <SettingsPage /> : <NoAccess />)}
      </main>

      {/* Мобильная нижняя навигация */}
      <nav className="admin-bottomnav">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            className={`admin-bottomnav-item${tab === t.id ? ' active' : ''}`}
            onClick={() => navigate(t.path)}
          >
            <span>{t.icon}</span>
            <span className="admin-bottomnav-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function NoAccess() {
  return (
    <div className="page">
      <div className="empty">
        <div className="empty-emoji">🔒</div>
        <p>Этот раздел доступен только суперадминистратору.</p>
      </div>
    </div>
  )
}
