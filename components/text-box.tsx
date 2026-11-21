"use client"

import type { TextStyle } from "@/types/text-style"

interface TextBoxProps {
  width: number
  height: number
  margin: number
  textStyle: TextStyle
}

export function TextBox({ width, height, margin, textStyle }: TextBoxProps) {
  // Calculate the available space for text
  const textWidth = width - margin * 2
  const textHeight = height - margin * 2

  // Generate sample text that fills the box
  const sampleText = generateSampleText(textWidth, textHeight, textStyle)

  // Set styles based on text style
  let fontSize = "14px"
  let fontWeight = "normal"
  let lineHeight = "1.4"

  switch (textStyle) {
    case "h1":
      fontSize = "24px"
      fontWeight = "bold"
      lineHeight = "1.2"
      break
    case "h3":
      fontSize = "18px"
      fontWeight = "bold"
      lineHeight = "1.3"
      break
    case "body":
    default:
      fontSize = "14px"
      fontWeight = "normal"
      lineHeight = "1.4"
      break
  }

  return (
    <div
      className="absolute overflow-hidden flex items-center justify-center select-none"
      style={{
        width: `${textWidth}px`,
        height: `${textHeight}px`,
        left: `${margin}px`,
        top: `${margin}px`,
        fontSize,
        fontWeight,
        lineHeight,
        color: "#000",
        zIndex: 2,
        padding: "8px",
        backgroundColor: "transparent",
        userSelect: "none",
      }}
    >
      {sampleText}
    </div>
  )
}

function generateSampleText(width: number, height: number, textStyle: TextStyle): string {
  // Adjust character estimation based on text style
  let charsPerLine: number
  let lineHeight: number

  switch (textStyle) {
    case "h1":
      charsPerLine = Math.floor(width / 14) // Larger font = fewer chars per line
      lineHeight = 30
      break
    case "h3":
      charsPerLine = Math.floor(width / 10)
      lineHeight = 24
      break
    case "body":
    default:
      charsPerLine = Math.floor(width / 8)
      lineHeight = 20
      break
  }

  const lines = Math.floor(height / lineHeight)
  const totalChars = charsPerLine * lines

  // Lorem Ipsum text
  const loremIpsum =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam auctor, nisl eget ultricies aliquam, nunc nisl aliquet nunc, vitae aliquam nisl nunc vitae nisl. Sed vitae nisl eget nisl aliquam aliquet. Sed vitae nisl eget nisl aliquam aliquet. "

  // Repeat the text to fill the box
  let result = ""
  while (result.length < totalChars) {
    result += loremIpsum
  }

  return result
}
