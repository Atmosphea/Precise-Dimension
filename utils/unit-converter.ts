// Convert from one unit to another
export function convertToUnit(value: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return value

  // Convert to pixels first
  let valueInPx = 0

  switch (fromUnit) {
    case "vw":
      valueInPx = (value / 100) * window.innerWidth
      break
    case "vh":
      valueInPx = (value / 100) * window.innerHeight
      break
    case "px":
      valueInPx = value
      break
    case "%":
      valueInPx = (value / 100) * window.innerWidth // Assuming % of viewport width
      break
    case "em":
      valueInPx = value * 16 // Assuming 1em = 16px
      break
    case "rem":
      valueInPx = value * 16 // Assuming 1rem = 16px
      break
    case "pt":
      valueInPx = value * (4 / 3) // 1pt = 1.333px
      break
    default:
      return value
  }

  // Convert from pixels to target unit
  switch (toUnit) {
    case "vw":
      return (valueInPx / window.innerWidth) * 100
    case "vh":
      return (valueInPx / window.innerHeight) * 100
    case "px":
      return valueInPx
    case "%":
      return (valueInPx / window.innerWidth) * 100
    case "em":
      return valueInPx / 16
    case "rem":
      return valueInPx / 16
    case "pt":
      return valueInPx * (3 / 4)
    default:
      return valueInPx
  }
}

// Convert from a unit to viewport units
export function convertFromUnit(value: number, fromUnit: string, toUnit: string): number {
  return convertToUnit(value, fromUnit, toUnit)
}
