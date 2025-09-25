import { useEffect, useState } from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import Layout from "./components/layout/Layout"
import Dashboard from "./pages/Dashboard"
import Login from "./pages/Login"
import Signup from "./pages/Signup"
import CSR from "./pages/CSR"
import Contributions from "./pages/Contributions"
import Expenses from "./pages/Expenses"
import Resources from "./pages/Resources"
import Profile from "./pages/Profile"
import ProtectedRoute from "./components/ProtectedRoute"
import NotFound from "./pages/NotFound"
import ResetPassword from "./pages/ResetPassword"
import { supabase } from "@/integrations/supabaseClient"

export default function App() {
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    // Listen for auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Protected Routes (require login) */}
        <Route element={<Layout />}>
          <Route
            path="/"
            element={
              <ProtectedRoute session={session}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/csr"
            element={
              <ProtectedRoute session={session}>
                <CSR />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contributions"
            element={
              <ProtectedRoute session={session}>
                <Contributions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses"
            element={
              <ProtectedRoute session={session}>
                <Expenses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/resources"
            element={
              <ProtectedRoute session={session}>
                <Resources />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute session={session}>
                <Profile />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Catch-all 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
