export function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number) {
  const u = 1 - t
  const tt = t * t
  const uu = u * u
  const uuu = uu * u
  const ttt = tt * t

  let p = uuu * p0 // Initial point
  p += 3 * uu * t * p1 // Control point 1
  p += 3 * u * tt * p2 // Control point 2
  p += ttt * p3 // End point

  return p
}

export function generateGradientPoints(
  numPoints: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number
) {
  const points = []
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints
    const y = cubicBezier(t, p0, p1, p2, p3)
    points.push(y)
  }
  return points
}

function toDOMPrecision(value: number) {
  return value.toFixed(3)
}

function createMaskGradientSteps(points: number[]) {
  const gradientStops = points.map((y, i) => {
    const x = (i / (points.length - 1)) * 100
    return `rgba(255, 255, 255, ${toDOMPrecision(y)}) ${toDOMPrecision(x)}%`
  })

  return gradientStops.join(', ')
}

const bezierPoints = generateGradientPoints(20, 0, 1, 0, 1)
export const maskGradientStepsEaseOutCirc = createMaskGradientSteps(bezierPoints)
console.log(maskGradientStepsEaseOutCirc)
