"use client";

import { useAppStore } from "@/lib/store";

const SAFE_AUTO_EXPAND_LIMIT = 150;

interface AutoExpandToggleProps {
  totalNodesAtDepth2: number;
  onCollapseAll: () => void;
  onExpandEssentials: () => void;
}

export default function AutoExpandToggle({
  totalNodesAtDepth2,
  onCollapseAll,
  onExpandEssentials,
}: AutoExpandToggleProps) {
  const autoExpand = useAppStore((s) => s.autoExpand);
  const setAutoExpand = useAppStore((s) => s.setAutoExpand);
  const darkMode = useAppStore((s) => s.darkMode);

  const isTooLarge = totalNodesAtDepth2 > SAFE_AUTO_EXPAND_LIMIT;

  const btnBase = `px-3 py-1.5 text-xs font-medium rounded border transition-all duration-200`;
  const btnStyle = darkMode
    ? "border-gray-700 text-gray-300 bg-gray-800 hover:bg-gray-700"
    : "border-gray-200 text-gray-600 bg-white hover:bg-gray-50";

  return (
    <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
      {/* Collapse all */}
      <button onClick={onCollapseAll} className={`${btnBase} ${btnStyle}`}>
        Collapse all
      </button>

      {/* Expand essentials */}
      <button onClick={onExpandEssentials} className={`${btnBase} ${btnStyle}`}>
        Essentials
      </button>

      {/* Auto-expand toggle */}
      <button
        onClick={() => {
          if (!isTooLarge) setAutoExpand(!autoExpand);
        }}
        disabled={isTooLarge}
        className={`
          flex items-center gap-2 ${btnBase}
          ${
            isTooLarge
              ? darkMode
                ? "border-gray-700 text-gray-500 cursor-not-allowed bg-gray-800"
                : "border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50"
              : autoExpand
              ? "border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100"
              : btnStyle
          }
        `}
      >
        <span
          className={`
            w-3 h-3 rounded-sm border-2 transition-all duration-200
            ${
              autoExpand && !isTooLarge
                ? "border-blue-500 bg-blue-500"
                : darkMode
                ? "border-gray-600 bg-gray-800"
                : "border-gray-300 bg-white"
            }
          `}
        >
          {autoExpand && !isTooLarge && (
            <svg
              viewBox="0 0 12 12"
              className="w-full h-full text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M2 6l3 3 5-5" />
            </svg>
          )}
        </span>
        Auto-expand
      </button>

      {isTooLarge && (
        <span
          className="text-[10px] max-w-[140px] leading-tight"
          style={{ color: "var(--muted)" }}
        >
          Map too large for auto-expand
        </span>
      )}
    </div>
  );
}
