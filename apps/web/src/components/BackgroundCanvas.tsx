import { useEffect, useRef } from "react";
import { blobLive } from "../lib/blobLive";
import { isMobileViewport } from "../lib/useIsMobile";

// Multi-layer cinematic background: void gradient + drifting particles +
// faint reactor rings + radial energy waves syncing to the blob's breath.
// Mouse parallax is applied uniformly to the technical layers (subtle).

export default function BackgroundCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    let W = 0, H = 0, dpr = 1, isMob = false;
    const resize = () => {
      isMob = isMobileViewport();
      // Cap DPR more aggressively on mobile for perf
      dpr = Math.min(window.devicePixelRatio || 1, isMob ? 1.5 : 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // ── Particle field ─────────────────────────────────────────────────────
    interface P { x: number; y: number; z: number; vx: number; vy: number; r: number; alpha: number; }
    const PARTICLES: P[] = [];
    const seedParticles = () => {
      PARTICLES.length = 0;
      const N = isMob ? 36 : 90;
      for (let i = 0; i < N; i++) {
        const z = Math.random() * 0.9 + 0.1;
        PARTICLES.push({
          x: Math.random() * W,
          y: Math.random() * H,
          z,
          vx: (Math.random() - 0.5) * 0.08 * z,
          vy: (Math.random() - 0.5) * 0.05 * z - 0.04 * z,
          r: 0.4 + z * 1.4,
          alpha: 0.15 + z * 0.45,
        });
      }
    };
    seedParticles();

    // ── Mouse parallax (very subtle) ───────────────────────────────────────
    let pmx = 0, pmy = 0;
    const onMove = (e: MouseEvent) => {
      pmx = (e.clientX / W - 0.5);
      pmy = (e.clientY / H - 0.5);
    };
    let mouseBound = false;
    const bindMouse = () => {
      if (!isMob && !mouseBound) {
        window.addEventListener("mousemove", onMove);
        mouseBound = true;
      } else if (isMob && mouseBound) {
        window.removeEventListener("mousemove", onMove);
        mouseBound = false;
      }
    };
    bindMouse();

    // Re-seed + re-bind on resize so density and listeners follow mobile↔desktop
    let lastIsMob = isMob;
    const onResize = () => {
      resize();
      if (isMob !== lastIsMob) {
        lastIsMob = isMob;
        seedParticles();
        bindMouse();
      }
    };
    window.removeEventListener("resize", resize);
    window.addEventListener("resize", onResize);

    let parX = 0, parY = 0;
    let t = 0, last = performance.now();
    let ringRot = 0;
    let lastEmotion = blobLive.emotion;

    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;

      // Smooth parallax target
      parX += (pmx - parX) * 0.04;
      parY += (pmy - parY) * 0.04;

      // ── Layer 1: void gradient ───────────────────────────────────────────
      const g = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.7);
      g.addColorStop(0, "#10131A");
      g.addColorStop(0.55, "#0A0B12");
      g.addColorStop(1, "#04050A");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // ── Layer 4 (drawn early so it's behind grid): radial energy waves ───
      const cx = W * 0.5 + parX * 18;
      const cy = H * 0.5 + parY * 12;
      const heart = blobLive.breathPulse;       // 0..1
      const baseR = blobLive.blobR;
      const bodyCol = `${blobLive.bodyR | 0}, ${blobLive.bodyG | 0}, ${blobLive.bodyB | 0}`;

      for (let i = 0; i < 3; i++) {
        const phase = ((t * 0.35) + i * 0.33) % 1;
        const r = baseR * (1.4 + phase * 4.5);
        const a = (1 - phase) * 0.08 * (0.5 + heart * 0.7) * blobLive.glowMult;
        const wg = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r);
        wg.addColorStop(0, `rgba(${bodyCol}, 0)`);
        wg.addColorStop(0.5, `rgba(${bodyCol}, ${a})`);
        wg.addColorStop(1, `rgba(${bodyCol}, 0)`);
        ctx.fillStyle = wg;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      }

      // ── Layer 3: reactor rings + technical arcs (very faint) ─────────────
      ringRot += dt * 0.06;
      ctx.save();
      ctx.translate(cx, cy);

      // Concentric rings
      ctx.strokeStyle = `rgba(${bodyCol}, 0.10)`;
      ctx.lineWidth = 1;
      const ringCount = isMob ? 3 : 5;
      for (let i = 0; i < ringCount; i++) {
        const r = baseR * (1.7 + i * 0.45);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      }

      // Rotating tick arcs
      ctx.rotate(ringRot);
      ctx.strokeStyle = `rgba(${bodyCol}, 0.18)`;
      ctx.lineWidth = 1.2;
      const arcR = baseR * 2.6;
      for (let i = 0; i < 12; i++) {
        const a0 = (i / 12) * Math.PI * 2;
        const a1 = a0 + 0.06;
        ctx.beginPath(); ctx.arc(0, 0, arcR, a0, a1); ctx.stroke();
      }
      // Counter-rotation outer arc segments
      ctx.rotate(-ringRot * 2.2);
      ctx.strokeStyle = `rgba(${bodyCol}, 0.13)`;
      const arcR2 = baseR * 3.4;
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * Math.PI * 2;
        const a1 = a0 + 0.22;
        ctx.beginPath(); ctx.arc(0, 0, arcR2, a0, a1); ctx.stroke();
      }
      // Crosshair tick marks
      ctx.rotate(-ringRot * -0.5);
      ctx.strokeStyle = `rgba(${bodyCol}, 0.22)`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const x0 = Math.cos(a) * baseR * 1.55;
        const y0 = Math.sin(a) * baseR * 1.55;
        const x1 = Math.cos(a) * baseR * 1.72;
        const y1 = Math.sin(a) * baseR * 1.72;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.restore();

      // ── Layer 2: emotion-reactive drifting particles ─────────────────────
      // Detect emotion change → shockwave kick on big startles
      const emotion = blobLive.emotion;
      if (emotion !== lastEmotion) {
        if (emotion === "shocked" || emotion === "excited") {
          for (const p of PARTICLES) {
            const dx = p.x - cx, dy = p.y - cy;
            const d = Math.hypot(dx, dy) || 1;
            const force = (emotion === "shocked" ? 5.5 : 2.8) * (1 - Math.min(d / Math.max(W, H), 1));
            p.vx += (dx / d) * force;
            p.vy += (dy / d) * force;
          }
        } else if (emotion === "happy") {
          // Buoyant lift
          for (const p of PARTICLES) p.vy -= 0.6 + Math.random() * 0.4;
        }
        lastEmotion = emotion;
      }

      // Per-emotion ambient force field
      // - focused: gentle inward swirl toward the blob
      // - nervous: jitter
      // - sleeping/sleepy: heavy damping + sink
      // - excited: fast outward drift
      // - default: original gentle drift
      const damp = emotion === "sleeping" ? 0.92
        : emotion === "sleepy" ? 0.97
        : emotion === "shocked" ? 0.985
        : emotion === "excited" ? 0.995 : 0.99;
      const sink = emotion === "sleeping" ? 0.04 : emotion === "sleepy" ? 0.018 : 0;

      for (const p of PARTICLES) {
        // Per-emotion forces
        if (emotion === "focused") {
          const dx = cx - p.x, dy = cy - p.y;
          const d = Math.hypot(dx, dy) || 1;
          // tangential swirl + slight inward
          p.vx += ((-dy / d) * 0.06 + (dx / d) * 0.012) * p.z;
          p.vy += (( dx / d) * 0.06 + (dy / d) * 0.012) * p.z;
        } else if (emotion === "nervous") {
          p.vx += (Math.random() - 0.5) * 0.5 * p.z;
          p.vy += (Math.random() - 0.5) * 0.5 * p.z;
        } else if (emotion === "excited") {
          // Outward push from blob
          const dx = p.x - cx, dy = p.y - cy;
          const d = Math.hypot(dx, dy) || 1;
          p.vx += (dx / d) * 0.05 * p.z;
          p.vy += (dy / d) * 0.05 * p.z;
        } else if (emotion === "happy") {
          p.vy -= 0.012 * p.z;  // gentle rise
        }
        p.vy += sink * p.z;
        p.vx *= damp; p.vy *= damp;

        // Hard speed cap so kicks don't run away forever
        const sp = Math.hypot(p.vx, p.vy);
        const maxSp = 4.5 * p.z;
        if (sp > maxSp) { p.vx *= maxSp / sp; p.vy *= maxSp / sp; }

        p.x += p.vx;
        p.y += p.vy;
        // wrap
        if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;

        const px = p.x + parX * 24 * p.z;
        const py = p.y + parY * 16 * p.z;
        // Trail length grows with speed for motion sense
        const tail = Math.min(sp * 1.8, 8) * p.z;
        if (tail > 1.2) {
          ctx.strokeStyle = `rgba(150, 220, 255, ${p.alpha * 0.5})`;
          ctx.lineWidth = p.r * 0.9;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - p.vx * tail * 0.4, py - p.vy * tail * 0.4);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(150, 220, 255, ${p.alpha * (0.7 + heart * 0.3)})`;
        ctx.beginPath(); ctx.arc(px, py, p.r, 0, Math.PI * 2); ctx.fill();
      }

      // ── Vignette ─────────────────────────────────────────────────────────
      const v = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.35, W * 0.5, H * 0.5, Math.max(W, H) * 0.65);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.65)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      if (mouseBound) window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      style={{
        position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
        zIndex: 0, pointerEvents: "none",
      }}
    />
  );
}
