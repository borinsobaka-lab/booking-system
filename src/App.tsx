import { AuthProvider } from './auth'
import { I18nProvider } from './i18n'
import { useHash, isAdminPath } from './router'
import { AdminApp } from './admin/AdminApp'
import { ClientApp } from './client/ClientApp'
import './styles.css'

export default function App() {
  const path = useHash()
  return (
    <I18nProvider>
      <AuthProvider>
        {isAdminPath(path) ? <AdminApp path={path} /> : <ClientApp path={path} />}
      </AuthProvider>
    </I18nProvider>
  )
}
