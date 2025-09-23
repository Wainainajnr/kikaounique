import { useState } from "react"
import { supabase } from "@/integrations/supabaseClient"
import { useNavigate } from "react-router-dom"

export default function Signup() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // Validation
    if (!fullName || fullName.trim().length < 2) {
      setError("⚠️ Full name must be at least 2 characters.")
      setLoading(false)
      return
    }
    if (!/^(\+254|0)[17]\d{8}$/.test(phone.replace(/\s/g, ''))) {
      setError("⚠️ Please enter a valid Kenyan phone number (07XXXXXXXX or +2547XXXXXXXX).")
      setLoading(false)
      return
    }
    if (!email.includes("@")) {
      setError("⚠️ Please enter a valid email address.")
      setLoading(false)
      return
    }
    if (password.length < 6) {
      setError("⚠️ Password must be at least 6 characters.")
      setLoading(false)
      return
    }

    setError(null)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else if (data.user) {
      // If you have a DB trigger creating profiles/members on auth.users insert
      // (recommended), avoid inserting from the client. Instead poll for the
      // created profile row (id = new user id) for a short period and succeed
      // once it appears. This avoids FK conflicts where both client and trigger
      // race to insert the same PK.
      const pollForProfile = async (maxAttempts = 8) => {
        let attempt = 0
        let wait = 300
        while (attempt < maxAttempts) {
          attempt++
          try {
            const { data: existing, error: checkErr } = await supabase
              .from("profiles")
              .select("id")
              .eq("id", data.user!.id)
              .limit(1)

            if (checkErr) {
              console.debug(`Signup: profiles check error on attempt ${attempt}`, checkErr)
            }

            if (Array.isArray(existing) && existing.length > 0) {
              console.debug(`Signup: found profile created by trigger on attempt ${attempt}`)
              return { success: true }
            }

            const jitter = Math.floor(Math.random() * 200)
            const waitFor = wait + jitter
            console.debug(`Signup: profile not found, retrying in ${waitFor}ms (attempt ${attempt})`)
            await new Promise((res) => setTimeout(res, waitFor))
            wait *= 2
          } catch (e) {
            console.debug(`Signup: unexpected error while polling for profile (attempt ${attempt})`, e)
            await new Promise((res) => setTimeout(res, wait))
            wait *= 2
          }
        }
        return { success: false, error: { message: 'Timed out waiting for server-created profile. You can create a profile from the Profile page after signing in.' } }
      }

      const result = await pollForProfile(8)
      if (!result.success) {
        setError('Failed to create profile: ' + (result.error?.message || 'unknown error'))
        console.debug('Signup: poll-for-profile final result', result)
      } else {
        alert('✅ Account created! Please check your email for confirmation.')
        navigate('/login')
      }
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-green-100 animate-fadeIn">
      <form
        onSubmit={handleSignup}
        className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md space-y-4"
      >
        <h1 className="text-2xl font-bold text-green-700">Sign Up</h1>

        {error && <p className="text-red-600 bg-red-100 p-2 rounded">{error}</p>}

        <input
          type="text"
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
          required
        />
        <input
          type="text"
          placeholder="Phone (07XXXXXXXX or +2547XXXXXXXX)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
          required
        />
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
          required
        />
        <input
          type="password"
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
          required
        />

        <button
          type="submit"
          className="w-full bg-green-600 text-white font-semibold py-3 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Creating Account..." : "Create Account"}
        </button>

        <p className="text-sm text-gray-600">
          Already have an account?{" "}
          <a href="/login" className="text-green-600 font-semibold">
            Log in
          </a>
        </p>
      </form>
    </div>
  )
}