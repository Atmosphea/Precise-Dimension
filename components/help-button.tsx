"use client"

interface HelpButtonProps {
  onClick: () => void
  isDark: boolean
}

export function HelpButton({ onClick, isDark }: HelpButtonProps) {
  return (
    <div className="absolute top-40 right-4 z-20">
      <button
        className={`px-4 py-2 font-medium border-2 transition-colors rounded-tr-lg ${
          isDark ? "bg-gray-800 text-white border-white" : "bg-white text-black border-black"
        }`}
        onClick={onClick}
        title="Help & Information"
      >
        ?
      </button>
    </div>
  )
}
