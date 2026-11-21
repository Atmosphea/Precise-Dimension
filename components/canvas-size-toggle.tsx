"use client"

import { useState } from "react"

export type CanvasSize = "fullscreen" | "iphone" | "instagram"

interface CanvasSizeToggleProps {
  currentSize: CanvasSize
  onSizeChange: (size: CanvasSize) => void
}

export function CanvasSizeToggle({ currentSize, onSizeChange }: CanvasSizeToggleProps) {
  const [isPressed, setIsPressed] = useState(false)

  const sizes: CanvasSize[] = ["fullscreen", "iphone", "instagram"]

  const handleClick = () => {
    setIsPressed(true)

    // Find the next size in the cycle
    const currentIndex = sizes.indexOf(currentSize)
    const nextIndex = (currentIndex + 1) % sizes.length
    onSizeChange(sizes[nextIndex])

    // Reset the pressed state after animation
    setTimeout(() => setIsPressed(false), 150)
  }

  // Display text based on current size
  const getDisplayText = () => {
    switch (currentSize) {
      case "fullscreen":
        return "Full Screen"
      case "iphone":
        return "iPhone"
      case "instagram":
        return "Instagram"
      default:
        return "Full Screen"
    }
  }

  return (
    <div className="absolute top-28 left-24 z-20">
      <button
        className={`px-4 py-2 font-medium border-2 border-black transition-transform rounded-tr-lg ${
          isPressed ? "scale-95" : "scale-100"
        } bg-white`}
        onClick={handleClick}
      >
        {getDisplayText()}
      </button>
    </div>
  )
}
