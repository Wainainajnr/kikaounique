// src/components/ProtectedRoute.tsx
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabaseClient';
import { useNavigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutes
const WARNING_TIME = 1 * 60 * 1000;      // 1 minute warning

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const [loading, setLoading] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
  // use a generic timer return type to satisfy both Node and browser libs
  let timeout: ReturnType<typeof setTimeout> | number | undefined;
  let warningTimeout: ReturnType<typeof setTimeout> | number | undefined;
  let authTimeout: ReturnType<typeof setTimeout> | number | undefined;

    const safeSignOut = async (message?: string) => {
      try {
        // attempt to sign out; some servers may return 403 for already-expired tokens
        const res = await supabase.auth.signOut();
        // supabase client may return an object with `error`
        if ((res as any)?.error) {
          console.warn('supabase signOut returned error:', (res as any).error);
        }
      } catch (err) {
        // swallow network/auth errors (403 etc.) but log for debugging
        console.warn('supabase signOut threw:', err);
      } finally {
        if (message) setSessionExpiredMsg(message);
        // always navigate to login to clear client-side session state
        navigate('/login', { replace: true });
      }
    };

    const startWarning = () => {
      setShowWarning(true);
      // Schedule auto logout after warning time
      warningTimeout = setTimeout(() => { void safeSignOut(); }, WARNING_TIME);
    };

    const resetTimeout = () => {
      if (timeout) clearTimeout(timeout);
      if (warningTimeout) clearTimeout(warningTimeout);
      setShowWarning(false);
      timeout = setTimeout(startWarning, INACTIVITY_LIMIT - WARNING_TIME);
    };

    const checkAuth = async () => {
      // set a short auth timeout to avoid indefinite loading UI
      authTimeout = window.setTimeout(() => {
        console.warn('Auth check timed out, redirecting to login');
        void safeSignOut('Authentication timed out. Please log in.');
      }, 8000);
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
            // clear auth timeout since we got a response
            if (authTimeout) { window.clearTimeout(authTimeout); authTimeout = undefined; }
            if (error) {
              console.error('Session error:', error);
              const msg = (error as any)?.message || '';
              if (/invalid refresh token|refresh token not found|jwt expired/i.test(msg)) {
                // Clear client-side session and redirect to login (swallow server 403s)
                void safeSignOut('Your session expired. Please log in again.');
                return;
              }
              // for other errors, still navigate to login
              void safeSignOut();
              return;
            }

        if (!session) {
          void safeSignOut();
        } else {
          setLoading(false);
          resetTimeout();
        }
        } catch (err) {
        console.error('Auth check error:', err);
        const msg = (err as any)?.message || '';
        if (/invalid refresh token|refresh token not found|jwt expired/i.test(msg)) {
          void safeSignOut('Your session expired. Please log in again.');
          return;
        }
        void safeSignOut();
      }
    };

    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session) {
          void safeSignOut();
        } else {
          setLoading(false);
          resetTimeout();
        }
      }
    );

    // Reset timeout on user activity
    ['mousemove', 'keydown', 'click', 'scroll'].forEach(event =>
      window.addEventListener(event, resetTimeout)
    );

    return () => {
      // Guard unsubscribe in case subscription is undefined
      try {
        if (subscription && typeof (subscription as any).unsubscribe === 'function') {
          (subscription as any).unsubscribe();
        }
      } catch (err) {
        console.warn('Failed to unsubscribe auth listener:', err);
      }
      ['mousemove', 'keydown', 'click', 'scroll'].forEach(event =>
        window.removeEventListener(event, resetTimeout)
      );
      if (timeout) window.clearTimeout(timeout);
      if (warningTimeout) window.clearTimeout(warningTimeout);
      if (authTimeout) window.clearTimeout(authTimeout);
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-green-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking authentication...</p>
          {sessionExpiredMsg && (
            <p className="mt-2 text-sm text-red-600">{sessionExpiredMsg}</p>
          )}
        </div>
      </div>
    );
  }

  if (showWarning) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
        <div className="bg-white p-6 rounded-lg text-center shadow-lg max-w-sm">
          <p className="text-gray-800 mb-4">You will be logged out in 1 minute due to inactivity.</p>
          <button
            onClick={() => {
              setShowWarning(false);
              window.dispatchEvent(new Event('mousemove')); // reset timeout
            }}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Stay Logged In
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
