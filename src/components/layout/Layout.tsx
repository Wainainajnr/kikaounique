// src/components/layout/Layout.tsx
import { Outlet } from "react-router-dom";
import BottomNav from "../BottomNav";
import IdleTimer from "../IdleTimer";

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
  <IdleTimer timeout={300000} /> {/* 5 minutes (300,000 ms) inactivity */}
      <main className="flex-grow pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
