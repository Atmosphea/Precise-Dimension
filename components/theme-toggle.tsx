"use client"

interface ThemeToggleProps {
  isDark: boolean
  onToggle: () => void
}

export function ThemeToggle({ isDark, onToggle }: ThemeToggleProps) {
  return (
    <div className="absolute top-16 right-4 z-20">
      <button
        className={`px-4 py-2 font-medium border-2 border-black transition-colors rounded-tr-lg ${
          isDark ? "bg-gray-800 text-white border-white" : "bg-white text-black"
        }`}
        onClick={onToggle}
        title="Toggle Dark/Light Theme"
      >
        {isDark ? "🌙" : "☀️"}
      </button>
    </div>
  )
}
