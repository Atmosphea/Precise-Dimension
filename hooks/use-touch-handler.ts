"use client"

import { useCallback, useRef } from "react"

interface TouchHandlerOptions {
  onTouchStart?: (e: TouchEvent) => void
  onTouchMove?: (e: TouchEvent) => void
  onTouchEnd?: (e: TouchEvent) => void
  onPinch?: (scale: number) => void
  onDoubleTap?: (e: TouchEvent) => void
}

export function useTouchHandler(options: TouchHandlerOptions) {
  const lastTouchRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const initialDistanceRef = useRef<number>(0)
  const isMultiTouchRef = useRef<boolean>(false)

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      const touch = e.touches[0]
      const now = Date.now()

      if (e.touches.length === 2) {
        // Multi-touch for pinch
        isMultiTouchRef.current = true
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        initialDistanceRef.current = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) + Math.pow(touch2.clientY - touch1.clientY, 2),
        )
      } else {
        isMultiTouchRef.current = false

        // Check for double tap
        if (
          lastTouchRef.current &&
          now - lastTouchRef.current.time < 300 &&
          Math.abs(touch.clientX - lastTouchRef.current.x) < 50 &&
          Math.abs(touch.clientY - lastTouchRef.current.y) < 50
        ) {
          options.onDoubleTap?.(e)
        }

        lastTouchRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: now,
        }
      }

      options.onTouchStart?.(e)
    },
    [options],
  )

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length === 2 && isMultiTouchRef.current) {
        // Handle pinch
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        const currentDistance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) + Math.pow(touch2.clientY - touch1.clientY, 2),
        )

        if (initialDistanceRef.current > 0) {
          const scale = currentDistance / initialDistanceRef.current
          options.onPinch?.(scale)
        }
      }

      options.onTouchMove?.(e)
    },
    [options],
  )

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length === 0) {
        isMultiTouchRef.current = false
        initialDistanceRef.current = 0
      }

      options.onTouchEnd?.(e)
    },
    [options],
  )

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  }
}
