import { AuthProvider } from './auth'
import { useHash, isAdminPath } from './router'
import { AdminApp } from './admin/AdminApp'
import { ClientApp } from './client/ClientApp'
import './styles.css'

export default function App() {
  const path = useHash()
  return (
    <AuthProvider>
      {isAdminPath(path) ? <AdminApp path={path} /> : <ClientApp path={path} />}
    </AuthProvider>
  )
}
