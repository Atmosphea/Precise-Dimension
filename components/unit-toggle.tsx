"use client"

import { useState, useEffect } from "react"
import type { MeasurementUnit } from "@/types/measurement"

interface UnitToggleProps {
  currentUnit: MeasurementUnit
  onUnitChange: (unit: MeasurementUnit) => void
  isDark?: boolean
}

export function UnitToggle({ currentUnit, onUnitChange, isDark = false }: UnitToggleProps) {
  const [isPressed, setIsPressed] = useState(false)
  const [strokeColor, setStrokeColor] = useState("#1E40AF") // Initial blue color

  const units: MeasurementUnit[] = ["vw/vh", "px/px", "em/em", "rem/rem", "pt/pt", "%/%"]

  // Cycle through blue shades for the stroke
  useEffect(() => {
    const blueShades = [
      "#1E40AF", // blue-800
      "#1D4ED8", // blue-700
      "#2563EB", // blue-600
      "#3B82F6", // blue-500
      "#60A5FA", // blue-400
    ]

    const index = units.indexOf(currentUnit) % blueShades.length
    setStrokeColor(blueShades[index])
  }, [currentUnit, units])

  const handleClick = () => {
    setIsPressed(true)

    // Find the next unit in the cycle
    const currentIndex = units.indexOf(currentUnit)
    const nextIndex = (currentIndex + 1) % units.length
    onUnitChange(units[nextIndex])

    // Reset the pressed state after animation
    setTimeout(() => setIsPressed(false), 150)
  }

  return (
    <div className="absolute top-4 left-4 z-20">
      <button
        className={`px-4 py-2 font-medium transition-transform rounded-tr-lg ${isPressed ? "scale-95" : "scale-100"} ${
          isDark
            ? "bg-black text-white border-2 border-transparent animate-rainbow-border"
            : "bg-white text-black border-2 border-black"
        }`}
        onClick={handleClick}
      >
        {currentUnit}
      </button>
    </div>
  )
}
