import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabaseClient";
import { useNavigate } from "react-router-dom";

interface ProtectedRouteProps {
  children: React.ReactNode;
  session: any;
}

const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutes
const WARNING_TIME = 1 * 60 * 1000;      // 1 minute warning

const ProtectedRoute = ({ children, session }: ProtectedRouteProps) => {
  const [loading, setLoading] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | number | undefined;
    let warningTimeout: ReturnType<typeof setTimeout> | number | undefined;

    const safeSignOut = async (message?: string) => {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn("Sign out error:", err);
      } finally {
        if (message) setSessionExpiredMsg(message);
        navigate("/login", { replace: true });
      }
    };

    const startWarning = () => {
      setShowWarning(true);
      warningTimeout = setTimeout(() => void safeSignOut(), WARNING_TIME);
    };

    const resetTimeout = () => {
      if (timeout) clearTimeout(timeout);
      if (warningTimeout) clearTimeout(warningTimeout);
      setShowWarning(false);
      timeout = setTimeout(startWarning, INACTIVITY_LIMIT - WARNING_TIME);
    };

    if (!session) {
      void safeSignOut("Your session expired. Please log in again.");
    } else {
      setLoading(false);
      resetTimeout();
    }

    // Reset timeout on activity
    ["mousemove", "keydown", "click", "scroll"].forEach(event =>
      window.addEventListener(event, resetTimeout)
    );

    return () => {
      ["mousemove", "keydown", "click", "scroll"].forEach(event =>
        window.removeEventListener(event, resetTimeout)
      );
      if (timeout) window.clearTimeout(timeout);
      if (warningTimeout) window.clearTimeout(warningTimeout);
    };
  }, [navigate, session]);

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
          <p className="text-gray-800 mb-4">
            You will be logged out in 1 minute due to inactivity.
          </p>
          <button
            onClick={() => {
              setShowWarning(false);
              window.dispatchEvent(new Event("mousemove"));
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
