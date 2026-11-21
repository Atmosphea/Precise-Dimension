"use client"

import type React from "react"
import { HelpPopup } from "@/components/help-popup"

// First, add history state for undo/redo functionality
import { useState, useEffect, useRef, useCallback } from "react"
import { MeasurementCube } from "@/components/measurement-cube"
import { UnitToggle } from "@/components/unit-toggle"
import { TextToggle } from "@/components/text-toggle"
import { TextStyleToggle } from "@/components/text-style-toggle"
import { RatioButtons } from "@/components/ratio-buttons"
import { UndoRedoButtons } from "@/components/undo-redo-buttons"
import { GridToggle, type GridMode } from "@/components/grid-toggle"
import { GridOverlay } from "@/components/grid-overlay"
import type { MeasurementUnit } from "@/types/measurement"
import type { TextStyle } from "@/types/text-style"
import { CanvasSizeToggle, type CanvasSize } from "@/components/canvas-size-toggle"
import { ButtonRow } from "@/components/button-row"

export default function Home() {
  const [cubes, setCubes] = useState<
    Array<{
      id: string
      width: number
      height: number
      x: number
      y: number
      color: string
      showPadding: boolean
      padding: number
      hasText: boolean
      textMargin: number
      textStyle?: TextStyle
      isRatioBox?: boolean
      ratio?: string
      isLocked?: boolean
    }>
  >([])

  // Add history states for undo/redo - fixed implementation
  const [history, setHistory] = useState<(typeof cubes)[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isDragging, setIsDragging] = useState(false)
  const MAX_HISTORY = 20 // Increased maximum history entries

  const [unit, setUnit] = useState<MeasurementUnit>("vw/vh")
  const [isCreating, setIsCreating] = useState(false)
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 })
  const [currentPoint, setCurrentPoint] = useState({ x: 0, y: 0 })
  const [textMode, setTextMode] = useState(false)
  const [textStyle, setTextStyle] = useState<TextStyle>("body")
  const [canvasSize, setCanvasSize] = useState<CanvasSize>("fullscreen")
  const [gridMode, setGridMode] = useState<GridMode>("none")
  const [lockMode, setLockMode] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [isUIHidden, setIsUIHidden] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  // Get container dimensions based on canvas size
  const getContainerDimensions = () => {
    switch (canvasSize) {
      case "iphone":
        return { width: 390, height: 844 }
      case "instagram":
        return { width: 600, height: 800 }
      case "fullscreen":
      default:
        return { width: window.innerWidth, height: window.innerHeight }
    }
  }

  // Initialize with 5 cubes in a horizontal line
  useEffect(() => {
    const containerDimensions = getContainerDimensions()
    const middleY = containerDimensions.height / 2 - 50 // 50px is half the default height
    let currentX = 0

    const initialWidths = [10, 60, 5, 10, 15] // in vw
    const initialCubes = initialWidths.map((width, index) => {
      const widthInPx = (width / 100) * containerDimensions.width
      const cube = {
        id: `cube-${index}`,
        width: width,
        height: 10, // 10vh
        x: currentX,
        y: middleY,
        color: "#FFFFFF",
        showPadding: false,
        padding: 2, // Default padding in vw/vh
        hasText: false,
        textMargin: 1,
        isLocked: false,
      }
      currentX += widthInPx + 20 // 20px spacing
      return cube
    })

    setCubes(initialCubes)
    // Initialize history with initial state
    setHistory([initialCubes])
    setHistoryIndex(0)
  }, [])

  // Fixed history management - only add to history when cubes actually change
  const addToHistory = useCallback(
    (newCubes: typeof cubes) => {
      setHistory((prev) => {
        // Don't add if it's the same as current state
        if (historyIndex >= 0 && JSON.stringify(prev[historyIndex]) === JSON.stringify(newCubes)) {
          return prev
        }

        // Remove any future history if we're not at the end
        const newHistory = prev.slice(0, historyIndex + 1)
        newHistory.push([...newCubes])

        // Limit history to MAX_HISTORY entries
        if (newHistory.length > MAX_HISTORY) {
          newHistory.shift()
          setHistoryIndex(newHistory.length - 1)
          return newHistory
        }

        setHistoryIndex(newHistory.length - 1)
        return newHistory
      })
    },
    [historyIndex],
  )

  // Add to history when cubes change (but not during dragging)
  useEffect(() => {
    if (cubes.length > 0 && !isDragging) {
      addToHistory(cubes)
    }
  }, [cubes, isDragging, addToHistory])

  // Handle keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault()
        if (e.shiftKey) {
          handleRedo()
        } else {
          handleUndo()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      setCubes([...history[newIndex]])
    }
  }, [history, historyIndex])

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      setCubes([...history[newIndex]])
    }
  }, [history, historyIndex])

  // Snap value to grid
  const snapToGrid = (value: number, gridSize = 1): number => {
    return Math.round(value / gridSize) * gridSize
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only create new cube if clicking on the background
    if ((e.target as HTMLElement).id === "container") {
      setIsCreating(true)
      const rect = containerRef.current?.getBoundingClientRect()
      const x = e.clientX - (rect?.left || 0)
      const y = e.clientY - (rect?.top || 0)

      // Snap to grid if grid is enabled
      if (gridMode !== "none") {
        setStartPoint({
          x: snapToGrid(x),
          y: snapToGrid(y),
        })
        setCurrentPoint({
          x: snapToGrid(x),
          y: snapToGrid(y),
        })
      } else {
        setStartPoint({ x, y })
        setCurrentPoint({ x, y })
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isCreating) {
      const rect = containerRef.current?.getBoundingClientRect()
      const x = e.clientX - (rect?.left || 0)
      const y = e.clientY - (rect?.top || 0)

      // Snap to grid if grid is enabled
      if (gridMode !== "none") {
        setCurrentPoint({
          x: snapToGrid(x),
          y: snapToGrid(y),
        })
      } else {
        setCurrentPoint({ x, y })
      }
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isCreating) {
      setIsCreating(false)

      const rect = containerRef.current?.getBoundingClientRect()
      const endX = e.clientX - (rect?.left || 0)
      const endY = e.clientY - (rect?.top || 0)

      // Calculate width and height in viewport units based on container dimensions
      const containerDimensions = getContainerDimensions()

      let width = (Math.abs(endX - startPoint.x) / containerDimensions.width) * 100
      let height = (Math.abs(endY - startPoint.y) / containerDimensions.height) * 100

      // Snap to grid if grid is enabled
      if (gridMode !== "none") {
        width = snapToGrid(width)
        height = snapToGrid(height)
      } else {
        width = Math.round(width)
        height = Math.round(height)
      }

      // Only create if there's a meaningful size
      if (width > 0 && height > 0) {
        let newX = Math.min(startPoint.x, endX)
        let newY = Math.min(startPoint.y, endY)

        // Snap position to grid if grid is enabled
        if (gridMode !== "none") {
          newX = snapToGrid(newX)
          newY = snapToGrid(newY)
        }

        setCubes((prev) => [
          ...prev,
          {
            id: `cube-${Date.now()}`,
            width,
            height,
            x: newX,
            y: newY,
            color: "#FFFFFF",
            showPadding: false,
            padding: 2,
            hasText: textMode, // Add text automatically if text mode is on
            textMargin: 1,
            textStyle: textStyle, // Use current text style
            isRatioBox: false,
            ratio: "",
            isLocked: false,
          },
        ])
      }
    }
  }

  const handleCubeClick = (id: string) => {
    setCubes((prev) => {
      const updatedCubes = prev.map((cube) => {
        if (cube.id === id) {
          // If in lock mode, toggle lock state
          if (lockMode) {
            return {
              ...cube,
              isLocked: !cube.isLocked,
            }
          }

          // If locked and not in lock mode, do nothing
          if (cube.isLocked) {
            return cube
          }

          // If in text mode, add text to the cube with the current text style
          if (textMode) {
            return {
              ...cube,
              hasText: true,
              textMargin: 1,
              textStyle: textStyle,
            }
          } else {
            // Only toggle padding if not in text mode
            // Generate a random pastel terracotta color
            const hue = Math.floor(Math.random() * 30) + 10 // 10-40 range for terracotta
            const saturation = Math.floor(Math.random() * 30) + 60 // 60-90%
            const lightness = Math.floor(Math.random() * 15) + 75 // 75-90%
            const newColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`

            return {
              ...cube,
              color: newColor,
              showPadding: !cube.showPadding,
            }
          }
        }
        return cube
      })

      // If a cube's padding is toggled, adjust other cubes to accommodate (but not locked ones)
      return accommodatePadding(updatedCubes)
    })
  }

  // Function to adjust cube positions based on padding (skip locked cubes)
  const accommodatePadding = (cubes: typeof cubes) => {
    // Create a copy to work with
    const adjustedCubes = [...cubes]
    const containerDimensions = getContainerDimensions()

    // For each cube with padding
    adjustedCubes.forEach((cube, i) => {
      if (cube.showPadding) {
        const paddingInVw = cube.padding

        // Check each other cube for potential overlap
        adjustedCubes.forEach((otherCube, j) => {
          if (i !== j) {
            // Skip if the other cube is being dragged or locked (priority to dragged/locked cube)
            if (otherCube.isDragging || otherCube.isLocked) return

            const cube1Left = cube.x
            const cube1Right = cube.x + (cube.width / 100) * containerDimensions.width
            const cube1Top = cube.y
            const cube1Bottom = cube.y + (cube.height / 100) * containerDimensions.height

            const cube2Left = otherCube.x
            const cube2Right = otherCube.x + (otherCube.width / 100) * containerDimensions.width
            const cube2Top = otherCube.y
            const cube2Bottom = otherCube.y + (otherCube.height / 100) * containerDimensions.height

            // Calculate padding in pixels
            const paddingInPx = (paddingInVw / 100) * containerDimensions.width

            // Check for horizontal overlap
            if (cube1Bottom >= cube2Top && cube1Top <= cube2Bottom) {
              // Cube2 is to the right of cube1
              if (cube2Left >= cube1Left && cube2Left < cube1Right + paddingInPx) {
                // Move cube2 to the right
                adjustedCubes[j] = {
                  ...otherCube,
                  x: cube1Right + paddingInPx,
                }
              }
              // Cube2 is to the left of cube1
              else if (cube2Right > cube1Left - paddingInPx && cube2Right <= cube1Right) {
                // Move cube2 to the left
                const newX = cube1Left - paddingInPx - (cube2Right - cube2Left)
                adjustedCubes[j] = {
                  ...otherCube,
                  x: newX,
                }
              }
            }

            // Check for vertical overlap
            if (cube1Right >= cube2Left && cube1Left <= cube2Right) {
              // Cube2 is below cube1
              if (cube2Top >= cube1Top && cube2Top < cube1Bottom + paddingInPx) {
                // Move cube2 down
                adjustedCubes[j] = {
                  ...otherCube,
                  y: cube1Bottom + paddingInPx,
                }
              }
              // Cube2 is above cube1
              else if (cube2Bottom > cube1Top - paddingInPx && cube2Bottom <= cube1Bottom) {
                // Move cube2 up
                const newY = cube1Top - paddingInPx - (cube2Bottom - cube2Top)
                adjustedCubes[j] = {
                  ...otherCube,
                  y: newY,
                }
              }
            }
          }
        })
      }
    })

    return adjustedCubes
  }

  const handleCubeRemove = (id: string) => {
    setCubes((prev) => prev.filter((cube) => cube.id !== id))
  }

  const handleCubeUpdate = (id: string, updates: Partial<(typeof cubes)[0]>) => {
    if (updates.isDragging !== undefined) {
      setIsDragging(updates.isDragging)
    }

    setCubes((prev) => {
      const updatedCubes = prev.map((cube) => (cube.id === id ? { ...cube, ...updates } : cube))

      // If padding is being updated, adjust other cubes (but not locked ones)
      if (updates.padding !== undefined || updates.showPadding !== undefined) {
        return accommodatePadding(updatedCubes)
      }

      return updatedCubes
    })
  }

  const handleTextRemove = (id: string) => {
    setCubes((prev) => prev.map((cube) => (cube.id === id ? { ...cube, hasText: false } : cube)))
  }

  const handleCubeDuplicate = (id: string) => {
    setCubes((prev) => {
      const originalCube = prev.find((cube) => cube.id === id)
      if (!originalCube) return prev

      // Create a duplicate with slight offset
      const duplicate = {
        ...originalCube,
        id: `cube-${Date.now()}`,
        x: originalCube.x + 20,
        y: originalCube.y + 20,
        isLocked: false, // New cubes are never locked by default
      }

      return [...prev, duplicate]
    })
  }

  const handleAddRatioBox = (ratio: string) => {
    const [widthRatio, heightRatio] = ratio.split(":").map(Number)
    const containerDimensions = getContainerDimensions()

    // Calculate dimensions based on the ratio with larger sizes
    let width, height

    switch (ratio) {
      case "1:1":
        width = 20 // 20% of container width
        height = 20 // 20% of container height
        break
      case "2:3":
        width = 20 // 20vw
        height = 30 // 30vh
        break
      case "4:3":
        width = 40 // 40vw
        height = 30 // 30vh
        break
      case "3:4":
        width = 30 // 30vw
        height = 40 // 40vh
        break
      case "16:9":
        width = 32 // 32vw
        height = 18 // 18vh
        break
      case "9:16":
        width = 18 // 18vw
        height = 32 // 32vh
        break
      default:
        // Fallback for any other ratios
        const baseSize = 20
        if (widthRatio > heightRatio) {
          width = baseSize * (widthRatio / heightRatio)
          height = baseSize
        } else {
          width = baseSize
          height = baseSize * (heightRatio / widthRatio)
        }
    }

    // Position in the center of the container
    const x = containerDimensions.width / 2 - ((width / 100) * containerDimensions.width) / 2
    const y = containerDimensions.height / 2 - ((height / 100) * containerDimensions.height) / 2

    setCubes((prev) => [
      ...prev,
      {
        id: `ratio-${Date.now()}`,
        width,
        height,
        x,
        y,
        color: "#FFFFFF",
        showPadding: false,
        padding: 2,
        hasText: textMode, // Add text if text mode is on
        textMargin: 1,
        textStyle: textStyle,
        isRatioBox: true, // Mark as a ratio box
        ratio: ratio, // Store the ratio
        isLocked: false,
      },
    ])
  }

  const handleToggleGrid = () => {
    // Cycle through grid modes: none -> square -> viewport -> none
    setGridMode((prev) => {
      if (prev === "none") return "square"
      if (prev === "square") return "viewport"
      return "none"
    })
  }

  const handleCanvasSizeChange = (size: CanvasSize) => {
    setCanvasSize(size)
    // Note: We don't modify cube positions anymore - they maintain their static layout
  }

  return (
    <div
      className={`flex justify-center items-center min-h-screen select-none transition-colors duration-300 ${
        isDark ? "bg-gray-900" : "bg-gray-200"
      }`}
    >
      <div
        id="container"
        ref={containerRef}
        className={`relative overflow-hidden transition-all duration-300 select-none ${
          isDark ? "bg-gray-800" : "bg-gray-50"
        }`}
        style={{
          width: canvasSize === "fullscreen" ? "100vw" : canvasSize === "iphone" ? "390px" : "600px",
          height: canvasSize === "fullscreen" ? "100vh" : canvasSize === "iphone" ? "844px" : "800px",
          border: canvasSize !== "fullscreen" ? `2px solid ${isDark ? "#374151" : "#000"}` : "none",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <GridOverlay gridMode={gridMode} />

        {/* UI Controls - Hidden when isUIHidden is true */}
        {!isUIHidden && (
          <>
            <UnitToggle currentUnit={unit} onUnitChange={setUnit} isDark={isDark} />
            <TextToggle isActive={textMode} onToggle={() => setTextMode(!textMode)} isDark={isDark} />
            {textMode && <TextStyleToggle currentStyle={textStyle} onStyleChange={setTextStyle} />}
            <UndoRedoButtons onUndo={handleUndo} onRedo={handleRedo} />
            <CanvasSizeToggle currentSize={canvasSize} onSizeChange={handleCanvasSizeChange} />
            <GridToggle gridMode={gridMode} onToggleGrid={handleToggleGrid} />
            <RatioButtons onAddRatioBox={handleAddRatioBox} isDark={isDark} />
          </>
        )}

        {/* Button Row - Always visible when UI is not hidden */}
        {!isUIHidden && (
          <ButtonRow
            lockMode={lockMode}
            onLockToggle={() => setLockMode(!lockMode)}
            isDark={isDark}
            onThemeToggle={() => setIsDark(!isDark)}
            isUIHidden={isUIHidden}
            onUIToggle={() => setIsUIHidden(!isUIHidden)}
            onHelpClick={() => setShowHelp(true)}
          />
        )}

        {/* Always visible UI Hide Toggle - only show when UI is hidden */}
        {isUIHidden && (
          <div className="absolute top-4 right-4 z-30">
            <button
              className={`px-4 py-2 font-medium border-2 transition-colors rounded-tr-lg ${
                isDark
                  ? "bg-black text-white border-transparent animate-rainbow-border"
                  : "bg-white text-black border-black"
              }`}
              onClick={() => setIsUIHidden(false)}
              title="Show UI"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
          </div>
        )}

        {cubes.map((cube) => (
          <MeasurementCube
            key={cube.id}
            id={cube.id}
            width={cube.width}
            height={cube.height}
            x={cube.x}
            y={cube.y}
            color={cube.color}
            showPadding={cube.showPadding}
            padding={cube.padding}
            hasText={cube.hasText}
            textMargin={cube.textMargin}
            unit={unit}
            textStyle={cube.textStyle || textStyle}
            isRatioBox={cube.isRatioBox}
            ratio={cube.ratio}
            textMode={textMode}
            gridMode={gridMode}
            canvasSize={canvasSize}
            lockMode={lockMode}
            isLocked={cube.isLocked || false}
            isDark={isDark}
            onClick={() => handleCubeClick(cube.id)}
            onRemove={() => handleCubeRemove(cube.id)}
            onTextRemove={() => handleTextRemove(cube.id)}
            onDuplicate={() => handleCubeDuplicate(cube.id)}
            onUpdate={(updates) => handleCubeUpdate(cube.id, updates)}
          />
        ))}

        {isCreating && (
          <div className="absolute pointer-events-none">
            {/* Horizontal ruler */}
            <div
              className={`absolute h-[1px] ${isDark ? "bg-blue-400" : "bg-blue-500"}`}
              style={{
                left: `${Math.min(startPoint.x, currentPoint.x)}px`,
                top: `${startPoint.y}px`,
                width: `${Math.abs(currentPoint.x - startPoint.x)}px`,
              }}
            >
              <span
                className={`absolute top-[-20px] right-0 text-xs px-1 rounded ${
                  isDark ? "bg-gray-800 text-white" : "bg-white text-black"
                }`}
              >
                {Math.round((Math.abs(currentPoint.x - startPoint.x) / getContainerDimensions().width) * 100)}%
              </span>
            </div>

            {/* Vertical ruler */}
            <div
              className={`absolute w-[1px] ${isDark ? "bg-blue-400" : "bg-blue-500"}`}
              style={{
                left: `${startPoint.x}px`,
                top: `${Math.min(startPoint.y, currentPoint.y)}px`,
                height: `${Math.abs(currentPoint.y - startPoint.y)}px`,
              }}
            >
              <span
                className={`absolute bottom-0 left-[5px] text-xs px-1 rounded ${
                  isDark ? "bg-gray-800 text-white" : "bg-white text-black"
                }`}
              >
                {Math.round((Math.abs(currentPoint.y - startPoint.y) / getContainerDimensions().height) * 100)}%
              </span>
            </div>

            {/* Preview rectangle */}
            <div
              className={`absolute border-2 border-dashed bg-opacity-30 ${
                isDark ? "border-blue-400 bg-blue-800" : "border-blue-400 bg-blue-100"
              }`}
              style={{
                left: `${Math.min(startPoint.x, currentPoint.x)}px`,
                top: `${Math.min(startPoint.y, currentPoint.y)}px`,
                width: `${Math.abs(currentPoint.x - startPoint.x)}px`,
                height: `${Math.abs(currentPoint.y - startPoint.y)}px`,
              }}
            />
          </div>
        )}
      </div>

      {/* Help Popup */}
      <HelpPopup isOpen={showHelp} onClose={() => setShowHelp(false)} isDark={isDark} />
    </div>
  )
}
