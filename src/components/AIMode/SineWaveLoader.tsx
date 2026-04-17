import { useEffect, useRef } from 'react'

export function SineWaveLoader({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cols = 12
    const rows = 3
    const cellSize = 12
    const gap = 1
    const totalWidth = cols * (cellSize + gap) - gap
    const totalHeight = rows * (cellSize + gap) - gap

    canvas.width = totalWidth
    canvas.height = totalHeight

    const baseColor = { r: 65, g: 150, b: 228 }
    const opacityLevels = [1, 0.75, 0.5, 0.25, 0.1]

    let offset = 0

    function draw() {
      if (!ctx) return
      ctx.clearRect(0, 0, totalWidth, totalHeight)

      for (let col = 0; col < cols; col++) {
        const wave = Math.sin((col + offset) * 0.5) * 1 + 1

        for (let row = 0; row < rows; row++) {
          const distance = Math.abs(row - wave)
          const opacityIndex = Math.min(
            Math.floor(distance * 1.5),
            opacityLevels.length - 1
          )
          const opacity = opacityLevels[opacityIndex]

          const x = col * (cellSize + gap)
          const y = row * (cellSize + gap)

          ctx.fillStyle = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${opacity})`
          ctx.fillRect(x, y, cellSize, cellSize)
        }
      }

      offset += 0.08
      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animationRef.current)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} />
}
