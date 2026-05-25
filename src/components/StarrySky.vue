<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const canvasRef = ref(null)

let animationFrameId = 0
let stars = []
let meteors = []
let resizeHandler = null

function createStar(canvas) {
  return {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    radius: Math.random() * 1.7 + 0.3,
    speed: Math.random() * 0.25 + 0.03,
    drift: (Math.random() - 0.5) * 0.25,
    twinkle: Math.random() * Math.PI * 2
  }
}

function createMeteor(canvas) {
  const edge = Math.floor(Math.random() * 4)
  const size = Math.random() * 1.6 + 1.2

  let x
  let y
  let vx
  let vy

  if (edge === 0) {
    x = Math.random() * canvas.width
    y = -20
    vx = Math.random() * 3 + 2
    vy = Math.random() * 3 + 3
  } else if (edge === 1) {
    x = canvas.width + 20
    y = Math.random() * canvas.height * 0.55
    vx = -(Math.random() * 3 + 2)
    vy = Math.random() * 3 + 3
  } else if (edge === 2) {
    x = Math.random() * canvas.width
    y = canvas.height + 20
    vx = Math.random() * 2.5 + 1.5
    vy = -(Math.random() * 3 + 2.5)
  } else {
    x = -20
    y = Math.random() * canvas.height * 0.5
    vx = Math.random() * 3 + 2
    vy = Math.random() * 3 + 3
  }

  return {
    x,
    y,
    vx,
    vy,
    size,
    life: 0,
    maxLife: Math.floor(Math.random() * 70) + 50
  }
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return

  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  canvas.style.width = `${window.innerWidth}px`
  canvas.style.height = `${window.innerHeight}px`

  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  stars = Array.from({ length: Math.min(220, Math.floor((window.innerWidth * window.innerHeight) / 9000)) }, () =>
    createStar(canvas)
  )
  meteors = Array.from({ length: 3 }, () => createMeteor(canvas))
}

function drawBackground(ctx, width, height) {
  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.3, 0, width * 0.5, height * 0.4, Math.max(width, height))
  gradient.addColorStop(0, '#1e3a8a')
  gradient.addColorStop(0.45, '#0f172a')
  gradient.addColorStop(1, '#020617')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  const glow = ctx.createRadialGradient(width * 0.78, height * 0.18, 0, width * 0.78, height * 0.18, width * 0.22)
  glow.addColorStop(0, 'rgba(56, 189, 248, 0.22)')
  glow.addColorStop(0.5, 'rgba(59, 130, 246, 0.12)')
  glow.addColorStop(1, 'rgba(15, 23, 42, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)
}

function drawConstellation(ctx, width, height, time) {
  const points = [
    { x: width * 0.18, y: height * 0.2 },
    { x: width * 0.26, y: height * 0.16 },
    { x: width * 0.37, y: height * 0.24 },
    { x: width * 0.48, y: height * 0.18 },
    { x: width * 0.58, y: height * 0.27 },
    { x: width * 0.69, y: height * 0.22 },
    { x: width * 0.8, y: height * 0.3 }
  ]

  ctx.save()
  ctx.lineWidth = 1.2
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.22)'
  ctx.fillStyle = 'rgba(224, 242, 254, 0.9)'
  ctx.beginPath()

  points.forEach((point, index) => {
    const x = point.x + Math.sin(time * 0.0012 + index) * 2
    const y = point.y + Math.cos(time * 0.001 + index * 0.7) * 1.5

    if (index === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  })
  ctx.stroke()

  points.forEach((point, index) => {
    ctx.globalAlpha = 0.75 + Math.sin(time * 0.004 + index) * 0.25
    ctx.beginPath()
    ctx.arc(point.x, point.y, 2.2, 0, Math.PI * 2)
    ctx.fill()
  })

  ctx.restore()
}

function drawStars(ctx, width, height, time) {
  ctx.save()
  ctx.fillStyle = '#e0f2fe'

  for (const star of stars) {
    star.twinkle += 0.02 + star.speed * 0.08
    star.x += Math.sin(time * 0.0004 + star.y * 0.01) * star.drift
    star.y += star.speed

    if (star.y > height + 4) {
      star.y = -4
      star.x = Math.random() * width
    }
    if (star.x > width + 4) star.x = -4
    if (star.x < -4) star.x = width + 4

    const alpha = 0.35 + Math.sin(star.twinkle) * 0.35
    ctx.globalAlpha = Math.max(0.12, alpha)
    ctx.beginPath()
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

function drawMeteors(ctx, width, height) {
  ctx.save()
  ctx.lineCap = 'round'

  for (let i = 0; i < meteors.length; i += 1) {
    const meteor = meteors[i]
    meteor.x += meteor.vx
    meteor.y += meteor.vy
    meteor.life += 1

    const fade = 1 - meteor.life / meteor.maxLife
    const trailLength = 42 + meteor.size * 18

    ctx.globalAlpha = Math.max(0, fade)
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.92)'
    ctx.lineWidth = meteor.size
    ctx.beginPath()
    ctx.moveTo(meteor.x, meteor.y)
    ctx.lineTo(meteor.x - meteor.vx * trailLength * 0.25, meteor.y - meteor.vy * trailLength * 0.25)
    ctx.stroke()

    ctx.globalAlpha = Math.max(0, fade * 0.65)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)'
    ctx.lineWidth = meteor.size * 1.8
    ctx.beginPath()
    ctx.moveTo(meteor.x, meteor.y)
    ctx.lineTo(meteor.x - meteor.vx * trailLength * 0.55, meteor.y - meteor.vy * trailLength * 0.55)
    ctx.stroke()

    if (
      meteor.life > meteor.maxLife ||
      meteor.x < -80 ||
      meteor.y > height + 80 ||
      meteor.x > width + 80 ||
      meteor.y < -80
    ) {
      meteors[i] = createMeteor(canvasRef.value)
    }
  }

  ctx.restore()
}

function animate(time) {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  const width = window.innerWidth
  const height = window.innerHeight

  drawBackground(ctx, width, height)
  drawConstellation(ctx, width, height, time)
  drawStars(ctx, width, height, time)
  drawMeteors(ctx, width, height)

  animationFrameId = window.requestAnimationFrame(animate)
}

onMounted(() => {
  resizeCanvas()
  animate(performance.now())
  resizeHandler = () => resizeCanvas()
  window.addEventListener('resize', resizeHandler)
})

onBeforeUnmount(() => {
  window.cancelAnimationFrame(animationFrameId)
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
  }
})
</script>

<template>
  <canvas ref="canvasRef" class="star-canvas" aria-hidden="true"></canvas>
  <div class="star-overlay"></div>
</template>
