"use client"

import { useState } from "react"
import type { TextStyle } from "@/types/text-style"

interface TextStyleToggleProps {
  currentStyle: TextStyle
  onStyleChange: (style: TextStyle) => void
}

export function TextStyleToggle({ currentStyle, onStyleChange }: TextStyleToggleProps) {
  const [isPressed, setIsPressed] = useState(false)

  const styles: TextStyle[] = ["body", "h3", "h1"]

  const handleClick = () => {
    setIsPressed(true)

    // Find the next style in the cycle
    const currentIndex = styles.indexOf(currentStyle)
    const nextIndex = (currentIndex + 1) % styles.length
    onStyleChange(styles[nextIndex])

    // Reset the pressed state after animation
    setTimeout(() => setIsPressed(false), 150)
  }

  // Display text based on current style
  const getDisplayText = () => {
    switch (currentStyle) {
      case "h1":
        return "H1"
      case "h3":
        return "H3"
      case "body":
        return "Body"
      default:
        return "Body"
    }
  }

  return (
    <div className="absolute top-16 left-24 z-20">
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
