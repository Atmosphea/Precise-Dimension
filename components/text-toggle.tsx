"use client"

interface TextToggleProps {
  isActive: boolean
  onToggle: () => void
  isDark?: boolean
}

export function TextToggle({ isActive, onToggle, isDark = false }: TextToggleProps) {
  return (
    <div className="absolute top-16 left-4 z-20">
      <button
        className={`px-4 py-2 font-medium border-2 transition-colors rounded-tr-lg ${
          isActive
            ? isDark
              ? "bg-black text-white border-transparent animate-rainbow-border"
              : "bg-blue-500 text-white border-black"
            : isDark
              ? "bg-black text-white border-transparent animate-rainbow-border"
              : "bg-white text-black border-black"
        }`}
        onClick={onToggle}
      >
        Text
      </button>
    </div>
  )
}
