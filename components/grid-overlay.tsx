"use client"

import type { GridMode } from "@/components/grid-toggle"

interface GridOverlayProps {
  gridMode: GridMode
}

export function GridOverlay({ gridMode }: GridOverlayProps) {
  if (gridMode === "none") return null

  // Create a grid based on the selected mode
  const gridCells = []

  if (gridMode === "square") {
    // Create square grid cells (equal width and height)
    for (let i = 0; i <= 100; i++) {
      gridCells.push(
        <div
          key={`vertical-${i}`}
          className="absolute top-0 h-full bg-gray-400"
          style={{
            left: `${i}vw`,
            width: "1px",
            opacity: i % 10 === 0 ? 0.4 : 0.25,
          }}
        />,
      )

      gridCells.push(
        <div
          key={`horizontal-${i}`}
          className="absolute left-0 w-full bg-gray-400"
          style={{
            top: `${i}vh`,
            height: "1px",
            opacity: i % 10 === 0 ? 0.4 : 0.25,
          }}
        />,
      )
    }
  } else if (gridMode === "viewport") {
    // Standard grid with 1vw x 1vh cells
    for (let i = 0; i <= 100; i++) {
      gridCells.push(
        <div
          key={`vertical-${i}`}
          className="absolute top-0 h-full bg-gray-400"
          style={{
            left: `${i}vw`,
            width: "1px",
            opacity: i % 10 === 0 ? 0.4 : 0.25,
          }}
        />,
      )

      gridCells.push(
        <div
          key={`horizontal-${i}`}
          className="absolute left-0 w-full bg-gray-400"
          style={{
            top: `${i}vh`,
            height: "1px",
            opacity: i % 10 === 0 ? 0.4 : 0.25,
          }}
        />,
      )
    }
  }

  return <div className="absolute inset-0 pointer-events-none z-0 select-none">{gridCells}</div>
}
