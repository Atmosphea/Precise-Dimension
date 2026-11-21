"use client"

interface LockToggleProps {
  isActive: boolean
  onToggle: () => void
}

export function LockToggle({ isActive, onToggle }: LockToggleProps) {
  return (
    <div className="absolute top-4 right-[520px] z-20">
      <button
        className={`px-4 py-2 font-medium border-2 border-black transition-colors rounded-tr-lg ${
          isActive ? "bg-yellow-500 text-white" : "bg-white text-black"
        }`}
        onClick={onToggle}
        title="Lock Mode - Click boxes to lock/unlock them"
      >
        🔒
      </button>
    </div>
  )
}
