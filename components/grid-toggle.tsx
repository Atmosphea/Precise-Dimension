"use client"

import { useState } from "react"

export type GridMode = "none" | "square" | "viewport"

interface GridToggleProps {
  gridMode: GridMode
  onToggleGrid: () => void
}

export function GridToggle({ gridMode, onToggleGrid }: GridToggleProps) {
  const [isPressed, setIsPressed] = useState(false)

  const handleGridClick = () => {
    setIsPressed(true)
    onToggleGrid()
    setTimeout(() => setIsPressed(false), 150)
  }

  // Get display text based on current grid mode
  const getDisplayText = () => {
    switch (gridMode) {
      case "square":
        return "Square Grid"
      case "viewport":
        return "Viewport Grid"
      case "none":
      default:
        return "No Grid"
    }
  }

  return (
    <div className="absolute top-40 left-4 z-20">
      <button
        className={`px-4 py-2 font-medium border-2 border-black transition-transform rounded-tr-lg ${
          isPressed ? "scale-95" : "scale-100"
        } ${gridMode !== "none" ? "bg-blue-500 text-white" : "bg-white text-black"}`}
        onClick={handleGridClick}
      >
        {getDisplayText()}
      </button>
    </div>
  )
}
