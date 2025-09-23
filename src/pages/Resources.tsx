// src/pages/Resources.tsx
import BottomNav from "../components/BottomNav";

export default function Resources() {
  return (
    <div className="min-h-screen pb-16">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-green-600">Resources</h1>
        <p className="text-gray-600">Access guides, documents, and learning resources.</p>
      </div>
      <BottomNav />
    </div>
  );
}
