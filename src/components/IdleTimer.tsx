// src/components/IdleTimer.tsx
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabaseClient";
import { useNavigate } from "react-router-dom";

interface IdleTimerProps {
  timeout?: number; // in milliseconds, default 300000 (5 minutes)
}

export default function IdleTimer({ timeout = 300000 }: IdleTimerProps) {
  const navigate = useNavigate();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
      alert("Logged out due to inactivity.");
    }, timeout);
  };

  useEffect(() => {
    // Reset timer on these events
    const events = ["mousemove", "keydown", "mousedown", "touchstart", "click", "wheel", "touchmove", "mousemove"];
    events.forEach((e) => window.addEventListener(e, resetTimer));

    // also reset when document becomes visible again
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') resetTimer();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Start initial timer
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return null; // No UI needed
}
