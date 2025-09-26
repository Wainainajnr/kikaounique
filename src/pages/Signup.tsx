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
    setError(null)

    try {
      // Input validation
      if (!fullName || fullName.trim().length < 2) {
        throw new Error("Full name must be at least 2 characters.")
      }
      
      if (!/^(\+254|0)[17]\d{8}$/.test(phone.replace(/\s/g, ''))) {
        throw new Error("Please enter a valid Kenyan phone number (07XXXXXXXX or +2547XXXXXXXX).")
      }
      
      if (!email.includes("@") || !email.includes(".")) {
        throw new Error("Please enter a valid email address.")
      }
      
      if (password.length < 6) {
        throw new Error("Password must be at least 6 characters.")
      }

      // Sign up user with Supabase
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.replace(/\s/g, '')
          }
        }
      })

      if (signUpError) {
        throw signUpError
      }

      if (!data?.user) {
        throw new Error("No user data returned from signup. Please try again.")
      }

      const userId = data.user.id // ✅ Safe after guard

      console.log('Signup successful:', data.user)

      // Poll for profile creation with improved error handling
      const pollForProfile = async (maxAttempts = 10): Promise<{ success: boolean; error?: any }> => {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const { data: profile, error: profileError } = await supabase
              .from("profiles")
              .select("id, updated_at")
              .eq("id", userId) // ✅ using safe variable
              .single()

            if (profileError && profileError.code !== 'PGRST116') {
              console.warn(`Profile check error on attempt ${attempt}:`, profileError)
            }

            if (profile) {
              console.log(`Profile found on attempt ${attempt}`)
              return { success: true }
            }

            // Exponential backoff with jitter
            const baseDelay = 500
            const jitter = Math.random() * 200
            const delay = baseDelay * Math.pow(2, attempt - 1) + jitter
            
            console.log(`Profile not found, waiting ${Math.round(delay)}ms before attempt ${attempt + 1}`)
            await new Promise(resolve => setTimeout(resolve, delay))
            
          } catch (error) {
            console.warn(`Unexpected error polling for profile (attempt ${attempt}):`, error)
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }
        
        return { 
          success: false, 
          error: new Error('Profile creation timeout. You can create a profile manually after signing in.') 
        }
      }

      const pollResult = await pollForProfile()
      
      if (!pollResult.success) {
        console.warn('Profile polling failed:', pollResult.error)
      }

      alert('✅ Account created successfully! Please check your email for verification.')
      navigate('/login')

    } catch (error: any) {
      console.error('Signup failed:', error)
      
      if (error.message?.includes('User already registered')) {
        setError('An account with this email already exists. Please try logging in.')
      } else if (error.message?.includes('Invalid email')) {
        setError('Please enter a valid email address.')
      } else if (error.message?.includes('Password should be at least')) {
        setError('Password must be at least 6 characters long.')
      } else {
        setError(error.message || 'An unexpected error occurred during signup. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-50 to-green-100">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md animate-fadeIn">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <img 
              src="/kikao_logo.png" 
              alt="Kikao Unique Group Logo" 
              className="w-10 h-10 object-contain"
            />
          </div>
        </div>
        
        <h2 className="text-3xl font-bold text-center text-green-700 mb-2">
          Create Account
        </h2>
        <p className="text-center text-gray-500 mb-8">
          Join Kikao Unique Group today
        </p>

        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-5">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                {/* user icon */}
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </div>
              <input
                type="text"
                id="fullName"
                placeholder="John Doe"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition duration-200"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                {/* phone icon */}
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
              </div>
              <input
                type="text"
                id="phone"
                placeholder="07XXXXXXXX or +2547XXXXXXXX"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition duration-200"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                {/* email icon */}
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                  <rect width="20" height="16" x="2" y="4" rx="2"></rect>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                </svg>
              </div>
              <input
                type="email"
                id="email"
                placeholder="your@email.com"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition duration-200"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                {/* lock icon */}
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </div>
              <input
                type="password"
                id="password"
                placeholder="•••••••• (min 6 characters)"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition duration-200"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white py-3 rounded-lg hover:from-green-700 hover:to-green-600 transition duration-200 flex items-center justify-center disabled:opacity-50"
          >
            <span>{loading ? "Creating Account..." : "Create Account"}</span>
            {loading && (
              <svg className="animate-spin ml-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
          </button>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Already have an account?</span>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={() => navigate("/login")}
              className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition duration-200"
            >
              Sign in to existing account
            </button>
          </div>
        </div>

        <p className="mt-8 text-center text-gray-500">
          By creating an account, you agree to our{" "}
          <button className="font-medium text-green-600 hover:underline">
            Terms of Service
          </button>{" "}
          and{" "}
          <button className="font-medium text-green-600 hover:underline">
            Privacy Policy
          </button>
        </p>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.6s ease-out forwards;
        }
      `}</style>
    </div>
  )
}
