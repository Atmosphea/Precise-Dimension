"use client"

interface UIHideToggleProps {
  isHidden: boolean
  onToggle: () => void
  isDark: boolean
}

export function UIHideToggle({ isHidden, onToggle, isDark }: UIHideToggleProps) {
  return (
    <div className="absolute top-28 right-4 z-30">
      <button
        className={`px-4 py-2 font-medium border-2 transition-colors rounded-tr-lg ${
          isDark ? "bg-gray-800 text-white border-white" : "bg-white text-black border-black"
        }`}
        onClick={onToggle}
        title={isHidden ? "Show UI" : "Hide UI"}
      >
        {isHidden ? "👁️" : "🙈"}
      </button>
    </div>
  )
}
