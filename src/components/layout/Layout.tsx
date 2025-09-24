import { Outlet } from "react-router-dom";
import BottomNav from "../BottomNav";
import IdleTimer from "../IdleTimer";

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <IdleTimer timeout={300000} /> {/* 5 minutes (300,000 ms) inactivity */}
      
      {/* Top Logo */}
      <header className="flex justify-center items-center py-4 border-b border-gray-200 bg-white">
        <img 
          src="/kikao_logo.jpg"  // Correct path for Vite public folder
          alt="Kikao Logo" 
          className="h-12 w-auto"
        />
      </header>

      <main className="flex-grow pb-20">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}
