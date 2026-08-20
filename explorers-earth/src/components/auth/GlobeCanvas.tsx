import { useEffect, useRef } from "react";

/**
 * The "Earthrise" background: a rotating point-cloud globe drawn on a canvas,
 * with an orbiting craft. Centered so it haloes the auth card. Respects
 * prefers-reduced-motion (holds a single frame). Cleans up on unmount.
 */
const GlobeCanvas = () => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion:reduce)").matches;

    let W = 0, H = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const N = 2400;
    const pts: [number, number, number][] = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = i * 2.399963229;
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    const city = new Set<number>();
    for (let i = 0; i < 70; i++) city.add((Math.random() * N) | 0);
    const tilt = -0.42, ct = Math.cos(tilt), st = Math.sin(tilt);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    let raf = 0;
    const draw = (ts: number) => {
      ctx.clearRect(0, 0, W, H);
      const cx = W * 0.5, cy = H * 0.5, R = Math.max(Math.min(W, H) * 0.72, 360);
      const rot = reduce ? 0.4 : ts * 0.00006;

      const ga = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.3);
      ga.addColorStop(0, "rgba(67,192,47,.12)");
      ga.addColorStop(0.55, "rgba(95,168,255,.07)");
      ga.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = ga;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.3, 0, 7);
      ctx.fill();

      for (let i = 0; i < N; i++) {
        const p = pts[i];
        const x = p[0] * Math.cos(rot) - p[2] * Math.sin(rot);
        const z0 = p[0] * Math.sin(rot) + p[2] * Math.cos(rot);
        const y0 = p[1];
        const y = y0 * ct - z0 * st;
        const z = y0 * st + z0 * ct;
        const depth = (z + 1) / 2;
        if (depth < 0.06) continue;
        const sx = cx + x * R, sy = cy + y * R;
        const isC = city.has(i);
        const a = (isC ? 0.4 : 0.08) + depth * (isC ? 0.6 : 0.62);
        const size = (isC ? 1.2 : 0.55) + depth * (isC ? 2.0 : 1.5);
        let cr, cg, cb;
        if (isC) { cr = lerp(120, 175, depth); cg = lerp(170, 245, depth); cb = lerp(150, 170, depth); }
        else { cr = lerp(34, 78, depth); cg = lerp(90, 215, depth); cb = lerp(64, 118, depth); }
        ctx.fillStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, 7);
        ctx.fill();
      }

      // orbit ring + travelling craft (in-canvas, always aligned to the globe)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.34);
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 1.16, R * 0.34, 0, 0, 7);
      ctx.strokeStyle = "rgba(224,146,92,.28)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
      const oa = reduce ? 0.8 : ts * 0.00035;
      const ox = Math.cos(oa) * R * 1.16, oy = Math.sin(oa) * R * 0.34;
      ctx.beginPath(); ctx.arc(ox, oy, 8, 0, 7); ctx.fillStyle = "rgba(224,146,92,.35)"; ctx.fill();
      ctx.beginPath(); ctx.arc(ox, oy, 2.6, 0, 7); ctx.fillStyle = "#f6efe2"; ctx.fill();
      ctx.restore();

      if (!reduce) raf = requestAnimationFrame(draw);
    };

    if (reduce) draw(0);
    else raf = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} className="ea-globe" aria-hidden="true" />;
};

export default GlobeCanvas;
