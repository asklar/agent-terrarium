import { useRef, useEffect } from "react";
import { registry } from "../themes";
import type { ThemeDefinition, ParticleType, CustomDecoratorDef } from "../themes";
import { fetchLocation, fetchWeather, getCachedWeather, getLocation } from "../weather/weatherService";
import { computeTargetSky, lerpSkyState } from "../weather/skyCalculator";
import { DEFAULT_SKY } from "../weather/types";
import type { SkyState, WeatherOverlay } from "../weather/types";
import { log } from "../utils/log";

interface AnimatedBackgroundProps {
  theme: string;
  dynamicSky?: boolean;
  debugTime?: number | null;
  debugWeather?: WeatherOverlay | null;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  drift: number;
  phase: number;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

export function AnimatedBackground({ theme, dynamicSky, debugTime, debugWeather }: AnimatedBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const shootingStarsRef = useRef<ShootingStar[]>([]);
  const animRef = useRef<number>(0);
  const skyStateRef = useRef<SkyState>({ ...DEFAULT_SKY });
  const weatherParticlesRef = useRef<Particle[]>([]);
  const debugTimeRef = useRef(debugTime);
  debugTimeRef.current = debugTime;
  const debugWeatherRef = useRef(debugWeather);
  debugWeatherRef.current = debugWeather;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const t = registry.getTheme(theme);
    if (!t) return;

    // Pre-load SVG file images for custom decorators
    const svgImages = new Map<string, HTMLImageElement>();
    for (const cd of t.customDecorators ?? []) {
      if (cd.file) {
        const img = new Image();
        img.src = `/packages/${cd.file}`;
        svgImages.set(cd.name, img);
      }
    }

    const isDynamic = !!dynamicSky && !t.disableDynamicSky;

    // Initialize weather data for dynamic sky
    if (isDynamic) {
      // Snap to current sky state immediately (no slow lerp from default)
      const initialTarget = computeTargetSky(Date.now(), getCachedWeather(), debugTimeRef.current ?? null, debugWeatherRef.current ?? null);
      skyStateRef.current = initialTarget;
      log.info("Dynamic sky initialized:", initialTarget.weatherOverlay, `brightness=${initialTarget.brightness.toFixed(2)}`);

      fetchLocation().then((loc) => {
        if (loc) {
          log.info("Fetching weather for", loc.city ?? `${loc.lat},${loc.lon}`);
          fetchWeather(loc).catch(() => {});
        }
      }).catch(() => {});
      // Refresh weather periodically
      const weatherInterval = setInterval(() => {
        const loc = getLocation();
        if (loc) {
          log.info("Refreshing weather data");
          fetchWeather(loc).catch(() => {});
        }
      }, 6 * 60 * 60 * 1000);
      // Store cleanup ref
      (canvas as unknown as Record<string, unknown>).__weatherInterval = weatherInterval;
    }

    // Initialize particles
    const pc = t.particles;
    const initGroundY = canvas.height * 0.72;
    particlesRef.current = pc
      ? Array.from({ length: pc.count }, () => {
          // Bubbles spawn below the water line; others in the sky area
          const isBubble = pc.type === "bubble";
          return {
            x: Math.random() * canvas.width,
            y: isBubble
              ? initGroundY + Math.random() * (canvas.height - initGroundY)
              : Math.random() * canvas.height * 0.7,
            size: 2 + Math.random() * 4,
            speed: 0.2 + Math.random() * 0.5,
            opacity: 0.3 + Math.random() * 0.7,
            drift: (Math.random() - 0.5) * 0.3,
            phase: Math.random() * Math.PI * 2,
          };
        })
      : [];

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        canvas.width = entry.contentRect.width;
        canvas.height = entry.contentRect.height;
      }
    });
    resizeObserver.observe(canvas.parentElement!);

    let lastTime = 0;

    const render = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;

      let skyColors = t.sky;

      if (isDynamic) {
        const weather = getCachedWeather();
        const dw = debugWeatherRef.current;
        const dt2 = debugTimeRef.current;
        const target = computeTargetSky(Date.now(), weather, dt2 ?? null, dw ?? null);
        // Debug: fast transition (~0.5s), normal: gradual (~3s)
        const lerpSpeed = (dt2 != null || dw != null) ? 0.25 : 0.02;
        const prevOverlay = skyStateRef.current.weatherOverlay;
        skyStateRef.current = lerpSkyState(skyStateRef.current, target, lerpSpeed);
        skyColors = skyStateRef.current.skyColors;
        // Log when overlay changes
        if (skyStateRef.current.weatherOverlay !== prevOverlay) {
          log.info("Sky overlay:", prevOverlay, "→", skyStateRef.current.weatherOverlay,
            `intensity=${skyStateRef.current.weatherIntensity.toFixed(2)}`,
            `brightness=${skyStateRef.current.brightness.toFixed(2)}`);
        }
      }

      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.7);
      skyColors.forEach((color, i) => {
        skyGrad.addColorStop(i / (skyColors.length - 1), color);
      });
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      const groundY = h * 0.72;

      // Living meadow: draw sun, moon, stars before decorators
      if (isDynamic) {
        const sky = skyStateRef.current;

        // Stars (behind everything)
        if (sky.starOpacity > 0.01) {
          for (let i = 0; i < 40; i++) {
            const sx = ((i * 137.5) % w);
            const sy = ((i * 73.1) % (h * 0.6));
            const twinkle = 0.3 + Math.sin(time * 0.002 + i * 1.7) * 0.4;
            ctx.fillStyle = `rgba(255, 255, 240, ${twinkle * sky.starOpacity})`;
            const size = 1 + (i % 3);
            ctx.fillRect(sx, sy, size, size);
          }
          // Shooting stars at night
          if (sky.starOpacity > 0.5) {
            updateAndDrawShootingStars(ctx, w, h, dt, shootingStarsRef);
          }
        }

        // Moon
        const isNightTheme = theme === "night";
        if (isNightTheme) {
          // Night theme: always show moon at a gentle arc, never show sun
          const arcX = w * 0.8;
          const arcY = 50;
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#FFF9C4";
          ctx.shadowColor = "#FFF9C4";
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.arc(arcX, arcY, 18, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(0,0,0,0.05)";
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.arc(arcX - 4, arcY - 3, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(arcX + 5, arcY + 4, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          // Dynamic: moon position from sky calculator
          if (sky.moonPosition !== null && sky.moonOpacity > 0.01) {
            const arcX = sky.moonPosition * w * 0.8 + w * 0.1;
            const arcY = h * 0.5 - Math.sin(sky.moonPosition * Math.PI) * h * 0.4;
            ctx.save();
            ctx.globalAlpha = sky.moonOpacity;
            ctx.fillStyle = "#FFF9C4";
            ctx.shadowColor = "#FFF9C4";
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(arcX, arcY, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "rgba(0,0,0,0.05)";
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(arcX - 4, arcY - 3, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(arcX + 5, arcY + 4, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        // Sun (not on night theme)
        if (!isNightTheme && sky.sunPosition !== null && sky.sunOpacity > 0.01) {
          const arcX = sky.sunPosition * w * 0.8 + w * 0.1;
          const arcY = h * 0.55 - Math.sin(sky.sunPosition * Math.PI) * h * 0.45;
          ctx.save();
          ctx.globalAlpha = sky.sunOpacity;
          // Sun glow
          ctx.fillStyle = "rgba(255, 200, 50, 0.15)";
          ctx.beginPath();
          ctx.arc(arcX, arcY, 30, 0, Math.PI * 2);
          ctx.fill();
          // Sun body
          ctx.fillStyle = "#FFD54F";
          ctx.shadowColor = "#FFD54F";
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(arcX, arcY, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          // Sun rays
          ctx.strokeStyle = `rgba(255, 213, 79, ${sky.sunOpacity * 0.4})`;
          ctx.lineWidth = 1.5;
          for (let r = 0; r < 8; r++) {
            const angle = (r / 8) * Math.PI * 2 + time * 0.0003;
            const inner = 19;
            const outer = 24 + Math.sin(time * 0.003 + r) * 3;
            ctx.beginPath();
            ctx.moveTo(arcX + Math.cos(angle) * inner, arcY + Math.sin(angle) * inner);
            ctx.lineTo(arcX + Math.cos(angle) * outer, arcY + Math.sin(angle) * outer);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // Draw decorators (order from theme definition)
      if (isDynamic) {
        // For living meadow, skip static clouds/stars/moon decorators (we draw our own)
        for (const dec of t.decorators) {
          if (dec === "clouds" || dec === "stars" || dec === "moon" || dec === "shooting_stars") continue;
          const fn = DECORATORS[dec];
          if (fn) { fn(ctx, w, h, groundY, time, dt, t, shootingStarsRef); }
          else { const cd = findCustomDecorator(t, dec); if (cd) drawCustomDecorator(ctx, w, groundY, cd, svgImages); }
        }
        // Draw clouds with dynamic opacity and color based on weather
        const sky = skyStateRef.current;
        // Cloud color: white for clear, grey for cloudy, dark for storm
        let cloudColor = "rgba(255, 255, 255, 0.6)";
        let cloudCount = 4;
        if (sky.weatherOverlay === "storm") {
          cloudColor = "rgba(60, 65, 80, 0.8)";
          cloudCount = 8;
        } else if (sky.weatherOverlay === "rain") {
          cloudColor = "rgba(100, 110, 130, 0.7)";
          cloudCount = 7;
        } else if (sky.weatherOverlay === "drizzle") {
          cloudColor = "rgba(140, 150, 165, 0.65)";
          cloudCount = 6;
        } else if (sky.weatherOverlay === "fog") {
          cloudColor = "rgba(180, 185, 195, 0.5)";
          cloudCount = 5;
        } else if (sky.weatherOverlay === "snow") {
          cloudColor = "rgba(170, 175, 190, 0.6)";
          cloudCount = 6;
        } else if (sky.weatherOverlay === "cloudy") {
          cloudColor = "rgba(200, 205, 215, 0.6)";
          cloudCount = 6;
        }
        const cloudOpacity = sky.weatherOverlay !== "none"
          ? 0.3 + sky.weatherIntensity * 0.5
          : sky.brightness < 0.5 ? 0.15 : 0.4;
        ctx.save();
        ctx.globalAlpha = cloudOpacity;
        drawClouds(ctx, w, time, cloudColor, cloudCount);
        // Draw cloud cover anchored over sun/moon when weather is overcast
        if (sky.weatherOverlay !== "none" && sky.weatherIntensity > 0.1) {
          const coverAlpha = sky.weatherIntensity;
          ctx.globalAlpha = cloudOpacity * coverAlpha;
          ctx.fillStyle = cloudColor;
          if (sky.sunPosition !== null && sky.sunOpacity > 0.01) {
            const sx = sky.sunPosition * w * 0.8 + w * 0.1;
            const sy = h * 0.55 - Math.sin(sky.sunPosition * Math.PI) * h * 0.45;
            const wobble = Math.sin(time * 0.0003) * 5;
            ctx.beginPath();
            ctx.arc(sx + wobble, sy, 28, 0, Math.PI * 2);
            ctx.arc(sx - 18 + wobble, sy + 5, 22, 0, Math.PI * 2);
            ctx.arc(sx + 20 + wobble, sy + 3, 20, 0, Math.PI * 2);
            ctx.arc(sx + wobble, sy - 12, 18, 0, Math.PI * 2);
            ctx.fill();
          }
          if (sky.moonPosition !== null && sky.moonOpacity > 0.01) {
            const mx = sky.moonPosition * w * 0.8 + w * 0.1;
            const my = h * 0.5 - Math.sin(sky.moonPosition * Math.PI) * h * 0.4;
            const wobble = Math.sin(time * 0.00025 + 2) * 4;
            ctx.beginPath();
            ctx.arc(mx + wobble, my, 26, 0, Math.PI * 2);
            ctx.arc(mx - 16 + wobble, my + 4, 20, 0, Math.PI * 2);
            ctx.arc(mx + 18 + wobble, my + 2, 18, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      } else {
        for (const dec of t.decorators) {
          const fn = DECORATORS[dec];
          if (fn) { fn(ctx, w, h, groundY, time, dt, t, shootingStarsRef); }
          else { const cd = findCustomDecorator(t, dec); if (cd) drawCustomDecorator(ctx, w, groundY, cd, svgImages); }
        }
      }

      // Ground
      if (!t.hideGround) {
      const waveAmp = t.groundWave ?? 4;
      const groundGrad = ctx.createLinearGradient(0, groundY, 0, h);
      groundGrad.addColorStop(0, t.ground);
      groundGrad.addColorStop(1, t.groundAccent);
      ctx.fillStyle = groundGrad;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      for (let x = 0; x <= w; x += 20) {
        const wave = Math.sin(x * 0.02 + time * 0.0005) * waveAmp;
        ctx.lineTo(x, groundY + wave);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
      }

      // Living meadow: ground tint + weather particles
      if (isDynamic) {
        const sky = skyStateRef.current;

        // Ground tint overlay (night darkening, sunset warmth)
        if (sky.groundTintOpacity > 0.01) {
          ctx.save();
          ctx.globalAlpha = sky.groundTintOpacity;
          ctx.fillStyle = sky.groundTint;
          ctx.fillRect(0, groundY - 4, w, h - groundY + 4);
          ctx.restore();
        }

        // Brightness overlay (dim entire scene at night)
        if (sky.brightness < 0.95) {
          ctx.save();
          ctx.globalAlpha = 1 - sky.brightness;
          ctx.fillStyle = "#0a0e2a";
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        }

        // Weather particles
        const wp = weatherParticlesRef.current;
        if (sky.weatherOverlay === "rain" || sky.weatherOverlay === "storm") {
          // Ensure enough rain particles
          while (wp.length < 60) {
            wp.push({
              x: Math.random() * w, y: Math.random() * h,
              size: 1 + Math.random() * 2, speed: 8 + Math.random() * 6,
              opacity: 0.3 + Math.random() * 0.4, drift: -0.5 - Math.random(),
              phase: Math.random() * Math.PI * 2,
            });
          }
          ctx.save();
          ctx.globalAlpha = sky.weatherIntensity;
          ctx.strokeStyle = "rgba(170, 200, 255, 0.5)";
          ctx.lineWidth = 1;
          for (const p of wp) {
            p.y += p.speed * dt * 60;
            p.x += p.drift * dt * 30;
            if (p.y > h) { p.y = -5; p.x = Math.random() * w; }
            if (p.x < 0) p.x = w;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.drift * 2, p.y + p.size * 4);
            ctx.stroke();
          }
          ctx.restore();
          // Lightning flash for storms
          if (sky.weatherOverlay === "storm" && Math.random() < 0.003) {
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
          }
        } else if (sky.weatherOverlay === "drizzle") {
          while (wp.length < 45) {
            wp.push({
              x: Math.random() * w, y: Math.random() * h,
              size: 1 + Math.random() * 1.5, speed: 5 + Math.random() * 4,
              opacity: 0.5 + Math.random() * 0.4, drift: -0.4 - Math.random() * 0.4,
              phase: Math.random() * Math.PI * 2,
            });
          }
          ctx.save();
          ctx.globalAlpha = sky.weatherIntensity;
          for (const p of wp) {
            p.y += p.speed * dt * 55;
            p.x += p.drift * dt * 25;
            if (p.y > h) { p.y = -5; p.x = Math.random() * w; }
            if (p.x < 0) p.x = w;
            ctx.strokeStyle = `rgba(220, 230, 255, ${p.opacity})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.drift * 2, p.y + p.size * 5);
            ctx.stroke();
          }
          ctx.restore();
        } else if (sky.weatherOverlay === "snow") {
          while (wp.length < 40) {
            wp.push({
              x: Math.random() * w, y: Math.random() * h,
              size: 2 + Math.random() * 3, speed: 1 + Math.random() * 2,
              opacity: 0.5 + Math.random() * 0.5, drift: (Math.random() - 0.5) * 0.8,
              phase: Math.random() * Math.PI * 2,
            });
          }
          ctx.save();
          ctx.globalAlpha = sky.weatherIntensity;
          for (const p of wp) {
            p.y += p.speed * dt * 30;
            p.x += Math.sin(time * 0.001 + p.phase) * p.drift * dt * 30;
            if (p.y > h) { p.y = -5; p.x = Math.random() * w; }
            ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        } else if (sky.weatherOverlay === "fog") {
          ctx.save();
          // Full-screen fog wash
          ctx.globalAlpha = sky.weatherIntensity * 0.25;
          ctx.fillStyle = "rgba(200, 205, 215, 1)";
          ctx.fillRect(0, 0, w, h);

          // Layered drifting fog banks using radial gradients
          for (let i = 0; i < 8; i++) {
            const drift = Math.sin(time * 0.00015 * (1 + i * 0.3) + i * 2.1) * w * 0.15;
            const vertDrift = Math.cos(time * 0.0001 + i * 1.7) * 15;
            const cx = (i * w * 0.18) + drift;
            const cy = groundY - 40 + (i % 3) * 25 + vertDrift;
            const rx = 120 + (i % 4) * 40;
            const ry = 50 + (i % 3) * 20;

            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
            grad.addColorStop(0, `rgba(210, 215, 225, ${0.3 * sky.weatherIntensity})`);
            grad.addColorStop(0.5, `rgba(210, 215, 225, ${0.15 * sky.weatherIntensity})`);
            grad.addColorStop(1, "rgba(210, 215, 225, 0)");

            ctx.globalAlpha = 1;
            ctx.fillStyle = grad;
            ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
          }

          // Upper atmosphere haze
          const hazeGrad = ctx.createLinearGradient(0, 0, 0, h * 0.6);
          hazeGrad.addColorStop(0, `rgba(200, 205, 215, ${0.15 * sky.weatherIntensity})`);
          hazeGrad.addColorStop(1, "rgba(200, 205, 215, 0)");
          ctx.globalAlpha = 1;
          ctx.fillStyle = hazeGrad;
          ctx.fillRect(0, 0, w, h * 0.6);

          ctx.restore();
        } else {
          // Clear weather: drain weather particles
          if (wp.length > 0) wp.length = 0;
        }
      }

      // Particles
      if (pc) {
        for (const p of particlesRef.current) {
          drawParticle(ctx, p, pc.color, pc.type, time);
          updateParticle(p, pc.type, dt, time, canvas.width, canvas.height, groundY);
        }
      }

      // Border
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(2, 2, w - 4, h - 4, 12);
      ctx.stroke();

      // Debug sky overlay indicator
      if (isDynamic && (debugTimeRef.current != null || debugWeatherRef.current != null)) {
        const sky = skyStateRef.current;
        ctx.save();
        ctx.font = "10px monospace";
        ctx.fillStyle = "rgba(255,255,0,0.8)";
        ctx.fillText(`⚡ ${sky.weatherOverlay} (${sky.weatherIntensity.toFixed(2)}) b=${sky.brightness.toFixed(2)}`, 8, 14);
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animRef.current);
      resizeObserver.disconnect();
      const interval = (canvas as unknown as Record<string, unknown>).__weatherInterval;
      if (interval) clearInterval(interval as number);
    };
  }, [theme, dynamicSky]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        borderRadius: 12,
      }}
    />
  );
}

// Decorator type: all draw functions share this signature
type DecoratorFn = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  groundY: number,
  time: number,
  dt: number,
  theme: ThemeDefinition,
  shootingStarsRef: React.RefObject<ShootingStar[]>,
) => void;

// --- Space decorators ---

function drawNebula(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
) {
  // Soft colorful nebula clouds
  const nebulae = [
    { x: w * 0.2, y: h * 0.25, r: 80, color: "rgba(156, 39, 176, 0.06)" },
    { x: w * 0.7, y: h * 0.15, r: 100, color: "rgba(33, 150, 243, 0.05)" },
    { x: w * 0.5, y: h * 0.5, r: 70, color: "rgba(233, 30, 99, 0.04)" },
    { x: w * 0.85, y: h * 0.6, r: 60, color: "rgba(0, 188, 212, 0.05)" },
  ];
  for (const n of nebulae) {
    const drift = Math.sin(time * 0.0002 + n.x) * 10;
    const grad = ctx.createRadialGradient(
      n.x + drift, n.y, 0,
      n.x + drift, n.y, n.r,
    );
    grad.addColorStop(0, n.color);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawPlanets(
  ctx: CanvasRenderingContext2D,
  w: number,
  time: number,
) {
  // Small distant planet with ring
  const px = w * 0.15 + Math.sin(time * 0.00005) * 5;
  const py = 55;
  ctx.save();
  ctx.fillStyle = "#CE93D8";
  ctx.shadowColor = "#CE93D8";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(px, py, 12, 0, Math.PI * 2);
  ctx.fill();
  // Ring
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(206, 147, 216, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(px, py, 20, 5, -0.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Tiny red planet
  const px2 = w * 0.65;
  const py2 = 35 + Math.sin(time * 0.0001) * 3;
  ctx.fillStyle = "#E57373";
  ctx.shadowColor = "#E57373";
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(px2, py2, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawSpaceDust(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
) {
  // Drifting dust particles with subtle glow
  ctx.save();
  for (let i = 0; i < 25; i++) {
    const seed = i * 137.5;
    const x = ((seed * 7.3 + time * 0.003 * (0.5 + (i % 5) * 0.1)) % (w + 20)) - 10;
    const y = ((seed * 3.7 + time * 0.001 * (0.3 + (i % 3) * 0.1)) % (h * 0.85));
    const size = 0.5 + (i % 4) * 0.4;
    const alpha = 0.15 + Math.sin(time * 0.002 + seed) * 0.1;
    ctx.fillStyle = `rgba(200, 200, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Registry of built-in decorator draw functions, keyed by name */
function drawDistantStar(
  ctx: CanvasRenderingContext2D,
  h: number,
  time: number,
) {
  // Large star/sun partially cropped at the bottom-right corner
  ctx.save();
  const cx = ctx.canvas.width + 20;
  const cy = h * 0.55;
  const r = 90;
  const pulse = 1 + Math.sin(time * 0.0008) * 0.04;

  // Outer corona glow
  for (let i = 3; i >= 0; i--) {
    const gr = r * pulse + i * 25;
    const grad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, gr);
    const alpha = 0.03 - i * 0.005;
    grad.addColorStop(0, `rgba(255, 200, 100, ${alpha})`);
    grad.addColorStop(0.6, `rgba(255, 140, 50, ${alpha * 0.5})`);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, ctx.canvas.width, h);
  }

  // Star body
  const bodyGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * pulse);
  bodyGrad.addColorStop(0, "rgba(255, 250, 220, 0.9)");
  bodyGrad.addColorStop(0.3, "rgba(255, 220, 130, 0.7)");
  bodyGrad.addColorStop(0.7, "rgba(255, 160, 60, 0.3)");
  bodyGrad.addColorStop(1, "transparent");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGalaxy(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
) {
  // Distant spiral galaxy in the upper-left area
  ctx.save();
  const cx = w * 0.12;
  const cy = h * 0.2;
  const rot = time * 0.00003;

  ctx.translate(cx, cy);
  ctx.rotate(rot);

  // Galaxy core glow
  const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 35);
  coreGrad.addColorStop(0, "rgba(200, 180, 255, 0.12)");
  coreGrad.addColorStop(0.5, "rgba(150, 130, 220, 0.06)");
  coreGrad.addColorStop(1, "transparent");
  ctx.fillStyle = coreGrad;
  ctx.fillRect(-40, -40, 80, 80);

  // Spiral arms (dots along spiral path)
  ctx.globalAlpha = 0.4;
  for (let arm = 0; arm < 2; arm++) {
    const armOffset = arm * Math.PI;
    for (let i = 0; i < 40; i++) {
      const angle = armOffset + i * 0.25;
      const dist = 3 + i * 0.85;
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist * 0.45; // flatten to ellipse
      const size = 0.4 + (1 - i / 40) * 0.6;
      const alpha = 0.6 - i / 40 * 0.4;
      ctx.fillStyle = `rgba(200, 190, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// --- Custom SVG-path decorator rendering ---

function drawCustomDecorator(
  ctx: CanvasRenderingContext2D,
  w: number,
  groundY: number,
  def: CustomDecoratorDef,
  svgImages: Map<string, HTMLImageElement>,
) {
  // Draw file-based SVG image first (if provided and loaded)
  const img = svgImages.get(def.name);
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save();
    const fx = (def.fileX ?? 0.5) * w;
    const fy = (def.fileY ?? 0.5) * groundY;
    // Scale decorator dimensions proportionally to canvas width
    const sizeScale = w / 1280;
    const fw = (def.fileWidth ?? 100) * sizeScale;
    const fh = (def.fileHeight ?? 100) * sizeScale;
    if (def.fileOpacity !== undefined && def.fileOpacity < 1) ctx.globalAlpha = def.fileOpacity;
    ctx.drawImage(img, fx - fw / 2, fy - fh / 2, fw, fh);
    ctx.restore();
  }

  // Draw inline path elements on top
  for (const el of def.elements ?? []) {
    ctx.save();
    const px = el.x * w;
    const py = el.y * groundY;
    ctx.translate(px, py);
    const s = el.scale ?? 1;
    ctx.scale(s, s);
    if (el.opacity !== undefined && el.opacity < 1) ctx.globalAlpha = el.opacity;

    const path = new Path2D(el.d);
    if (el.fill && el.fill !== "none") {
      ctx.fillStyle = el.fill;
      ctx.fill(path);
    }
    if (el.stroke) {
      ctx.strokeStyle = el.stroke;
      ctx.lineWidth = el.strokeWidth ?? 1;
      ctx.stroke(path);
    }
    ctx.restore();
  }
}

/** Look up a custom decorator by name from the theme's customDecorators array */
function findCustomDecorator(theme: ThemeDefinition, name: string): CustomDecoratorDef | undefined {
  return theme.customDecorators?.find(cd => cd.name === name);
}

const DECORATORS: Record<string, DecoratorFn> = {
  clouds: (ctx, w, _h, _gy, time) => drawClouds(ctx, w, time),
  moon: (ctx, w) => drawMoon(ctx, w),
  stars: (ctx, w, h, _gy, time) => drawStars(ctx, w, h, time),
  shooting_stars: (ctx, w, h, _gy, _time, dt, _theme, ref) =>
    updateAndDrawShootingStars(ctx, w, h, dt, ref),
  waves: (ctx, w, h, _gy, time) => drawWaves(ctx, w, h, time),
  seaweed: (ctx, w, h, _gy, time) => drawSeaweed(ctx, w, h, time),
  flowers: (ctx, w, _h, gy, time) => drawFlowers(ctx, w, gy, time),
  grass: (ctx, w, _h, gy, time, _dt, theme) => {
    if (theme.grass) drawGrass(ctx, w, gy, time, theme.grass.color, theme.grass.accent);
  },
  cactus: (ctx, w, _h, gy) => drawCacti(ctx, w, gy),
  trees: (ctx, w, _h, gy, time) => drawTrees(ctx, w, gy, time),
  mist: (ctx, w, h, gy, time) => drawMist(ctx, w, h, gy, time),
  fireflies: (ctx, w, h, gy, time) => drawFireflies(ctx, w, h, gy, time),
  castle_walls: (ctx, w, _h, gy) => drawCastleWalls(ctx, w, gy),
  torches: (ctx, w, _h, gy, time) => drawTorches(ctx, w, gy, time),
  banners: (ctx, w, _h, gy, time) => drawBanners(ctx, w, gy, time),
  nebula: (ctx, w, h, _gy, time) => drawNebula(ctx, w, h, time),
  planets: (ctx, w, _h, _gy, time) => drawPlanets(ctx, w, time),
  space_dust: (ctx, w, h, _gy, time) => drawSpaceDust(ctx, w, h, time),
  distant_star: (ctx, _w, h, _gy, time) => drawDistantStar(ctx, h, time),
  galaxy: (ctx, w, h, _gy, time) => drawGalaxy(ctx, w, h, time),
};

function updateParticle(
  p: Particle,
  type: ParticleType,
  dt: number,
  time: number,
  canvasW: number,
  canvasH: number,
  groundY: number,
) {
  switch (type) {
    case "leaf":
      p.y += p.speed * dt * 30;
      p.x += Math.sin(time * 0.001 + p.phase) * p.drift * dt * 30;
      if (p.y > canvasH) { p.y = -p.size; p.x = Math.random() * canvasW; }
      break;
    case "bubble":
      p.y -= p.speed * dt * 20;
      p.x += Math.sin(time * 0.002 + p.phase) * 0.5;
      // Bubbles stay below the water line (groundY) and respawn at bottom
      if (p.y < groundY) { p.y = canvasH + p.size; p.x = Math.random() * canvasW; }
      break;
    case "star":
      p.opacity = 0.3 + Math.sin(time * 0.003 + p.phase) * 0.4;
      break;
    case "sand":
      p.x += p.speed * dt * 40;
      p.y += Math.sin(time * 0.001 + p.phase) * 0.2;
      if (p.x > canvasW + p.size) { p.x = -p.size; p.y = Math.random() * canvasH * 0.7; }
      break;
  }
}

function drawClouds(
  ctx: CanvasRenderingContext2D,
  w: number,
  time: number,
  color: string = "rgba(255, 255, 255, 0.6)",
  count: number = 4,
) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const cx =
      ((i * w * 0.3 + time * 0.01 * (0.5 + i * 0.2)) % (w + 120)) - 60;
    const cy = 20 + (i % 4) * 25 + (i >= 4 ? 15 : 0);
    const s = 20 + (i % 4) * 8;
    ctx.beginPath();
    ctx.arc(cx, cy, s, 0, Math.PI * 2);
    ctx.arc(cx + s * 0.8, cy - s * 0.2, s * 0.7, 0, Math.PI * 2);
    ctx.arc(cx - s * 0.6, cy + s * 0.1, s * 0.6, 0, Math.PI * 2);
    ctx.arc(cx + s * 0.3, cy + s * 0.3, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMoon(ctx: CanvasRenderingContext2D, w: number) {
  ctx.fillStyle = "#FFF9C4";
  ctx.shadowColor = "#FFF9C4";
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(w * 0.8, 50, 25, 0, Math.PI * 2);
  ctx.fill();
  // Moon craters
  ctx.fillStyle = "rgba(0,0,0,0.05)";
  ctx.beginPath();
  ctx.arc(w * 0.8 - 5, 45, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.8 + 8, 55, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
) {
  // Use deterministic positions based on index
  for (let i = 0; i < 40; i++) {
    const x = ((i * 137.5) % w);
    const y = ((i * 73.1) % (h * 0.6));
    const twinkle = 0.3 + Math.sin(time * 0.002 + i * 1.7) * 0.4;
    ctx.fillStyle = `rgba(255, 255, 240, ${twinkle})`;
    const size = 1 + (i % 3);
    ctx.fillRect(x, y, size, size);
  }
}

function drawGrass(
  ctx: CanvasRenderingContext2D,
  w: number,
  groundY: number,
  time: number,
  color: string,
  accent: string,
) {
  for (let x = 0; x < w; x += 8) {
    const sway = Math.sin(time * 0.002 + x * 0.05) * 3;
    const h = 6 + (x * 7) % 10;
    ctx.strokeStyle = (x % 16 === 0) ? accent : color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const waveOffset = Math.sin(x * 0.02 + time * 0.0005) * 4;
    ctx.moveTo(x, groundY + waveOffset);
    ctx.quadraticCurveTo(x + sway, groundY + waveOffset - h * 0.6, x + sway * 0.5, groundY + waveOffset - h);
    ctx.stroke();
  }
}

function drawFlowers(
  ctx: CanvasRenderingContext2D,
  w: number,
  groundY: number,
  time: number,
) {
  const flowerColors = ["#F48FB1", "#CE93D8", "#FFF176", "#EF5350", "#FF8A65"];
  for (let i = 0; i < 8; i++) {
    const x = ((i * 97 + 30) % w);
    const waveOffset = Math.sin(x * 0.02 + time * 0.0005) * 4;
    const y = groundY + waveOffset - 2;
    const sway = Math.sin(time * 0.003 + i) * 2;
    const color = flowerColors[i % flowerColors.length];

    // Stem
    ctx.strokeStyle = "#4CAF50";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + sway, y - 12);
    ctx.stroke();

    // Petals
    ctx.fillStyle = color;
    const petalSize = 3;
    for (let p = 0; p < 5; p++) {
      const angle = (p / 5) * Math.PI * 2 + time * 0.001;
      ctx.beginPath();
      ctx.arc(
        x + sway + Math.cos(angle) * petalSize,
        y - 12 + Math.sin(angle) * petalSize,
        2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    // Center
    ctx.fillStyle = "#FFF176";
    ctx.beginPath();
    ctx.arc(x + sway, y - 12, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWaves(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
) {
  for (let layer = 0; layer < 3; layer++) {
    const y = h * (0.55 + layer * 0.08);
    const alpha = 0.15 - layer * 0.03;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 10) {
      const wave =
        Math.sin(x * 0.03 + time * 0.001 + layer * 2) * 8 +
        Math.sin(x * 0.01 + time * 0.0015) * 4;
      ctx.lineTo(x, y + wave);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSeaweed(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
) {
  ctx.strokeStyle = "rgba(0, 100, 0, 0.4)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const x = ((i * 130 + 40) % w);
    const baseY = h - 10;
    const height = 30 + (i % 3) * 15;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    for (let s = 0; s < height; s += 5) {
      const sway = Math.sin(time * 0.002 + i + s * 0.1) * 8;
      ctx.lineTo(x + sway, baseY - s);
    }
    ctx.stroke();
  }
}

function drawCacti(
  ctx: CanvasRenderingContext2D,
  w: number,
  groundY: number,
) {
  ctx.fillStyle = "#2E7D32";
  for (let i = 0; i < 3; i++) {
    const x = ((i * 250 + 80) % w);
    const waveOffset = Math.sin(x * 0.02) * 4;
    const y = groundY + waveOffset;
    const h = 25 + i * 10;

    // Main trunk
    ctx.beginPath();
    ctx.roundRect(x - 5, y - h, 10, h, 3);
    ctx.fill();

    // Arms
    ctx.beginPath();
    ctx.roundRect(x - 15, y - h * 0.7, 10, 6, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x - 15, y - h * 0.7 - 12, 6, 14, 3);
    ctx.fill();

    ctx.beginPath();
    ctx.roundRect(x + 5, y - h * 0.5, 10, 6, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x + 9, y - h * 0.5 - 8, 6, 10, 3);
    ctx.fill();
  }
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  p: Particle,
  color: string,
  type: string,
  time: number,
) {
  ctx.save();
  ctx.globalAlpha = p.opacity;

  switch (type) {
    case "leaf": {
      ctx.fillStyle = color;
      ctx.translate(p.x, p.y);
      const rot = Math.sin(time * 0.002 + p.phase) * 0.5;
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "star": {
      ctx.fillStyle = color;
      ctx.fillRect(p.x, p.y, p.size * 0.8, p.size * 0.8);
      break;
    }
    case "sand": {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "bubble": {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.stroke();
      // Highlight
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.beginPath();
      ctx.arc(
        p.x - p.size * 0.3,
        p.y - p.size * 0.3,
        p.size * 0.3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}

function updateAndDrawShootingStars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dt: number,
  starsRef: React.RefObject<ShootingStar[]>,
) {
  const stars = starsRef.current!;
  // Spawn occasionally
  if (Math.random() < 0.003 && stars.length < 2) {
    stars.push({
      x: Math.random() * w * 0.8,
      y: Math.random() * h * 0.3,
      vx: 300 + Math.random() * 400,
      vy: 100 + Math.random() * 150,
      life: 0,
      maxLife: 0.5 + Math.random() * 0.5,
      size: 1.5 + Math.random() * 1.5,
    });
  }

  for (let i = stars.length - 1; i >= 0; i--) {
    const s = stars[i];
    s.life += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;

    const progress = s.life / s.maxLife;
    const alpha = progress < 0.1 ? progress / 0.1 : 1 - (progress - 0.1) / 0.9;

    if (s.life >= s.maxLife || s.x > w || s.y > h) {
      stars.splice(i, 1);
      continue;
    }

    // Trail
    ctx.save();
    const grad = ctx.createLinearGradient(
      s.x, s.y,
      s.x - s.vx * 0.06, s.y - s.vy * 0.06,
    );
    grad.addColorStop(0, `rgba(255, 255, 240, ${alpha * 0.9})`);
    grad.addColorStop(1, `rgba(255, 255, 240, 0)`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = s.size;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 0.06, s.y - s.vy * 0.06);
    ctx.stroke();

    // Head glow
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawTrees(
  ctx: CanvasRenderingContext2D,
  w: number,
  groundY: number,
  time: number,
) {
  const treePositions = [0.08, 0.22, 0.38, 0.55, 0.72, 0.88, 0.95];
  for (let i = 0; i < treePositions.length; i++) {
    const x = w * treePositions[i];
    const waveOffset = Math.sin(x * 0.02 + time * 0.0005) * 4;
    const baseY = groundY + waveOffset;
    const height = 50 + (i % 3) * 20;
    const sway = Math.sin(time * 0.0008 + i * 1.5) * 2;

    // Trunk
    ctx.fillStyle = "#3E2723";
    ctx.beginPath();
    ctx.roundRect(x - 4, baseY - height * 0.4, 8, height * 0.4, 2);
    ctx.fill();

    // Canopy layers (darker at bottom, lighter at top)
    const layers = [
      { yOff: 0, w: 28, h: 20, color: "#1B5E20" },
      { yOff: -14, w: 22, h: 18, color: "#2E7D32" },
      { yOff: -26, w: 16, h: 14, color: "#388E3C" },
    ];
    for (const l of layers) {
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.moveTo(x + sway - l.w / 2, baseY - height * 0.4 + l.yOff);
      ctx.lineTo(x + sway, baseY - height * 0.4 + l.yOff - l.h);
      ctx.lineTo(x + sway + l.w / 2, baseY - height * 0.4 + l.yOff);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawMist(
  ctx: CanvasRenderingContext2D,
  w: number,
  _h: number,
  groundY: number,
  time: number,
) {
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const drift = Math.sin(time * 0.0003 + i * 2) * 40;
    const y = groundY - 10 + i * 8;
    const alpha = 0.06 + Math.sin(time * 0.0005 + i) * 0.03;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(w * 0.3 + drift + i * 60, y, 120 + i * 30, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w * 0.7 - drift + i * 40, y + 5, 100 + i * 20, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFireflies(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  groundY: number,
  time: number,
) {
  for (let i = 0; i < 12; i++) {
    const x = ((i * 67 + 20) % w) + Math.sin(time * 0.001 + i * 2.3) * 15;
    const y = groundY - 20 + Math.sin(time * 0.0015 + i * 1.7) * 30;
    if (y > h - 10) continue;
    const glow = 0.3 + Math.sin(time * 0.004 + i * 3.1) * 0.4;
    if (glow < 0.15) continue;

    // Outer glow
    ctx.fillStyle = `rgba(255, 235, 59, ${glow * 0.3})`;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    // Inner bright
    ctx.fillStyle = `rgba(255, 255, 200, ${glow})`;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCastleWalls(
  ctx: CanvasRenderingContext2D,
  w: number,
  groundY: number,
) {
  // Back wall
  ctx.fillStyle = "#4A4A5A";
  ctx.fillRect(0, groundY - 80, w, 80);

  // Stone texture
  ctx.strokeStyle = "rgba(0,0,0,0.1)";
  ctx.lineWidth = 1;
  for (let row = 0; row < 5; row++) {
    const y = groundY - 80 + row * 16;
    const offset = row % 2 === 0 ? 0 : 20;
    for (let col = -1; col < w / 40 + 1; col++) {
      const x = col * 40 + offset;
      ctx.strokeRect(x, y, 40, 16);
    }
  }

  // Crenellations
  ctx.fillStyle = "#4A4A5A";
  const merlonW = 18;
  const merlonH = 14;
  const gap = 12;
  for (let x = 0; x < w; x += merlonW + gap) {
    ctx.fillRect(x, groundY - 80 - merlonH, merlonW, merlonH);
  }

  // Window arches
  ctx.fillStyle = "#1A1A2E";
  for (let i = 0; i < 3; i++) {
    const x = w * (0.25 + i * 0.25);
    const y = groundY - 55;
    ctx.beginPath();
    ctx.arc(x, y, 8, Math.PI, 0);
    ctx.fillRect(x - 8, y, 16, 12);
    ctx.fill();
  }

  // Cobblestone ground
  ctx.fillStyle = "#5D5060";
  ctx.fillRect(0, groundY, w, 10);
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  for (let row = 0; row < 6; row++) {
    const y = groundY + row * 12;
    const offset = row % 2 === 0 ? 0 : 15;
    for (let col = -1; col < w / 30 + 1; col++) {
      ctx.beginPath();
      ctx.roundRect(col * 30 + offset, y, 28, 10, 3);
      ctx.stroke();
    }
  }
}

function drawTorches(
  ctx: CanvasRenderingContext2D,
  w: number,
  groundY: number,
  time: number,
) {
  const positions = [w * 0.15, w * 0.5, w * 0.85];
  for (let i = 0; i < positions.length; i++) {
    const x = positions[i];
    const y = groundY - 50;

    // Torch bracket
    ctx.fillStyle = "#5D4037";
    ctx.fillRect(x - 2, y, 4, 20);

    // Flame flicker
    const flicker = Math.sin(time * 0.01 + i * 2) * 2;
    const flicker2 = Math.cos(time * 0.015 + i * 3) * 1.5;

    // Outer glow
    ctx.fillStyle = `rgba(255, 152, 0, ${0.15 + Math.sin(time * 0.008 + i) * 0.05})`;
    ctx.beginPath();
    ctx.arc(x, y - 4, 18, 0, Math.PI * 2);
    ctx.fill();

    // Flame body
    ctx.fillStyle = "#FF9800";
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.quadraticCurveTo(x - 3 + flicker2, y - 10, x + flicker, y - 14);
    ctx.quadraticCurveTo(x + 3 - flicker2, y - 10, x + 5, y);
    ctx.closePath();
    ctx.fill();

    // Inner flame
    ctx.fillStyle = "#FFF176";
    ctx.beginPath();
    ctx.moveTo(x - 2, y);
    ctx.quadraticCurveTo(x - 1 + flicker, y - 6, x + flicker * 0.5, y - 9);
    ctx.quadraticCurveTo(x + 1 - flicker, y - 6, x + 2, y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBanners(
  ctx: CanvasRenderingContext2D,
  w: number,
  groundY: number,
  time: number,
) {
  const bannerColors = ["#C62828", "#1565C0", "#6A1B9A"];
  const positions = [w * 0.3, w * 0.5, w * 0.7];

  for (let i = 0; i < positions.length; i++) {
    const x = positions[i];
    const y = groundY - 70;
    const sway = Math.sin(time * 0.002 + i * 2) * 3;
    const color = bannerColors[i % bannerColors.length];

    // Pole
    ctx.strokeStyle = "#8D6E63";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 30);
    ctx.stroke();

    // Banner cloth
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 14 + sway, y + 2);
    ctx.lineTo(x + 12 + sway * 0.8, y + 22);
    ctx.lineTo(x + 7 + sway * 0.5, y + 18);
    ctx.lineTo(x, y + 22);
    ctx.closePath();
    ctx.fill();

    // Banner emblem (simple shield shape)
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.arc(x + 7 + sway * 0.5, y + 10, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
