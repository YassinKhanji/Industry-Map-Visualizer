"use client";

import { useAppStore } from "@/lib/store";

interface AutoExpandToggleProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export default function AutoExpandToggle({
  onExpandAll,
  onCollapseAll,
}: AutoExpandToggleProps) {
  const darkMode = useAppStore((s) => s.darkMode);

  const btnBase = `px-3 py-1.5 text-xs font-medium rounded border transition-all duration-200`;
  const btnStyle = darkMode
    ? "border-gray-700 text-gray-300 bg-gray-800 hover:bg-gray-700"
    : "border-gray-200 text-gray-600 bg-white hover:bg-gray-50";

  return (
    <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
      <button onClick={onExpandAll} className={`${btnBase} ${btnStyle}`}>
        Expand all
      </button>
      <button onClick={onCollapseAll} className={`${btnBase} ${btnStyle}`}>
        Collapse all
      </button>
    </div>
  );
}
