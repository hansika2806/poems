const TAU = Math.PI * 2;

const COLORS = [
  { fill: [247, 196, 91], glow: [157, 78, 28] },
  { fill: [238, 171, 67], glow: [132, 61, 32] },
  { fill: [255, 214, 115], glow: [176, 91, 25] }
];

let canvas;
let context;
let frameId = 0;
let lastTime = 0;
let resizeHandler;
let pointerHandler;
let visibilityHandler;
let motionQuery;
let motionHandler;
let fireflies = [];
let viewport = { width: 0, height: 0, dpr: 1 };
const pointer = { x: 0, y: 0, active: false };

const random = (min, max) => Math.random() * (max - min) + min;
const choose = (items) => items[Math.floor(Math.random() * items.length)];
const distance = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

class Firefly {
  constructor(width, height) {
    this.radius = random(1.5, 4.6);
    this.x = random(this.radius, Math.max(this.radius, width - this.radius));
    this.y = random(this.radius, Math.max(this.radius, height - this.radius));
    this.angle = random(0, TAU);
    this.speed = random(7, 18);
    this.wander = random(0.2, 0.55);
    this.phase = random(0, TAU);
    this.pulseSpeed = random(0.7, 1.35);
    this.flicker = random(0, 1);
    this.color = choose(COLORS);
  }

  update(width, height, delta, now) {
    this.angle += random(-this.wander, this.wander) * delta;

    if (this.x < 70) this.angle += 0.24 * delta;
    if (this.x > width - 70) this.angle += Math.PI * delta / 7;
    if (this.y < 60) this.angle += Math.PI * delta / 8;
    if (this.y > height - 60) this.angle -= Math.PI * delta / 8;

    if (pointer.active) {
      const radius = 170;
      const gap = distance(this.x, this.y, pointer.x, pointer.y);
      if (gap > 2 && gap < radius) {
        const strength = ((radius - gap) / radius) * 22 * delta;
        this.x += ((this.x - pointer.x) / gap) * strength;
        this.y += ((this.y - pointer.y) / gap) * strength;
        this.angle += random(-0.18, 0.18) * delta;
      }
    }

    this.x += Math.cos(this.angle) * this.speed * delta;
    this.y += Math.sin(this.angle * 0.82) * this.speed * delta;

    if (this.x < -this.radius) this.x = width + this.radius;
    if (this.x > width + this.radius) this.x = -this.radius;
    if (this.y < -this.radius) this.y = height + this.radius;
    if (this.y > height + this.radius) this.y = -this.radius;

    const pulse = (Math.sin((now / 1000) * this.pulseSpeed + this.phase) + 1) / 2;
    if (Math.random() > 0.988) this.flicker = random(0.35, 1.15);
    this.flicker += (1 - this.flicker) * Math.min(1, delta * 4);
    this.opacity = 0.28 + (pulse * 0.72 * this.flicker);
  }

  draw(isPaperRoom = false) {
    const [fillR, fillG, fillB] = this.color.fill;
    const [glowR, glowG, glowB] = this.color.glow;
    const outer = this.radius * (isPaperRoom ? 4.6 : 7.5);
    const gradient = context.createRadialGradient(this.x, this.y, 0, this.x, this.y, outer);
    gradient.addColorStop(0, `rgba(${fillR}, ${fillG}, ${fillB}, ${Math.min(1, this.opacity + 0.2)})`);
    gradient.addColorStop(0.12, `rgba(${glowR}, ${glowG}, ${glowB}, ${this.opacity * 0.9})`);
    gradient.addColorStop(0.42, `rgba(${glowR}, ${glowG}, ${glowB}, ${this.opacity * 0.28})`);
    gradient.addColorStop(1, `rgba(${glowR}, ${glowG}, ${glowB}, 0)`);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(this.x, this.y, outer, 0, TAU);
    context.fill();
  }
}

function resizeCanvas() {
  if (!canvas || !context) return;
  viewport.width = window.innerWidth;
  viewport.height = window.innerHeight;
  viewport.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  canvas.width = Math.floor(viewport.width * viewport.dpr);
  canvas.height = Math.floor(viewport.height * viewport.dpr);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  context.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  fireflies.forEach((firefly) => {
    firefly.x = Math.min(viewport.width - firefly.radius, Math.max(firefly.radius, firefly.x));
    firefly.y = Math.min(viewport.height - firefly.radius, Math.max(firefly.radius, firefly.y));
  });
}

function drawFrame(now) {
  if (!canvas || !context) return;
  const delta = Math.min(0.04, Math.max(0.001, (now - lastTime) / 1000 || 0.016));
  lastTime = now;
  context.clearRect(0, 0, viewport.width, viewport.height);
  const isPaperRoom = document.body?.dataset.room !== "sky";
  fireflies.forEach((firefly, index) => {
    if (isPaperRoom && index >= 25) return;
    firefly.update(viewport.width, viewport.height, delta, now);
    firefly.draw(isPaperRoom);
  });
  if (!document.hidden && !(motionQuery?.matches)) frameId = requestAnimationFrame(drawFrame);
}

function drawStillFrame() {
  if (!canvas || !context) return;
  context.clearRect(0, 0, viewport.width, viewport.height);
  const isPaperRoom = document.body?.dataset.room !== "sky";
  fireflies.forEach((firefly, index) => {
    if (isPaperRoom && index >= 25) return;
    firefly.opacity = 0.5;
    firefly.draw(isPaperRoom);
  });
}

function restartAnimation() {
  cancelAnimationFrame(frameId);
  if (motionQuery?.matches || document.hidden) {
    drawStillFrame();
    return;
  }
  lastTime = performance.now();
  frameId = requestAnimationFrame(drawFrame);
}

export function mountFireflies({ quantity = 58 } = {}) {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.className = "fireflies-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  context = canvas.getContext("2d");
  context.globalCompositeOperation = "screen";
  fireflies = Array.from({ length: quantity }, () => new Firefly(window.innerWidth, window.innerHeight));
  motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  resizeHandler = resizeCanvas;
  pointerHandler = (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  };
  visibilityHandler = () => restartAnimation();
  motionHandler = () => restartAnimation();
  window.addEventListener("resize", resizeHandler, { passive: true });
  window.addEventListener("pointermove", pointerHandler, { passive: true });
  document.addEventListener("visibilitychange", visibilityHandler);
  motionQuery?.addEventListener?.("change", motionHandler);
  resizeCanvas();
  restartAnimation();
}

export function unmountFireflies() {
  cancelAnimationFrame(frameId);
  window.removeEventListener("resize", resizeHandler);
  window.removeEventListener("pointermove", pointerHandler);
  document.removeEventListener("visibilitychange", visibilityHandler);
  motionQuery?.removeEventListener?.("change", motionHandler);
  canvas?.remove();
  canvas = null;
  context = null;
  fireflies = [];
}
