import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { PageProvider } from './auth/PageProvider'
import { RequireAuth } from './auth/RequireAuth'
import { AppHeader } from './components/AppHeader'
import { Brief } from './screens/Brief'
import { Login } from './screens/Login'
import { Requests } from './screens/Requests'
import { Voice } from './screens/Voice'
import { Showcase } from './Showcase'

function AppLayout() {
  return (
    <>
      <AppHeader />
      <Outlet />
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <PageProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Requests />} />
                <Route path="/requests/:id" element={<Brief />} />
                <Route path="/voice" element={<Voice />} />
              </Route>
            </Route>
            {/* Design system check page, local dev only. */}
            {import.meta.env.DEV && <Route path="/design" element={<Showcase />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </PageProvider>
    </AuthProvider>
  )
}
