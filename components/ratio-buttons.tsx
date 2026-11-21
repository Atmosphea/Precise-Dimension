"use client"

interface RatioButtonsProps {
  onAddRatioBox: (ratio: string) => void
  isDark: boolean
}

export function RatioButtons({ onAddRatioBox, isDark }: RatioButtonsProps) {
  // Common web ratios
  const ratios = ["16:9", "4:3", "1:1", "2:3", "9:16", "3:4"]

  const buttonClass = `px-3 py-2 font-medium border-2 transition-all duration-300 ${
    isDark
      ? "bg-black text-white border-transparent animate-rainbow-border hover:scale-105"
      : "bg-white text-black border-black hover:bg-gray-100"
  }`

  return (
    <div className="absolute top-16 right-4 z-20 flex gap-2 select-none">
      {ratios.map((ratio) => (
        <button key={ratio} className={buttonClass} onClick={() => onAddRatioBox(ratio)}>
          {ratio}
        </button>
      ))}
    </div>
  )
}
