// src/components/BottomNav.tsx
import { Home, Heart, Wallet, BookOpen, User, Receipt } from "lucide-react";
import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/csr", label: "CSR", icon: Heart },
  { to: "/contributions", label: "Contributions", icon: Wallet },
  { to: "/expenses", label: "Expenses", icon: Receipt }, // Added Expenses
  { to: "/resources", label: "Resources", icon: BookOpen },
  { to: "/profile", label: "Profile", icon: User },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-md">
      <ul className="flex justify-around items-center py-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center text-xs px-2 py-1 rounded-md transition-colors ${
                  isActive ? "text-green-600 bg-green-50" : "text-gray-500 hover:text-green-500"
                }`
              }
            >
              <Icon className="w-5 h-5 mb-1" />
              <span className="text-xs">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}