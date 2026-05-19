import { useEffect, useRef } from "react";
import { isTouchDevice } from "../lib/useIsMobile";

// Top-most cursor overlay — draws the cyan glow dot on top of every UI layer
// so the cursor stays visible over panels (which would otherwise occlude the
// dot drawn on the blob canvas underneath them). Skipped on touch devices
// where the native cursor (or lack of one) is the right behavior.

export default function CursorOverlay() {
  const ref = useRef<HTMLCanvasElement>(null);
  const skip = isTouchDevice();

  useEffect(() => {
    if (skip) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let mx = -100, my = -100, vx = 0, vy = 0, pmx = -100, pmy = -100, lastT = performance.now();
    const onMove = (e: PointerEvent) => { mx = e.clientX; my = e.clientY; };
    const onLeave = () => { mx = -100; my = -100; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);

    const loop = () => {
      const now = performance.now();
      const dt = Math.max(0.001, (now - lastT) / 1000);
      lastT = now;
      vx = (mx - pmx) / dt; vy = (my - pmy) / dt;
      pmx = mx; pmy = my;
      const speed = Math.hypot(vx, vy);
      ctx.clearRect(0, 0, W, H);
      if (mx >= 0 && my >= 0) {
        const scale = 1 + Math.min(speed / 2500, 0.6);
        const r = 5.5 * scale;
        ctx.save();
        ctx.shadowColor = "rgba(140, 220, 255, 0.95)";
        ctx.shadowBlur = 18;
        ctx.fillStyle = "rgba(220, 245, 255, 0.95)";
        ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 8;
        ctx.strokeStyle = "rgba(120, 200, 255, 0.55)";
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(mx, my, r + 6, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [skip]);

  if (skip) return null;
  return (
    <canvas
      ref={ref}
      style={{
        position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
        zIndex: 9999, pointerEvents: "none",
      }}
    />
  );
}
