"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import type { MeasurementUnit } from "@/types/measurement"
import type { TextStyle } from "@/types/text-style"
import type { GridMode } from "@/components/grid-toggle"
import { convertToUnit, convertFromUnit } from "@/utils/unit-converter"
import { TextBox } from "@/components/text-box"
import { useTouchHandler } from "@/hooks/use-touch-handler"

interface MeasurementCubeProps {
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
  unit: MeasurementUnit
  textStyle: TextStyle
  isRatioBox?: boolean
  ratio?: string
  textMode: boolean
  gridMode: GridMode
  canvasSize: string
  lockMode: boolean
  isLocked: boolean
  isDark: boolean
  onClick: () => void
  onRemove: () => void
  onTextRemove: () => void
  onDuplicate: () => void
  onUpdate: (
    updates: Partial<{
      width: number
      height: number
      x: number
      y: number
      color: string
      showPadding: boolean
      padding: number
      hasText: boolean
      textMargin: number
      isDragging: boolean
      isLocked: boolean
    }>,
  ) => void
}

export function MeasurementCube({
  id,
  width,
  height,
  x,
  y,
  color,
  showPadding,
  padding,
  hasText,
  textMargin,
  unit,
  textStyle,
  isRatioBox = false,
  ratio,
  textMode,
  gridMode,
  canvasSize,
  lockMode,
  isLocked,
  isDark,
  onClick,
  onRemove,
  onTextRemove,
  onDuplicate,
  onUpdate,
}: MeasurementCubeProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeCorner, setResizeCorner] = useState<"tl" | "tr" | "bl" | "br" | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [editingDimension, setEditingDimension] = useState<"width" | "height" | "padding" | "textMargin" | null>(null)
  const [inputValue, setInputValue] = useState("")
  const [isPaddingResizing, setIsPaddingResizing] = useState(false)
  const [paddingResizeEdge, setPaddingResizeEdge] = useState<"top" | "right" | "bottom" | "left" | null>(null)
  const [isTextMarginResizing, setIsTextMarginResizing] = useState(false)
  const [textMarginResizeCorner, setTextMarginResizeCorner] = useState<"tl" | "tr" | "bl" | "br" | null>(null)
  const [showCornerHandles, setShowCornerHandles] = useState(false)
  const [showPaddingHandles, setShowPaddingHandles] = useState(false)
  const [showTextMarginHandles, setShowTextMarginHandles] = useState(false)
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 })
  const [isClickingCenter, setIsClickingCenter] = useState(false)
  const [colorIndex, setColorIndex] = useState(0)

  const cubeRef = useRef<HTMLDivElement>(null)
  const paddingRef = useRef<HTMLDivElement>(null)
  const textMarginRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number; cubeX: number; cubeY: number }>()

  const mouseDownTime = useRef<number>(0)
  const mouseMovedDuringClick = useRef<boolean>(false)

  // Define three colors to cycle through
  const colors = [
    "#FFFFFF", // White
    "hsl(20, 70%, 85%)", // Light terracotta
    "hsl(40, 70%, 85%)", // Light sand
  ]

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

  const containerDimensions = getContainerDimensions()

  // Convert width/height to pixels for rendering using container dimensions
  const widthInPx = (width / 100) * containerDimensions.width
  const heightInPx = (height / 100) * containerDimensions.height
  const paddingInPx = (padding / 100) * containerDimensions.width
  const textMarginInPx = (textMargin / 100) * containerDimensions.width

  // Convert 4vw/4vh to pixels for resize handles using container dimensions
  const resizeHandleWidthPx = (4 / 100) * containerDimensions.width
  const resizeHandleHeightPx = (4 / 100) * containerDimensions.height

  // Display values in the selected unit
  const displayWidth = unit === "vw/vh" ? width : convertToUnit(width, "vw", unit.split("/")[0])
  const displayHeight = unit === "vw/vh" ? height : convertToUnit(height, "vh", unit.split("/")[1])
  const displayPadding = unit === "vw/vh" ? padding : convertToUnit(padding, "vw", unit.split("/")[0])
  const displayTextMargin = unit === "vw/vh" ? textMargin : convertToUnit(textMargin, "vw", unit.split("/")[0])

  // Rainbow gradient for dark theme
  const rainbowBorder = isDark
    ? "linear-gradient(45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)"
    : undefined

  // Touch handler for mobile
  const touchHandler = useTouchHandler({
    onDoubleTap: (e) => {
      e.preventDefault()
      if (!isLocked) {
        onDuplicate()
      }
    },
    onTouchStart: (e) => {
      if (isLocked && !lockMode) return
      handleTouchStart(e)
    },
    onTouchMove: (e) => {
      if (isLocked && !lockMode) return
      handleTouchMove(e)
    },
    onTouchEnd: (e) => {
      if (isLocked && !lockMode) return
      handleTouchEnd(e)
    },
  })

  const handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0]
    const mouseEvent = new MouseEvent("mousedown", {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
    })
    handleMouseDown(mouseEvent as any)
  }

  const handleTouchMove = (e: TouchEvent) => {
    const touch = e.touches[0]
    const mouseEvent = new MouseEvent("mousemove", {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
    })
    handleMouseMove(mouseEvent as any)
  }

  const handleTouchEnd = (e: TouchEvent) => {
    const mouseEvent = new MouseEvent("mouseup", {
      bubbles: true,
    })
    handleMouseUp()
  }

  useEffect(() => {
    if (editingDimension && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editingDimension])

  // Snap value to grid
  const snapToGrid = (value: number, gridSize = 1): number => {
    return Math.round(value / gridSize) * gridSize
  }

  const handleMouseDown = (e: React.MouseEvent | MouseEvent) => {
    e.stopPropagation()
    mouseDownTime.current = Date.now()

    // If locked and not in lock mode, prevent interaction
    if (isLocked && !lockMode) return

    // Check if Alt/Option key is pressed for duplication
    if (e.altKey && !lockMode) {
      onDuplicate()
      return
    }

    // Check if clicking on a resize handle
    const target = e.target as HTMLElement
    if (target.dataset.corner) {
      if (!isRatioBox && !isLocked) {
        setIsResizing(true)
        setResizeCorner(target.dataset.corner as "tl" | "tr" | "bl" | "br")

        // Store initial resize state
        resizeStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          width: widthInPx,
          height: heightInPx,
          cubeX: x,
          cubeY: y,
        }
      }
    } else if (target.dataset.edge) {
      // Handle padding edge resize
      if (showPadding && !isLocked) {
        setIsPaddingResizing(true)
        setPaddingResizeEdge(target.dataset.edge as "top" | "right" | "bottom" | "left")
      }
    } else if (target.dataset.type === "textMargin") {
      if (!isLocked) {
        setIsTextMarginResizing(true)
        setTextMarginResizeCorner(target.dataset.corner as "tl" | "tr" | "bl" | "br")
      }
    } else {
      // Check if clicking near the center of the box
      const rect = cubeRef.current?.getBoundingClientRect()
      if (rect) {
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const clickX = e.clientX
        const clickY = e.clientY

        // If click is within 20% of center, consider it a center click
        const centerThresholdX = rect.width * 0.2
        const centerThresholdY = rect.height * 0.2

        if (Math.abs(clickX - centerX) < centerThresholdX && Math.abs(clickY - centerY) < centerThresholdY) {
          setIsClickingCenter(true)
        } else if (!isLocked) {
          setIsDragging(true)
          onUpdate({ isDragging: true })
          setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          })
        }
      }
    }
  }

  const handleMouseMove = (e: MouseEvent) => {
    // Set flag that mouse moved during this click
    if (isDragging || isResizing || isPaddingResizing || isTextMarginResizing) {
      mouseMovedDuringClick.current = true
    }

    if (isDragging && !isLocked) {
      const newX = e.clientX - dragOffset.x
      const newY = e.clientY - dragOffset.y

      // Snap to grid if grid is enabled
      if (gridMode !== "none") {
        const snappedX = snapToGrid(newX)
        const snappedY = snapToGrid(newY)
        onUpdate({ x: snappedX, y: snappedY })
      } else {
        onUpdate({ x: newX, y: newY })
      }
    } else if (isResizing && resizeCorner && resizeStartRef.current && !isLocked) {
      const startState = resizeStartRef.current
      const deltaX = e.clientX - startState.x
      const deltaY = e.clientY - startState.y

      let newWidth = startState.width
      let newHeight = startState.height
      let newX = startState.cubeX
      let newY = startState.cubeY

      // For ratio boxes, preserve the aspect ratio
      if (isRatioBox && ratio) {
        const [ratioWidth, ratioHeight] = ratio.split(":").map(Number)
        const aspectRatio = ratioWidth / ratioHeight

        // Handle different resize corners
        switch (resizeCorner) {
          case "br":
            newWidth = Math.max(20, startState.width + deltaX)
            newHeight = newWidth / aspectRatio
            break
          case "bl":
            newWidth = Math.max(20, startState.width - deltaX)
            newHeight = newWidth / aspectRatio
            newX = startState.cubeX + deltaX
            break
          case "tr":
            newWidth = Math.max(20, startState.width + deltaX)
            newHeight = newWidth / aspectRatio
            newY = startState.cubeY + (startState.height - newHeight)
            break
          case "tl":
            newWidth = Math.max(20, startState.width - deltaX)
            newHeight = newWidth / aspectRatio
            newX = startState.cubeX + deltaX
            newY = startState.cubeY + (startState.height - newHeight)
            break
        }
      } else {
        // Non-ratio boxes - resize from the selected corner
        switch (resizeCorner) {
          case "br":
            // Bottom-right: expand/contract from top-left
            newWidth = Math.max(20, startState.width + deltaX)
            newHeight = Math.max(20, startState.height + deltaY)
            break
          case "bl":
            // Bottom-left: expand/contract from top-right
            newWidth = Math.max(20, startState.width - deltaX)
            newHeight = Math.max(20, startState.height + deltaY)
            newX = startState.cubeX + deltaX
            break
          case "tr":
            // Top-right: expand/contract from bottom-left
            newWidth = Math.max(20, startState.width + deltaX)
            newHeight = Math.max(20, startState.height - deltaY)
            newY = startState.cubeY + deltaY
            break
          case "tl":
            // Top-left: expand/contract from bottom-right
            newWidth = Math.max(20, startState.width - deltaX)
            newHeight = Math.max(20, startState.height - deltaY)
            newX = startState.cubeX + deltaX
            newY = startState.cubeY + deltaY
            break
        }
      }

      // Convert back to viewport units
      let newWidthVw = (newWidth / containerDimensions.width) * 100
      let newHeightVh = (newHeight / containerDimensions.height) * 100

      // Snap to grid if grid is enabled
      if (gridMode !== "none") {
        newWidthVw = snapToGrid(newWidthVw)
        newHeightVh = snapToGrid(newHeightVh)
        newX = snapToGrid(newX)
        newY = snapToGrid(newY)
      }

      onUpdate({
        width: newWidthVw,
        height: newHeightVh,
        x: newX,
        y: newY,
      })
    } else if (isPaddingResizing && paddingResizeEdge && !isLocked) {
      const rect = cubeRef.current?.getBoundingClientRect()
      if (!rect) return

      // Calculate new padding based on the distance from the cube edge to the mouse
      let newPadding = padding

      switch (paddingResizeEdge) {
        case "right":
          newPadding = Math.max(1, ((e.clientX - rect.right) / containerDimensions.width) * 100)
          break
        case "left":
          newPadding = Math.max(1, ((rect.left - e.clientX) / containerDimensions.width) * 100)
          break
        case "top":
          newPadding = Math.max(1, ((rect.top - e.clientY) / containerDimensions.width) * 100)
          break
        case "bottom":
          newPadding = Math.max(1, ((e.clientY - rect.bottom) / containerDimensions.width) * 100)
          break
      }

      // Snap to grid if grid is enabled
      if (gridMode !== "none") {
        newPadding = snapToGrid(newPadding)
      }

      onUpdate({ padding: newPadding })
    } else if (isTextMarginResizing && textMarginResizeCorner && hasText && !isLocked) {
      const rect = cubeRef.current?.getBoundingClientRect()
      if (!rect) return

      // Calculate new text margin based on mouse position relative to cube
      let newMargin = textMargin

      // For simplicity, we'll adjust the margin uniformly from all sides
      const mouseX = e.clientX
      const mouseY = e.clientY

      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      // Calculate distance from center to mouse
      const distX = Math.abs(mouseX - centerX)
      const distY = Math.abs(mouseY - centerY)

      // Use the smaller of the two distances to determine margin
      const dist = Math.min(distX, distY)

      // Convert to vw
      newMargin = Math.max(0, Math.min(width / 2, (dist / containerDimensions.width) * 100))

      // Snap to grid if grid is enabled
      if (gridMode !== "none") {
        newMargin = snapToGrid(newMargin)
      }

      onUpdate({ textMargin: newMargin })
    }
  }

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false)
      onUpdate({ isDragging: false })
    }

    if (isClickingCenter) {
      setIsClickingCenter(false)

      if (lockMode) {
        // Toggle lock state
        onUpdate({ isLocked: !isLocked })
      } else if (!isLocked) {
        // Cycle to the next color
        const nextColorIndex = (colorIndex + 1) % colors.length
        setColorIndex(nextColorIndex)

        // Toggle padding with 2vw default
        onUpdate({
          showPadding: !showPadding,
          padding: showPadding ? padding : 2, // Set to 2vw if enabling padding
          color: colors[nextColorIndex],
        })
      }
    }

    setIsResizing(false)
    setResizeCorner(null)
    setIsPaddingResizing(false)
    setPaddingResizeEdge(null)
    setIsTextMarginResizing(false)
    setTextMarginResizeCorner(null)
    resizeStartRef.current = undefined

    // Reset the movement flag after a short delay
    setTimeout(() => {
      mouseMovedDuringClick.current = false
    }, 10)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (isLocked) return

    if (hasText) {
      onTextRemove()
    } else {
      onRemove()
    }
  }

  const handleDimensionClick = (dimension: "width" | "height" | "padding" | "textMargin", e: React.MouseEvent) => {
    e.stopPropagation()
    if (isLocked) return

    setEditingDimension(dimension)

    if (dimension === "width") {
      setInputValue(displayWidth.toString())
    } else if (dimension === "height") {
      setInputValue(displayHeight.toString())
    } else if (dimension === "padding") {
      setInputValue(displayPadding.toString())
    } else if (dimension === "textMargin") {
      setInputValue(displayTextMargin.toString())
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
  }

  const handleInputBlur = () => {
    applyDimensionChange()
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      applyDimensionChange()
    } else if (e.key === "Escape") {
      setEditingDimension(null)
    }
  }

  const applyDimensionChange = () => {
    if (editingDimension && !isLocked) {
      const value = Number.parseInt(inputValue)
      if (!isNaN(value) && value > 0) {
        if (editingDimension === "width" && !isRatioBox) {
          const newWidth = unit === "vw/vh" ? value : convertFromUnit(value, unit.split("/")[0], "vw")
          onUpdate({ width: Math.round(newWidth) })
        } else if (editingDimension === "height" && !isRatioBox) {
          const newHeight = unit === "vw/vh" ? value : convertFromUnit(value, unit.split("/")[1], "vh")
          onUpdate({ height: Math.round(newHeight) })
        } else if (editingDimension === "padding") {
          const newPadding = unit === "vw/vh" ? value : convertFromUnit(value, unit.split("/")[0], "vw")
          onUpdate({ padding: Math.round(newPadding) })
        } else if (editingDimension === "textMargin") {
          const newMargin = unit === "vw/vh" ? value : convertFromUnit(value, unit.split("/")[0], "vw")
          onUpdate({ textMargin: Math.round(newMargin) })
        }
      }
      setEditingDimension(null)
    }
  }

  // Handle hover to show corner handles only when near corners (within 6%)
  const handleCubeHover = (e: React.MouseEvent) => {
    if (!cubeRef.current || isLocked) return

    const rect = cubeRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setHoverPosition({ x, y })

    // Calculate corner threshold (6% of width/height)
    const thresholdX = rect.width * 0.06
    const thresholdY = rect.height * 0.06

    // Check if hovering near any corner
    const nearTopLeft = x <= thresholdX && y <= thresholdY
    const nearTopRight = x >= rect.width - thresholdX && y <= thresholdY
    const nearBottomLeft = x <= thresholdX && y >= rect.height - thresholdY
    const nearBottomRight = x >= rect.width - thresholdX && y >= rect.height - thresholdY

    setShowCornerHandles(nearTopLeft || nearTopRight || nearBottomLeft || nearBottomRight)
  }

  useEffect(() => {
    if (isDragging || isResizing || isPaddingResizing || isTextMarginResizing) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
      return () => {
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
      }
    }

    if (isClickingCenter) {
      window.addEventListener("mouseup", handleMouseUp)
      return () => {
        window.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [
    isDragging,
    isResizing,
    resizeCorner,
    isPaddingResizing,
    paddingResizeEdge,
    isTextMarginResizing,
    textMarginResizeCorner,
    isClickingCenter,
  ])

  // Add touch event listeners
  useEffect(() => {
    const element = cubeRef.current
    if (!element) return

    element.addEventListener("touchstart", touchHandler.handleTouchStart, { passive: false })
    element.addEventListener("touchmove", touchHandler.handleTouchMove, { passive: false })
    element.addEventListener("touchend", touchHandler.handleTouchEnd, { passive: false })

    return () => {
      element.removeEventListener("touchstart", touchHandler.handleTouchStart)
      element.removeEventListener("touchmove", touchHandler.handleTouchMove)
      element.removeEventListener("touchend", touchHandler.handleTouchEnd)
    }
  }, [touchHandler])

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()

    // Check if this was a quick click (less than 200ms) and mouse didn't move much
    const clickDuration = Date.now() - mouseDownTime.current
    if (clickDuration < 200 && !mouseMovedDuringClick.current && !isClickingCenter) {
      onClick()
    }

    // Reset the flag
    mouseMovedDuringClick.current = false
  }

  // Determine cursor style based on text mode and lock state
  const getCursorStyle = () => {
    if (isLocked && !lockMode) return "not-allowed"
    if (textMode && !hasText) return "text"
    return "move"
  }

  // Get border style based on theme and lock state
  const getBorderStyle = () => {
    if (isLocked) {
      return isDark ? "3px solid #fbbf24" : "3px solid #f59e0b" // Yellow for locked
    }
    if (isDark) {
      return "3px solid transparent"
    }
    return "3px solid #000"
  }

  const getBackgroundStyle = () => {
    if (isDark) {
      return {
        backgroundColor: "#000000", // Black fill in dark mode
        border: getBorderStyle(),
        borderImage: isLocked
          ? undefined
          : "linear-gradient(45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3) 1",
        animation: isLocked ? undefined : "rainbow-border 3s linear infinite",
      }
    }
    return {
      backgroundColor: color,
      border: getBorderStyle(),
    }
  }

  return (
    <>
      <div
        ref={cubeRef}
        className="absolute select-none"
        style={{
          width: `${widthInPx}px`,
          height: `${heightInPx}px`,
          left: `${x}px`,
          top: `${y}px`,
          ...getBackgroundStyle(),
          transition: "all 0.3s ease",
          zIndex: isDragging || isResizing ? 10 : 1,
          cursor: getCursorStyle(),
          opacity: isLocked ? 0.8 : 1,
        }}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseMove={handleCubeHover}
        onMouseLeave={() => setShowCornerHandles(false)}
      >
        {hasText && <TextBox width={widthInPx} height={heightInPx} margin={textMarginInPx} textStyle={textStyle} />}

        {/* Lock indicator */}
        {isLocked && <div className="absolute top-1 right-1 text-xs">🔒</div>}

        {/* Ratio label for ratio boxes - only show for boxes created with ratio buttons */}
        {isRatioBox && ratio && (
          <div
            className={`absolute top-1 left-1 text-xs font-mono px-1 rounded select-none ${
              isDark ? "bg-white text-black" : "bg-black text-white"
            }`}
          >
            {ratio}
          </div>
        )}

        {/* Width dimension */}
        <div
          className={`absolute bottom-0 left-1/2 transform -translate-x-1/2 -translate-y-2 cursor-pointer px-1 text-xs select-none ${
            isDark ? "bg-gray-800 text-white border border-gray-600" : "bg-white text-black"
          }`}
          onClick={(e) => handleDimensionClick("width", e)}
        >
          {editingDimension === "width" ? (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              className={`w-12 text-center ${isDark ? "bg-gray-700 text-white" : "bg-white text-black"}`}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            `${Math.round(displayWidth)}${unit.split("/")[0]}`
          )}
        </div>

        {/* Height dimension */}
        <div
          className={`absolute top-1/2 right-0 transform translate-x-2 -translate-y-1/2 cursor-pointer px-1 text-xs select-none ${
            isDark ? "bg-gray-800 text-white border border-gray-600" : "bg-white text-black"
          }`}
          onClick={(e) => handleDimensionClick("height", e)}
          style={{ writingMode: "vertical-rl" }}
        >
          {editingDimension === "height" ? (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              className={`h-12 text-center ${isDark ? "bg-gray-700 text-white" : "bg-white text-black"}`}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            `${Math.round(displayHeight)}${unit.split("/")[1]}`
          )}
        </div>

        {/* Resize handles with triangle gradients - smoother fade-in animation */}
        {showCornerHandles && !isLocked && (
          <>
            <div
              data-corner="tl"
              className="absolute cursor-nwse-resize transition-all duration-500 ease-out opacity-100"
              style={{
                width: `${resizeHandleWidthPx}px`,
                height: `${resizeHandleHeightPx}px`,
                top: 0,
                left: 0,
                background: isDark
                  ? "linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.3) 50%, transparent 100%)"
                  : "linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)",
                transform: showCornerHandles ? "scale(1)" : "scale(0.8)",
              }}
            />
            <div
              data-corner="tr"
              className="absolute cursor-nesw-resize transition-all duration-500 ease-out opacity-100"
              style={{
                width: `${resizeHandleWidthPx}px`,
                height: `${resizeHandleHeightPx}px`,
                top: 0,
                right: 0,
                background: isDark
                  ? "linear-gradient(225deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.3) 50%, transparent 100%)"
                  : "linear-gradient(225deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)",
                transform: showCornerHandles ? "scale(1)" : "scale(0.8)",
              }}
            />
            <div
              data-corner="bl"
              className="absolute cursor-nesw-resize transition-all duration-500 ease-out opacity-100"
              style={{
                width: `${resizeHandleWidthPx}px`,
                height: `${resizeHandleHeightPx}px`,
                bottom: 0,
                left: 0,
                background: isDark
                  ? "linear-gradient(45deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.3) 50%, transparent 100%)"
                  : "linear-gradient(45deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)",
                transform: showCornerHandles ? "scale(1)" : "scale(0.8)",
              }}
            />
            <div
              data-corner="br"
              className="absolute cursor-nwse-resize transition-all duration-500 ease-out opacity-100"
              style={{
                width: `${resizeHandleWidthPx}px`,
                height: `${resizeHandleHeightPx}px`,
                bottom: 0,
                right: 0,
                background: isDark
                  ? "linear-gradient(315deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.3) 50%, transparent 100%)"
                  : "linear-gradient(315deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)",
                transform: showCornerHandles ? "scale(1)" : "scale(0.8)",
              }}
            />
          </>
        )}
      </div>

      {/* Padding box */}
      {showPadding && (
        <div
          ref={paddingRef}
          className={`absolute border-2 border-dotted pointer-events-none select-none ${
            isDark ? "border-blue-400" : "border-blue-500"
          }`}
          style={{
            width: `${widthInPx + paddingInPx * 2}px`,
            height: `${heightInPx + paddingInPx * 2}px`,
            left: `${x - paddingInPx}px`,
            top: `${y - paddingInPx}px`,
            zIndex: 0,
          }}
          onMouseEnter={() => setShowPaddingHandles(true)}
          onMouseLeave={() => setShowPaddingHandles(false)}
        >
          {/* Padding dimension display */}
          <div
            className={`absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-5 cursor-pointer px-1 text-xs select-none ${
              isDark ? "bg-gray-800 text-white" : "bg-white text-black"
            }`}
            onClick={(e) => handleDimensionClick("padding", e)}
          >
            {editingDimension === "padding" ? (
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                className={`w-12 text-center ${isDark ? "bg-gray-700 text-white" : "bg-white text-black"}`}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              `${Math.round(displayPadding)}${unit.split("/")[0]}`
            )}
          </div>

          {/* Padding resize edges - allow resizing from any edge */}
          {!isLocked && (
            <>
              <div
                data-edge="top"
                className="absolute left-0 right-0 h-2 top-0 cursor-ns-resize pointer-events-auto"
                onMouseDown={handleMouseDown}
              />
              <div
                data-edge="right"
                className="absolute top-0 bottom-0 w-2 right-0 cursor-ew-resize pointer-events-auto"
                onMouseDown={handleMouseDown}
              />
              <div
                data-edge="bottom"
                className="absolute left-0 right-0 h-2 bottom-0 cursor-ns-resize pointer-events-auto"
                onMouseDown={handleMouseDown}
              />
              <div
                data-edge="left"
                className="absolute top-0 bottom-0 w-2 left-0 cursor-ew-resize pointer-events-auto"
                onMouseDown={handleMouseDown}
              />
            </>
          )}
        </div>
      )}

      {/* Text margin box */}
      {hasText && (
        <div
          ref={textMarginRef}
          className={`absolute border-2 border-dotted pointer-events-none select-none ${
            isDark ? "border-gray-400" : "border-white"
          }`}
          style={{
            width: `${widthInPx - textMarginInPx * 2}px`,
            height: `${heightInPx - textMarginInPx * 2}px`,
            left: `${x + textMarginInPx}px`,
            top: `${y + textMarginInPx}px`,
            zIndex: 2,
          }}
          onMouseEnter={() => setShowTextMarginHandles(true)}
          onMouseLeave={() => setShowTextMarginHandles(false)}
        >
          {/* Text margin dimension display */}
          <div
            className={`absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-5 cursor-pointer px-1 text-xs select-none ${
              isDark ? "bg-gray-800 text-white" : "bg-white text-black"
            }`}
            onClick={(e) => handleDimensionClick("textMargin", e)}
          >
            {editingDimension === "textMargin" ? (
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                className={`w-12 text-center ${isDark ? "bg-gray-700 text-white" : "bg-white text-black"}`}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              `${Math.round(displayTextMargin)}${unit.split("/")[0]}`
            )}
          </div>

          {/* Text margin resize handles - only show on hover with fade-in animation */}
          {showTextMarginHandles && !isLocked && (
            <>
              <div
                data-corner="tl"
                data-type="textMargin"
                className="absolute cursor-nwse-resize transition-all duration-500 ease-out opacity-100 pointer-events-auto"
                style={{
                  width: `${resizeHandleWidthPx}px`,
                  height: `${resizeHandleHeightPx}px`,
                  top: 0,
                  left: 0,
                  background: isDark
                    ? "linear-gradient(135deg, rgba(100,100,100,0.6) 0%, rgba(100,100,100,0.3) 50%, transparent 100%)"
                    : "linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
                  transform: showTextMarginHandles ? "scale(1)" : "scale(0.8)",
                }}
                onMouseDown={handleMouseDown}
              />
              <div
                data-corner="tr"
                data-type="textMargin"
                className="absolute cursor-nesw-resize transition-all duration-500 ease-out opacity-100 pointer-events-auto"
                style={{
                  width: `${resizeHandleWidthPx}px`,
                  height: `${resizeHandleHeightPx}px`,
                  top: 0,
                  right: 0,
                  background: isDark
                    ? "linear-gradient(225deg, rgba(100,100,100,0.6) 0%, rgba(100,100,100,0.3) 50%, transparent 100%)"
                    : "linear-gradient(225deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
                  transform: showTextMarginHandles ? "scale(1)" : "scale(0.8)",
                }}
                onMouseDown={handleMouseDown}
              />
              <div
                data-corner="bl"
                data-type="textMargin"
                className="absolute cursor-nesw-resize transition-all duration-500 ease-out opacity-100 pointer-events-auto"
                style={{
                  width: `${resizeHandleWidthPx}px`,
                  height: `${resizeHandleHeightPx}px`,
                  bottom: 0,
                  left: 0,
                  background: isDark
                    ? "linear-gradient(45deg, rgba(100,100,100,0.6) 0%, rgba(100,100,100,0.3) 50%, transparent 100%)"
                    : "linear-gradient(45deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
                  transform: showTextMarginHandles ? "scale(1)" : "scale(0.8)",
                }}
                onMouseDown={handleMouseDown}
              />
              <div
                data-corner="br"
                data-type="textMargin"
                className="absolute cursor-nwse-resize transition-all duration-500 ease-out opacity-100 pointer-events-auto"
                style={{
                  width: `${resizeHandleWidthPx}px`,
                  height: `${resizeHandleHeightPx}px`,
                  bottom: 0,
                  right: 0,
                  background: isDark
                    ? "linear-gradient(315deg, rgba(100,100,100,0.6) 0%, rgba(100,100,100,0.3) 50%, transparent 100%)"
                    : "linear-gradient(315deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
                  transform: showTextMarginHandles ? "scale(1)" : "scale(0.8)",
                }}
                onMouseDown={handleMouseDown}
              />
            </>
          )}
        </div>
      )}
    </>
  )
}
