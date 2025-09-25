import { useState } from "react"
import { supabase } from "@/integrations/supabaseClient"
import { useNavigate } from "react-router-dom"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rememberMe, setRememberMe] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      navigate("/") // ✅ redirect to root/dashboard
    }
  }

  const handleForgotPassword = async () => {
    setError(null)
    setMessage(null)
    if (!email) {
      setError("Please enter your email first.")
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`, // ✅ create this route in your app
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage("Password reset link sent! Check your email.")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-50 to-green-100">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md animate-fadeIn">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <img 
              src="/kikao_logo.png" 
              alt="Kikao Unique Group Logo" 
              className="w-10 h-10 object-contain"
            />
          </div>
        </div>
        
        {/* Title */}
        <h2 className="text-3xl font-bold text-center text-green-700 mb-2">
          Welcome Back
        </h2>
        <p className="text-center text-gray-500 mb-8">
          Login to your Kikao Unique Group account
        </p>

        {/* Error / Success Messages */}
        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded">
            {error}
          </div>
        )}
        {message && (
          <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4 rounded">
            {message}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              placeholder="your@email.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition duration-200"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              id="password"
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition duration-200"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input 
                id="remember-me" 
                type="checkbox" 
                className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                Remember me
              </label>
            </div>
            <button 
              type="button"
              onClick={handleForgotPassword}
              className="text-sm text-green-600 hover:underline"
            >
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white py-3 rounded-lg hover:from-green-700 hover:to-green-600 transition duration-200 flex items-center justify-center disabled:opacity-50"
          >
            <span>{loading ? "Logging in..." : "Login"}</span>
            {loading && (
              <svg className="animate-spin ml-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
          </button>
        </form>

        {/* Sign Up */}
        <p className="mt-8 text-center text-gray-500">
          Don't have an account?{" "}
          <button
            onClick={() => navigate("/signup")}
            className="font-medium text-green-600 hover:underline"
          >
            Sign up
          </button>
        </p>
      </div>
    </div>
  )
}
