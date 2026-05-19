import { useEffect, useRef } from "react";
import { blobLive } from "./lib/blobLive";

// ─── Emotion system ───────────────────────────────────────────────────────────

type Emotion = "idle"|"curious"|"happy"|"excited"|"nervous"|"focused"|"sleepy"|"sleeping"|"shocked"|"suspicious";
type AttentionMode = "lookingAround"|"followingCursor"|"staring"|"ignoring"|"sleepyDrift";
type ActivityState = "calm"|"alert"|"interacting"|"recovering"|"sleeping";

// Each emotion expresses through pill dimensions, tilt, spacing.
// Optional rightPillH/W creates true asymmetric expressions (suspicious wink).
interface EmotionDef {
  pillH: number; pillW: number;
  rightPillH?: number; rightPillW?: number;
  tilt: number; spacing: number;
  blinkMin: number; blinkMax: number;
  blinkScale: number;          // multiplies blink phase durations (sleepy=heavy/slow, excited=snappy)
  breathRate: number; breathDepth: number;
  wobbleAmp: number; trembleAmp: number; glowMult: number;
  trackGain: number;           // eye-tracking responsiveness 0-1
  lookYBias: number;           // mood gaze offset (negative = look up, positive = down)
  holdMin: number; holdMax: number;
  saccadeAmt: number;          // 0 = locked-on, 1 = lots of darting
  body: [number, number, number]; // RGB rim color
  eye:  [number, number, number]; // RGB eye tint (kept near-white for readability)
}

const E: Record<Emotion, EmotionDef> = {
  // Resting — classic light blue
  idle:       { pillH: 1.00, pillW: 1.00, tilt: 0,      spacing: 1.00, blinkMin: 3.0, blinkMax: 5.5, blinkScale: 1.0, breathRate: 0.35, breathDepth: 0.018, wobbleAmp: 1.00, trembleAmp: 0,   glowMult: 1.00, trackGain: 0.60, lookYBias: 0,     saccadeAmt: 0.55, holdMin: 4,  holdMax: 9, body: [80,200,255], eye: [255,255,255] },
  // Curious — blue-violet (intrigued)
  curious:    { pillH: 1.20, pillW: 1.04, rightPillH: 1.05, tilt: 0.12, spacing: 0.92, blinkMin: 4.5, blinkMax: 8.5, blinkScale: 0.90, breathRate: 0.44, breathDepth: 0.020, wobbleAmp: 1.20, trembleAmp: 0,   glowMult: 1.10, trackGain: 0.90, lookYBias: -0.04, saccadeAmt: 0.20, holdMin: 3,  holdMax: 6, body: [160,170,255], eye: [240,235,255] },
  // Happy — warm gold/yellow
  happy:      { pillH: 0.42, pillW: 1.22, tilt: -0.13,  spacing: 1.07, blinkMin: 2.8, blinkMax: 5.0, blinkScale: 1.10, breathRate: 0.45, breathDepth: 0.024, wobbleAmp: 1.25, trembleAmp: 0,   glowMult: 1.24, trackGain: 0.35, lookYBias: -0.05, saccadeAmt: 0.10, holdMin: 2.5,holdMax: 4, body: [255,210,90],  eye: [255,250,220] },
  // Excited — hot pink/magenta
  excited:    { pillH: 1.32, pillW: 1.12, tilt: 0.06,   spacing: 1.08, blinkMin: 1.4, blinkMax: 2.5, blinkScale: 0.70, breathRate: 0.90, breathDepth: 0.036, wobbleAmp: 2.20, trembleAmp: 0,   glowMult: 1.34, trackGain: 1.00, lookYBias: -0.02, saccadeAmt: 0.45, holdMin: 2,  holdMax: 4, body: [255,120,210], eye: [255,235,250] },
  // Nervous — sickly pale green
  nervous:    { pillH: 0.78, pillW: 0.78, tilt: 0.06,   spacing: 0.84, blinkMin: 0.4, blinkMax: 1.2, blinkScale: 0.65, breathRate: 0.95, breathDepth: 0.012, wobbleAmp: 0.55, trembleAmp: 1.2, glowMult: 0.85, trackGain: 1.15, lookYBias: 0.02,  saccadeAmt: 0.95, holdMin: 1.5,holdMax: 3.5, body: [140,240,180], eye: [235,255,240] },
  // Focused — deep saturated blue
  focused:    { pillH: 0.38, pillW: 1.32, tilt: 0,      spacing: 1.00, blinkMin: 7.0, blinkMax: 12.0,blinkScale: 0.85, breathRate: 0.26, breathDepth: 0.010, wobbleAmp: 0.42, trembleAmp: 0,   glowMult: 1.28, trackGain: 1.30, lookYBias: 0,     saccadeAmt: 0,    holdMin: 3,  holdMax: 7, body: [80,140,255],  eye: [220,235,255] },
  // Sleepy — dim purple
  sleepy:     { pillH: 0.34, pillW: 0.94, tilt: -0.10,  spacing: 1.00, blinkMin: 1.6, blinkMax: 3.0, blinkScale: 1.80, breathRate: 0.20, breathDepth: 0.028, wobbleAmp: 0.38, trembleAmp: 0,   glowMult: 0.62, trackGain: 0.20, lookYBias: 0.06,  saccadeAmt: 0.05, holdMin: 4,  holdMax: 9, body: [170,130,210], eye: [230,220,240] },
  // Sleeping — very dim blue-grey
  sleeping:   { pillH: 0.025,pillW: 1.00, tilt: 0,      spacing: 1.00, blinkMin: 999, blinkMax: 999, blinkScale: 1.0, breathRate: 0.13, breathDepth: 0.034, wobbleAmp: 0.18, trembleAmp: 0,   glowMult: 0.28, trackGain: 0,    lookYBias: 0.08,  saccadeAmt: 0,    holdMin: 999,holdMax: 999, body: [110,140,180], eye: [200,210,225] },
  // Shocked — alarming red-orange
  shocked:    { pillH: 1.62, pillW: 1.28, tilt: 0,      spacing: 1.16, blinkMin: 9.0, blinkMax: 16.0,blinkScale: 1.0, breathRate: 0.45, breathDepth: 0.014, wobbleAmp: 0.50, trembleAmp: 0,   glowMult: 1.55, trackGain: 0.20, lookYBias: -0.03, saccadeAmt: 0,    holdMin: 1,  holdMax: 2, body: [255,110,110], eye: [255,235,230] },
  // Suspicious — amber/gold
  suspicious: { pillH: 0.92, pillW: 1.00, rightPillH: 0.30, rightPillW: 0.95, tilt: 0.11, spacing: 0.93, blinkMin: 4.0, blinkMax: 9.0, blinkScale: 0.95, breathRate: 0.35, breathDepth: 0.014, wobbleAmp: 0.72, trembleAmp: 0, glowMult: 0.92, trackGain: 1.00, lookYBias: 0,     saccadeAmt: 0.05, holdMin: 2.5,holdMax: 5, body: [255,180,80],  eye: [255,245,220] },
};

// ─── Math helpers ─────────────────────────────────────────────────────────────
function dist(x1:number,y1:number,x2:number,y2:number){return Math.sqrt((x2-x1)**2+(y2-y1)**2);}
function lerp(a:number,b:number,t:number){return a+(b-a)*t;}
function clamp(v:number,lo:number,hi:number){return Math.max(lo,Math.min(hi,v));}
function easeInOut(t:number){return t<0.5?2*t*t:-1+(4-2*t)*t;}
function rand(a:number,b:number){return a+Math.random()*(b-a);}

// ─── Catmull-Rom spline ───────────────────────────────────────────────────────
function smoothPath(ctx:CanvasRenderingContext2D,pts:{x:number;y:number}[]){
  const n=pts.length;
  ctx.beginPath();
  for(let i=0;i<n;i++){
    const p0=pts[(i-1+n)%n],p1=pts[i],p2=pts[(i+1)%n],p3=pts[(i+2)%n];
    const cp1x=p1.x+(p2.x-p0.x)/6,cp1y=p1.y+(p2.y-p0.y)/6;
    const cp2x=p2.x-(p3.x-p1.x)/6,cp2y=p2.y-(p3.y-p1.y)/6;
    if(i===0)ctx.moveTo(p1.x,p1.y);
    ctx.bezierCurveTo(cp1x,cp1y,cp2x,cp2y,p2.x,p2.y);
  }
  ctx.closePath();
}

// ─── Blob geometry ────────────────────────────────────────────────────────────
function getBlobPoints(cx:number,cy:number,baseR:number,jelloValue:number,jelloAngle:number,time:number,pullAngle=0,pullStretch=0,wobbleAmp=1.0,trembleAmp=0,extraBreath=0,N=64):{x:number;y:number}[]{
  const gravSquash=0.09;
  const weightShift=Math.sin(time*0.20)*6*wobbleAmp;
  const breathe=Math.sin(time*0.42)*3.5*wobbleAmp+extraBreath;
  return Array.from({length:N},(_,i)=>{
    const a=(i/N)*Math.PI*2;
    const wobble=(Math.sin(a*2+time*0.30)*4.5+Math.sin(a*3-time*0.24)*3.0+Math.sin(a*4+time*0.48)*2.0+Math.sin(a*1-time*0.13)*weightShift+breathe)*wobbleAmp;
    const tremble=trembleAmp>0?(Math.sin(a*8+time*18)*1.5+Math.sin(a*11-time*22)*1.0)*trembleAmp:0;
    const jello=jelloValue*Math.cos(2*(a-jelloAngle));
    const align=Math.cos(a-pullAngle);
    const pull=pullStretch*Math.max(0,align*align*align);
    const r=baseR+wobble+jello+pull+tremble;
    return{x:cx+Math.cos(a)*r*(1+gravSquash*0.85),y:cy+Math.sin(a)*r*(1-gravSquash*0.50)};
  });
}

function getPullPoints(cx:number,cy:number,radius:number,time:number,N=48):{x:number;y:number}[]{
  return Array.from({length:N},(_,i)=>{
    const a=(i/N)*Math.PI*2;
    const w=Math.sin(a*2+time*0.55)*radius*0.055+Math.sin(a*3-time*0.38)*radius*0.035+Math.sin(a*5+time*0.70)*radius*0.020;
    return{x:cx+Math.cos(a)*(radius+w),y:cy+Math.sin(a)*(radius+w)};
  });
}

// ─── Bubble rendering ─────────────────────────────────────────────────────────
// Lighten an RGB triplet toward white by amount t ∈ [0,1]
function lighten(c:[number,number,number], t:number):[number,number,number]{
  return [c[0]+(255-c[0])*t, c[1]+(255-c[1])*t, c[2]+(255-c[2])*t];
}
function rgba(c:[number,number,number], a:number){return `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;}

function drawBubble(ctx:CanvasRenderingContext2D,pts:{x:number;y:number}[],cx:number,cy:number,radius:number,glowMult:number, body:[number,number,number]){
  ctx.save();
  smoothPath(ctx,pts);ctx.clip();
  const box=radius*2.8;
  ctx.fillStyle="#000814";ctx.fillRect(cx-box,cy-box,box*2,box*2);
  const g=clamp(glowMult,0.12,2.0);
  // Three-pass rim: outer glow → mid stroke → bright inner highlight
  const cBase = body;                 // outer glow color
  const cMid  = lighten(body, 0.45);  // mid stroke
  const cHi   = lighten(body, 0.80);  // bright highlight stroke
  smoothPath(ctx,pts);ctx.shadowColor=rgba(cBase, g);ctx.shadowBlur=48;ctx.strokeStyle=rgba(cBase, 0.18*g);ctx.lineWidth=28;ctx.stroke();
  smoothPath(ctx,pts);ctx.shadowColor=rgba(cMid,  0.95*g);ctx.shadowBlur=18;ctx.strokeStyle=rgba(cMid, 0.55*g);ctx.lineWidth=7;ctx.stroke();
  smoothPath(ctx,pts);ctx.shadowColor=rgba(cHi,   0.60*g);ctx.shadowBlur=6; ctx.strokeStyle=rgba(cHi,  0.85*g);ctx.lineWidth=2.5;ctx.stroke();
  ctx.shadowColor="transparent";ctx.shadowBlur=0;
  const off=radius*0.25;
  const hl=ctx.createRadialGradient(cx-off,cy-off*1.5,0,cx-off,cy-off,radius*0.55);
  hl.addColorStop(0,"rgba(255,255,255,0.13)");hl.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=hl;ctx.fillRect(cx-box,cy-box,box*2,box*2);
  ctx.restore();
  ctx.save();
  smoothPath(ctx,pts);ctx.shadowColor=rgba(cBase, 0.45*g);ctx.shadowBlur=22;ctx.strokeStyle=rgba(cMid, 0.50*g);ctx.lineWidth=1.8;ctx.stroke();
  ctx.restore();
}

function drawStrand(ctx:CanvasRenderingContext2D,x1:number,y1:number,r1:number,x2:number,y2:number,r2:number, body:[number,number,number]){
  const d=dist(x1,y1,x2,y2),maxD=r1+r2*2.8;if(d>=maxD||r2<3)return;
  const t=clamp(1-(d-r1*0.15)/(maxD-r1*0.15),0,1);
  const w1=r1*0.48*t,w2=r2*0.55*t;
  const ang=Math.atan2(y2-y1,x2-x1),perp=ang+Math.PI/2;
  const e1x=x1+Math.cos(ang)*r1*0.80,e1y=y1+Math.sin(ang)*r1*0.80;
  const e2x=x2-Math.cos(ang)*r2*0.72,e2y=y2-Math.sin(ang)*r2*0.72;
  const cp1x=e1x+Math.cos(ang)*d*0.22,cp1y=e1y+Math.sin(ang)*d*0.22;
  const cp2x=e2x-Math.cos(ang)*d*0.22,cp2y=e2y-Math.sin(ang)*d*0.22;
  ctx.save();ctx.beginPath();
  ctx.moveTo(e1x+Math.cos(perp)*w1,e1y+Math.sin(perp)*w1);
  ctx.bezierCurveTo(cp1x+Math.cos(perp)*w1*0.4,cp1y+Math.sin(perp)*w1*0.4,cp2x+Math.cos(perp)*w2*0.4,cp2y+Math.sin(perp)*w2*0.4,e2x+Math.cos(perp)*w2,e2y+Math.sin(perp)*w2);
  ctx.lineTo(e2x-Math.cos(perp)*w2,e2y-Math.sin(perp)*w2);
  ctx.bezierCurveTo(cp2x-Math.cos(perp)*w2*0.4,cp2y-Math.sin(perp)*w2*0.4,cp1x-Math.cos(perp)*w1*0.4,cp1y-Math.sin(perp)*w1*0.4,e1x-Math.cos(perp)*w1,e1y-Math.sin(perp)*w1);
  ctx.closePath();
  const cMid=lighten(body,0.45);
  const grd=ctx.createLinearGradient(x1,y1,x2,y2);
  grd.addColorStop(0,rgba(cMid,t*0.70));grd.addColorStop(0.5,rgba(body,t*0.50));grd.addColorStop(1,rgba(cMid,t*0.70));
  ctx.fillStyle=grd;ctx.shadowColor=rgba(body,0.4);ctx.shadowBlur=8;ctx.fill();ctx.restore();
}

// ─── Eye drawing — true semicircular pill with smooth collapse ───────────────
function drawPillEye(ctx:CanvasRenderingContext2D,ex:number,ey:number,pillW:number,pillH:number,tilt:number,glowMult:number, eye:[number,number,number]){
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(tilt);

  const pillR = pillW / 2;
  const halfH = pillH / 2;
  const glowC = lighten(eye, 0.15);  // slightly desaturated glow halo

  if (pillH < 1.5) {
    ctx.beginPath();
    ctx.moveTo(-pillR * 1.55, 0);
    ctx.lineTo( pillR * 1.55, 0);
    ctx.strokeStyle = rgba(eye, 0.86);
    ctx.lineWidth   = 1.6; ctx.lineCap = "round";
    ctx.shadowColor = rgba(glowC, 0.7 * glowMult);
    ctx.shadowBlur  = 6 * glowMult;
    ctx.stroke();
    ctx.restore(); return;
  }

  ctx.shadowColor = rgba(glowC, 0.88 * glowMult);
  ctx.shadowBlur  = 14 * clamp(glowMult, 0.3, 1.9);
  ctx.fillStyle   = rgba(eye, 0.97);

  const buildPath = () => {
    ctx.beginPath();
    if (halfH <= pillR) {
      ctx.ellipse(0, 0, pillR, halfH, 0, 0, Math.PI * 2);
    } else {
      const innerH = halfH - pillR;
      ctx.moveTo( pillR, -innerH);
      ctx.lineTo( pillR,  innerH);
      ctx.arc(0,  innerH, pillR, 0, Math.PI);
      ctx.lineTo(-pillR, -innerH);
      ctx.arc(0, -innerH, pillR, Math.PI, 0);
      ctx.closePath();
    }
  };

  buildPath(); ctx.fill();

  ctx.save(); buildPath(); ctx.clip();
  ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
  const hlX = -pillR * 0.18, hlY = -halfH * 0.55;
  const hlRY = Math.min(pillR * 0.78, halfH * 0.78);
  ctx.beginPath();
  ctx.ellipse(hlX, hlY, pillR * 0.55, hlRY, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.46)";
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

// ─── Blob API (DEV only — exposed via window.__blobAPI) ───────────────────────
interface BlobAPI{setEmotion:(e:Emotion)=>void;triggerBlink:()=>void;triggerDoubleBlink:()=>void;toggleCursorFollow:()=>void;toggleAutoBrain:()=>void;wakeUp:()=>void;}

// ─── Main App ─────────────────────────────────────────────────────────────────

const BLINK_CLOSE = 0.065;
const BLINK_HOLD  = 0.025;
const BLINK_OPEN  = 0.105;
const DOUBLE_GAP  = 0.075;

export default function App(){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const apiRef=useRef<BlobAPI>({setEmotion:()=>{},triggerBlink:()=>{},triggerDoubleBlink:()=>{},toggleCursorFollow:()=>{},toggleAutoBrain:()=>{},wakeUp:()=>{}});

  useEffect(()=>{
    const canvas=canvasRef.current!;
    const ctx=canvas.getContext("2d")!;
    let animId:number;

    let blobX=0,blobY=0,isMob=false;
    const resize=()=>{
      isMob = window.matchMedia("(max-width: 820px)").matches;
      canvas.width=window.innerWidth;canvas.height=window.innerHeight;
      blobX=canvas.width/2;
      // On mobile, sit the blob in the upper "hero" area; on desktop, vertical center.
      blobY = isMob ? canvas.height * 0.30 : canvas.height/2;
    };
    resize();window.addEventListener("resize",resize);

    // Slightly smaller blob on mobile so the reactor rings still fit
    const getBR=()=>Math.min(canvas.width,canvas.height) * (isMob ? 0.22 : 0.19);

    // Cached offscreen canvas for the floor reflection — reusing this avoids
    // allocating a new canvas every animation frame (was a real perf hit).
    const reflCanvas = document.createElement("canvas");
    const reflCtx = reflCanvas.getContext("2d");

    // ── Smoothed eye state ──────────────────────────────────────────────────────
    const es={
      lPillH: 1.0, rPillH: 1.0,
      lPillW: 1.0, rPillW: 1.0,
      // Eye-look offsets — both eyes shift toward target (cursor or saccade)
      lookX: 0, lookY: 0,
      tgtLookX: 0, tgtLookY: 0,
      // Independent micro-saccade targets (small natural drift)
      saccX: 0, saccY: 0,
      saccTimer: 1,
      // Startle add — temporary boost to pillH when sudden movement
      startleAdd: 0,
    };

    // ── Behavior state ─────────────────────────────────────────────────────────
    const bs={
      emotion:"idle" as Emotion,
      attentionMode:"lookingAround" as AttentionMode,
      activityState:"calm" as ActivityState,
      autoBrain:true,
      // Smoothed body
      tilt:0, spacing:1.0, glowMult:1.0,
      breathRate:0.35, breathDepth:0.018,
      wobbleAmp:1.0, trembleAmp:0,
      trackGain:0.55,
      lookYBias:0, saccadeAmt:0.55, blinkScale:1.0,
      // Lerped colors (RGB) for body and eyes
      bodyR:80, bodyG:200, bodyB:255,
      eyeR:255, eyeG:255, eyeB:255,
      // Emotion entry pulse (decays from 1 → 0)
      entryPulse:0,
      // Blink
      blinkPhase:0, blinkPT:0,
      blinkTimer:rand(2,4),
      doubleDelay:0,
      // Brain timers
      emotionHold: 4,             // min time current emotion must be held
      emotionTimer:rand(5,10),    // when to consider new random emotion
      attentionTimer:rand(4,9),
      lastInteract:performance.now(),
      sleepiness:0,
      // Cursor analytics (for triggering reactions)
      cursorFollow:true,
      leanX:0, leanY:0, targetLeanX:0, targetLeanY:0,
      cursorVX:0, cursorVY:0, cursorVel:0,
      cursorDist:0, prevCursorDist:9999,
      cursorStillTime: 0,         // accumulator for "cursor sitting still nearby"
      cursorApproachTime: 0,      // accumulator for "cursor steadily approaching"
      jitterScore: 0,             // exponential-decay measure of jittery movement
      // Glow flicker
      glowFlicker:1.0,
      // FPS
      fps:60, frameCount:0, lastFpsTime:performance.now(),
    };

    // ── Physics ────────────────────────────────────────────────────────────────
    let jelloAmp=0,jelloAngle=0,jelloT=0;
    let pullX=blobX,pullY=blobY,pullVX=0,pullVY=0,pullRadius=0,pullTargetR=0;
    let pulling=false,returning=false;
    let mouseX=canvas.width/2,mouseY=canvas.height/2;
    let prevMX=mouseX, prevMY=mouseY;
    let time=0,lastNow=performance.now(),breathPhase=0;

    // ── Behavior helpers ───────────────────────────────────────────────────────
    const applyEmotion=(e:Emotion, hold?:number)=>{
      if (bs.emotion === e) return;
      bs.emotion=e;
      const cfg=E[e];
      bs.emotionHold = hold ?? rand(cfg.holdMin, cfg.holdMax);
      bs.emotionTimer = bs.emotionHold + rand(2, 5);
      bs.entryPulse = 1.0;  // brief glow flash + extra-fast lerp on transition
      if(e!=="sleeping") bs.blinkTimer=rand(cfg.blinkMin*0.8, cfg.blinkMax);
    };

    const triggerBlink=()=>{
      if (bs.blinkPhase === 0) { bs.blinkPhase = 1; bs.blinkPT = 0; }
    };
    const triggerDoubleBlink=()=>{ triggerBlink(); bs.doubleDelay = -1; };

    const wakeUp=()=>{
      if(bs.emotion==="sleeping"||bs.emotion==="sleepy"){applyEmotion("shocked", 0.8);bs.activityState="alert";bs.sleepiness=0;}
      bs.lastInteract=performance.now();
    };

    apiRef.current={
      setEmotion:(e)=>{applyEmotion(e, 5);bs.autoBrain=false;setTimeout(()=>bs.autoBrain=true,10000);},
      triggerBlink,triggerDoubleBlink,
      toggleCursorFollow:()=>{bs.cursorFollow=!bs.cursorFollow;},
      toggleAutoBrain:()=>{bs.autoBrain=!bs.autoBrain;},
      wakeUp,
    };
    if (import.meta.env.DEV) (window as any).__blobAPI=apiRef.current;

    // ── Main loop ──────────────────────────────────────────────────────────────
    function loop(now:number){
      const dt=Math.min((now-lastNow)/1000,0.05);
      lastNow=now;time+=dt;breathPhase+=dt;

      const BR=getBR();
      const cfg=E[bs.emotion];

      // FPS
      bs.frameCount++;
      if(now-bs.lastFpsTime>700){bs.fps=Math.round(bs.frameCount/((now-bs.lastFpsTime)/1000));bs.frameCount=0;bs.lastFpsTime=now;}

      // ── Cursor analytics ────────────────────────────────────────────────────
      const rawVX = (mouseX - prevMX) / Math.max(dt, 1e-3);
      const rawVY = (mouseY - prevMY) / Math.max(dt, 1e-3);
      bs.cursorVX = lerp(bs.cursorVX, rawVX, 0.35);
      bs.cursorVY = lerp(bs.cursorVY, rawVY, 0.35);
      bs.cursorVel = Math.sqrt(bs.cursorVX*bs.cursorVX + bs.cursorVY*bs.cursorVY);
      prevMX = mouseX; prevMY = mouseY;

      const cdx0 = mouseX - blobX, cdy0 = mouseY - blobY;
      bs.prevCursorDist = bs.cursorDist;
      bs.cursorDist = Math.sqrt(cdx0*cdx0 + cdy0*cdy0);

      // Cursor "still" accumulator (for triggering focused)
      if (bs.cursorVel < 60 && bs.cursorDist < BR * 3) bs.cursorStillTime += dt;
      else bs.cursorStillTime = 0;

      // Cursor "steadily approaching from far" (for suspicious)
      if (bs.cursorDist > BR * 1.3 && bs.cursorDist < BR * 5
          && bs.prevCursorDist - bs.cursorDist > 0
          && bs.cursorVel > 50 && bs.cursorVel < 700)
        bs.cursorApproachTime += dt;
      else bs.cursorApproachTime *= 0.92;

      // Jitter score: integrate fast direction-changing movement
      const jitterIn = clamp((bs.cursorVel - 800) / 2000, 0, 1);
      bs.jitterScore = bs.jitterScore * 0.94 + jitterIn * 0.06 * 8;

      // ── Emotion entry pulse (boost lerp + glow briefly on transition) ──────
      bs.entryPulse = Math.max(0, bs.entryPulse - dt * 2.5);
      const entryBoost = 1 + bs.entryPulse * 1.6;  // up to 2.6× lerp speed at fresh entry

      // ── Lerp body & eye dimensions ──────────────────────────────────────────
      const el = dt * 2.6 * entryBoost;
      const tgtLH = cfg.pillH;
      const tgtRH = cfg.rightPillH ?? cfg.pillH;
      const tgtLW = cfg.pillW;
      const tgtRW = cfg.rightPillW ?? cfg.pillW;
      es.lPillH = lerp(es.lPillH, tgtLH, el);
      es.rPillH = lerp(es.rPillH, tgtRH, el);
      es.lPillW = lerp(es.lPillW, tgtLW, el);
      es.rPillW = lerp(es.rPillW, tgtRW, el);

      bs.tilt       = lerp(bs.tilt,       cfg.tilt,       el);
      bs.spacing    = lerp(bs.spacing,    cfg.spacing,    el);
      bs.breathRate = lerp(bs.breathRate, cfg.breathRate, el*0.4);
      bs.breathDepth= lerp(bs.breathDepth,cfg.breathDepth,el*0.4);
      bs.wobbleAmp  = lerp(bs.wobbleAmp,  cfg.wobbleAmp,  el);
      bs.trembleAmp = lerp(bs.trembleAmp, cfg.trembleAmp, el*3);
      bs.glowMult   = lerp(bs.glowMult,   cfg.glowMult,   el);
      bs.trackGain  = lerp(bs.trackGain,  cfg.trackGain,  el);
      bs.lookYBias  = lerp(bs.lookYBias,  cfg.lookYBias,  el);
      bs.saccadeAmt = lerp(bs.saccadeAmt, cfg.saccadeAmt, el);
      bs.blinkScale = lerp(bs.blinkScale, cfg.blinkScale, el);
      // Color lerp (slightly slower than physics so transitions read as a wash)
      const cl = el * 0.7;
      bs.bodyR = lerp(bs.bodyR, cfg.body[0], cl);
      bs.bodyG = lerp(bs.bodyG, cfg.body[1], cl);
      bs.bodyB = lerp(bs.bodyB, cfg.body[2], cl);
      bs.eyeR  = lerp(bs.eyeR,  cfg.eye[0],  cl);
      bs.eyeG  = lerp(bs.eyeG,  cfg.eye[1],  cl);
      bs.eyeB  = lerp(bs.eyeB,  cfg.eye[2],  cl);
      const bodyCol:[number,number,number] = [bs.bodyR, bs.bodyG, bs.bodyB];
      const eyeCol :[number,number,number] = [bs.eyeR,  bs.eyeG,  bs.eyeB];
      bs.glowFlicker= 1 + Math.sin(time*0.65)*0.035 + Math.sin(time*1.42)*0.018;
      // Entry pulse adds a brief rim brighten
      const finalGlow = clamp(bs.glowMult * bs.glowFlicker * (1 + bs.entryPulse * 0.25), 0.12, 2.2);

      // ── Startle: sudden cursor movement spike ───────────────────────────────
      const startleTrig = clamp((bs.cursorVel - 1500) / 2500, 0, 1);
      es.startleAdd = Math.max(es.startleAdd * Math.pow(0.04, dt), startleTrig * 0.35);

      // ── Eye look-target: cursor offset (within blob radius), clamped ────────
      const lookMaxX = BR * 0.11;
      const lookMaxY = BR * 0.07;
      const lookGain = bs.cursorFollow && bs.emotion!=="sleeping"
        ? bs.trackGain : 0;
      const lookTgtX = clamp(cdx0 * 0.045, -lookMaxX, lookMaxX) * lookGain;
      const lookTgtY = clamp(cdy0 * 0.028, -lookMaxY, lookMaxY) * lookGain;
      // Mood gaze offset (eyes look up when happy, down when sleepy, etc.)
      const moodOffsetY = bs.lookYBias * BR;

      // Saccade timer rate scaled by emotion (nervous = darty, focused = none)
      es.saccTimer -= dt * (0.5 + bs.saccadeAmt * 1.2);
      if (es.saccTimer <= 0) {
        es.saccTimer = rand(0.5, 1.6);
        if (bs.saccadeAmt > 0.05 && bs.emotion !== "sleeping") {
          es.saccX = rand(-1, 1) * BR * 0.08 * bs.saccadeAmt;
          es.saccY = rand(-1, 1) * BR * 0.04 * bs.saccadeAmt;
        } else {
          es.saccX *= 0.3; es.saccY *= 0.3;
        }
      }

      es.tgtLookX = lookTgtX + es.saccX;
      es.tgtLookY = lookTgtY + es.saccY + moodOffsetY;
      // Faster eye lerp (more responsive feel) — boosted on emotion entry
      const eyeLerpRate = dt * (8 + bs.entryPulse * 8);
      es.lookX = lerp(es.lookX, es.tgtLookX, Math.min(1, eyeLerpRate));
      es.lookY = lerp(es.lookY, es.tgtLookY, Math.min(1, eyeLerpRate));

      // ── Blink scheduler ─────────────────────────────────────────────────────
      bs.blinkTimer -= dt;
      if (bs.blinkTimer <= 0 && bs.emotion !== "sleeping" && bs.blinkPhase === 0) {
        if (Math.random() < 0.22) triggerDoubleBlink();
        else triggerBlink();
        bs.blinkTimer = rand(cfg.blinkMin, cfg.blinkMax);
      }

      // ── Blink state machine (durations scaled per emotion) ──────────────────
      const bsCl = BLINK_CLOSE * bs.blinkScale;
      const bsHd = BLINK_HOLD  * bs.blinkScale;
      const bsOp = BLINK_OPEN  * bs.blinkScale;
      let blinkAmt = 0;
      if (bs.blinkPhase > 0) {
        bs.blinkPT += dt;
        if (bs.blinkPhase === 1) {
          const t = Math.min(1, bs.blinkPT / bsCl);
          blinkAmt = easeInOut(t);
          if (t >= 1) { bs.blinkPhase = 2; bs.blinkPT = 0; }
        } else if (bs.blinkPhase === 2) {
          blinkAmt = 1;
          if (bs.blinkPT >= bsHd) { bs.blinkPhase = 3; bs.blinkPT = 0; }
        } else {
          const t = Math.min(1, bs.blinkPT / bsOp);
          blinkAmt = 1 - easeInOut(t);
          if (t >= 1) {
            bs.blinkPhase = 0; bs.blinkPT = 0; blinkAmt = 0;
            if (bs.doubleDelay === -1) bs.doubleDelay = DOUBLE_GAP;
          }
        }
      } else if (bs.doubleDelay > 0) {
        bs.doubleDelay -= dt;
        if (bs.doubleDelay <= 0) { bs.doubleDelay = 0; triggerBlink(); }
      }

      // ── Reactive brain (proper triggers, not random rotation) ───────────────
      bs.emotionHold -= dt;
      bs.emotionTimer -= dt;

      if (bs.autoBrain) {
        const inactive = (now - bs.lastInteract) / 1000;
        bs.sleepiness = clamp((inactive - 18) / 28, 0, 1);

        // Wake from sleep on any cursor movement / proximity
        if ((bs.emotion === "sleeping" || bs.emotion === "sleepy") &&
            (bs.cursorVel > 200 || bs.cursorDist < BR * 1.4) && !pulling) {
          applyEmotion("curious", 2);
          bs.lastInteract = now;
        }

        if (bs.emotionHold <= 0 && !pulling) {
          // ── Reactive triggers (cursor-driven), only when not in sleep ──────
          if (bs.emotion !== "sleeping") {

            // Heavy jitter → nervous
            if (bs.jitterScore > 1.4 && bs.emotion !== "nervous") {
              applyEmotion("nervous");
            }
            // Long cursor stillness near blob → focused (it's studying you)
            else if (bs.cursorStillTime > 1.6 && bs.cursorDist < BR * 2.5
                     && bs.emotion !== "focused" && bs.emotion !== "happy") {
              applyEmotion("focused");
            }
            // Sustained slow approach → suspicious
            else if (bs.cursorApproachTime > 0.9 && bs.cursorDist < BR * 3.5
                     && bs.emotion !== "suspicious") {
              applyEmotion("suspicious");
            }
            // Cursor very close, moderate movement → curious
            else if (bs.cursorDist < BR * 1.3 && bs.cursorVel > 80 && bs.cursorVel < 800
                     && (bs.emotion === "idle" || bs.emotion === "curious")) {
              applyEmotion("curious");
            }
            // Sleepiness ramp
            else if (bs.sleepiness > 0.85 && bs.emotion !== "sleepy") {
              applyEmotion(bs.sleepiness > 0.97 ? "sleeping" : "sleepy");
              bs.activityState = "sleeping";
            }
            // After timer, decay back toward idle if no triggers fired
            else if (bs.emotionTimer <= 0) {
              if (bs.emotion !== "idle") applyEmotion("idle");
              bs.emotionTimer = rand(4, 8);
            }
          }
        }

        // Attention mode (independent of emotion)
        bs.attentionTimer -= dt;
        if (bs.attentionTimer <= 0) {
          if (bs.emotion === "sleeping") bs.attentionMode = "sleepyDrift";
          else if (bs.emotion === "focused") bs.attentionMode = "staring";
          else if (bs.emotion === "suspicious") bs.attentionMode = "staring";
          else if (bs.cursorDist < BR * 3) bs.attentionMode = "followingCursor";
          else {
            const modes:AttentionMode[] = ["lookingAround","followingCursor","lookingAround","staring","ignoring"];
            bs.attentionMode = modes[Math.floor(Math.random()*modes.length)];
          }
          bs.attentionTimer = rand(3.5, 8);
        }
      }

      // ── Cursor-driven blob lean ────────────────────────────────────────────
      if (bs.cursorFollow && bs.emotion !== "sleeping") {
        const follow = bs.attentionMode === "followingCursor" || bs.attentionMode === "staring";
        const ignore = bs.attentionMode === "ignoring";
        if (follow && bs.cursorDist < BR * 5) {
          bs.targetLeanX = clamp(cdx0 * 0.045, -9, 9);
          bs.targetLeanY = clamp(cdy0 * 0.028, -6, 6);
        } else if (!ignore && bs.cursorDist < BR * 1.6) {
          bs.targetLeanX = clamp(cdx0 * 0.012, -4, 4);
          bs.targetLeanY = clamp(cdy0 * 0.008, -3, 3);
        } else { bs.targetLeanX *= 0.97; bs.targetLeanY *= 0.97; }
      } else { bs.targetLeanX *= 0.96; bs.targetLeanY *= 0.96; }
      bs.leanX = lerp(bs.leanX, bs.targetLeanX, dt * 1.1);
      bs.leanY = lerp(bs.leanY, bs.targetLeanY, dt * 1.1);

      // ── Physics ────────────────────────────────────────────────────────────
      jelloT+=dt;
      const jelloValue=jelloAmp>0.5?jelloAmp*Math.exp(-jelloT*3.8)*Math.sin(jelloT*17):0;
      const extraBreath=Math.sin(breathPhase*bs.breathRate*Math.PI*2)*BR*bs.breathDepth;

      if(pulling&&!returning){
        pullX=lerp(pullX,mouseX,0.17);pullY=lerp(pullY,mouseY,0.17);
        pullRadius=lerp(pullRadius,pullTargetR,dt*5.5);
      }
      if(returning){
        pullVX=(pullVX+(blobX-pullX)*0.042)*0.875;pullVY=(pullVY+(blobY-pullY)*0.042)*0.875;
        pullX+=pullVX;pullY+=pullVY;
        const abD=dist(pullX,pullY,blobX,blobY);
        pullRadius=lerp(pullRadius,0,dt*2.0+clamp(1-abD/(BR*0.9),0,1)*0.06);
        if(abD<BR*0.52||pullRadius<5){
          pulling=returning=false;pullRadius=0;
          jelloAmp=24+Math.random()*12;jelloAngle=Math.atan2(pullY-blobY,pullX-blobX);jelloT=0;
          if(bs.autoBrain){applyEmotion("happy", 2.5);}
          bs.activityState="recovering";
        }
      }
      let pullAngle=0,pullStretch=0;
      if(pulling&&pullRadius>2){
        pullAngle=Math.atan2(pullY-blobY,pullX-blobX);
        pullStretch=clamp(dist(pullX,pullY,blobX,blobY)*0.25,0,BR*0.37);
      }

      // ── Render ─────────────────────────────────────────────────────────────
      // Transparent clear so the dashboard background canvas shows through.
      ctx.clearRect(0,0,canvas.width,canvas.height);

      const vcx=blobX+bs.leanX,vcy=blobY+bs.leanY;
      const mainPts=getBlobPoints(vcx,vcy,BR,jelloValue,jelloAngle,time,pullAngle,pullStretch,bs.wobbleAmp,bs.trembleAmp,extraBreath);

      // ── Eye positions (computed early so reflection can mirror them) ─────
      const baseH = BR * 0.680;
      const baseW = BR * 0.310;
      const eyeOffY = -BR * 0.13;
      const eyeSep  = BR * 0.295 * bs.spacing;
      const blinkScaleEye = 1 - blinkAmt;
      const startleMul = 1 + es.startleAdd;
      const lH = baseH * es.lPillH * blinkScaleEye * startleMul;
      const rH = baseH * es.rPillH * blinkScaleEye * startleMul;
      const lW = baseW * es.lPillW;
      const rW = baseW * es.rPillW;
      const eLX = vcx - eyeSep + es.lookX;
      const eRX = vcx + eyeSep + es.lookX;
      const eY  = vcy + eyeOffY + es.lookY;

      const breathSquash = 1 + Math.sin(breathPhase) * 0.05;
      const emoExpand =
        bs.emotion === "excited" ? 1.20 :
        bs.emotion === "shocked" ? 0.78 :
        bs.emotion === "focused" ? 0.85 :
        bs.emotion === "sleeping" ? 0.70 : 1.0;
      const shadowY = vcy + BR * 1.05;

      // ── Floor reflection (drawn UNDER the shadow so the seam is hidden) ──
      // Render mirrored blob+eyes into a cached offscreen canvas at full
      // intensity, then composite back with a heavy blur. Doing it offscreen
      // preserves brightness through the blur (large radii would otherwise
      // dilute the small bright shape to nothing). The canvas itself is
      // allocated once (cached above) and only resized when geometry changes.
      const reflBandH = BR * 1.8;
      const reflPadX  = BR * 2.4;
      const reflW = Math.min(canvas.width, Math.max(64, Math.ceil(reflPadX * 2)));
      const reflH = Math.max(64, Math.ceil(reflBandH));
      const reflLeft = Math.max(0, Math.floor(vcx - reflW / 2));
      if (reflCtx) {
        if (reflCanvas.width !== reflW)  reflCanvas.width  = reflW;
        if (reflCanvas.height !== reflH) reflCanvas.height = reflH;
        // Reset + clear (cheaper than save/restore every frame)
        reflCtx.setTransform(1, 0, 0, 1, 0, 0);
        reflCtx.clearRect(0, 0, reflW, reflH);
        // Mirror world coords about shadowY into offscreen-local coords:
        // world (x, y) → offscreen (x - reflLeft, shadowY - y)
        reflCtx.setTransform(1, 0, 0, -1, -reflLeft, shadowY);
        drawBubble(reflCtx, mainPts, vcx, vcy, BR, finalGlow, bodyCol);
        drawPillEye(reflCtx, eLX, eY, lW, lH, -bs.tilt, finalGlow, eyeCol);
        drawPillEye(reflCtx, eRX, eY, rW, rH,  bs.tilt, finalGlow, eyeCol);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, shadowY, canvas.width, reflBandH);
        ctx.clip();
        // Lighter blur on mobile for perf; heavier on desktop for the dreamy bloom
        ctx.filter = isMob ? "blur(22px)" : "blur(50px)";
        ctx.globalAlpha = 0.85;
        // Stack twice to recover brightness lost to blur diffusion
        ctx.drawImage(reflCanvas, reflLeft, shadowY);
        ctx.drawImage(reflCanvas, reflLeft, shadowY);
        ctx.filter = "none";
        ctx.globalAlpha = 1;
        // Fade out toward the floor's lower edge
        const reflFade = ctx.createLinearGradient(0, shadowY, 0, shadowY + reflBandH);
        reflFade.addColorStop(0, "rgba(0,0,0,0.35)");
        reflFade.addColorStop(1, "rgba(0,0,0,1)");
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = reflFade;
        ctx.fillRect(0, shadowY, canvas.width, reflBandH);
        ctx.restore();
      }

      // Big soft ambient (colored by current body color)
      const ambR = BR * 1.95 * breathSquash * emoExpand;
      const ambH = BR * 0.36 * breathSquash * emoExpand;
      const ambGrad = ctx.createRadialGradient(vcx, shadowY, 0, vcx, shadowY, ambR);
      ambGrad.addColorStop(0,    `rgba(${bs.bodyR|0},${bs.bodyG|0},${bs.bodyB|0},${0.32 * finalGlow})`);
      ambGrad.addColorStop(0.45, `rgba(${bs.bodyR|0},${bs.bodyG|0},${bs.bodyB|0},${0.12 * finalGlow})`);
      ambGrad.addColorStop(1,    "rgba(0,0,0,0)");
      ctx.save();
      ctx.fillStyle = ambGrad;
      ctx.beginPath(); ctx.ellipse(vcx, shadowY, ambR, ambH, 0, 0, Math.PI*2); ctx.fill();
      // Tight contact shadow (dark, makes it sit on a "surface")
      const conR = BR * 0.85 * breathSquash;
      const conH = BR * 0.13 * breathSquash;
      const conGrad = ctx.createRadialGradient(vcx, shadowY, 0, vcx, shadowY, conR);
      conGrad.addColorStop(0, "rgba(0,0,0,0.55)");
      conGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = conGrad;
      ctx.beginPath(); ctx.ellipse(vcx, shadowY + BR * 0.04, conR, conH, 0, 0, Math.PI*2); ctx.fill();
      ctx.restore();

      if(pulling&&pullRadius>3){
        const pullPts=getPullPoints(pullX,pullY,pullRadius,time);
        if(dist(pullX,pullY,blobX,blobY)>BR*0.80+pullRadius*0.5)
          drawStrand(ctx,vcx,vcy,BR,pullX,pullY,pullRadius,bodyCol);
        drawBubble(ctx,pullPts,pullX,pullY,pullRadius,finalGlow,bodyCol);
      }
      drawBubble(ctx,mainPts,vcx,vcy,BR,finalGlow,bodyCol);

      // ── Publish live state for dashboard UI ───────────────────────────────
      blobLive.emotion = bs.emotion;
      blobLive.glowMult = bs.glowMult;
      blobLive.bodyR = bs.bodyR; blobLive.bodyG = bs.bodyG; blobLive.bodyB = bs.bodyB;
      blobLive.breathPhase = breathPhase;
      blobLive.breathPulse = Math.sin(breathPhase) * 0.5 + 0.5;
      blobLive.entryPulse = bs.entryPulse;
      blobLive.wobbleAmp = bs.wobbleAmp;
      blobLive.blobX = vcx; blobLive.blobY = vcy; blobLive.blobR = BR;
      blobLive.cursorX = mouseX; blobLive.cursorY = mouseY;
      blobLive.cursorVel = bs.cursorVel;

      // ── Eyes (positions computed earlier, see top of render block) ─────────
      drawPillEye(ctx, eLX, eY, lW, lH, -bs.tilt, finalGlow, eyeCol);
      drawPillEye(ctx, eRX, eY, rW, rH,  bs.tilt, finalGlow, eyeCol);

      // ── Custom cursor (cyan glow dot) ────────────────────────────────────
      if (mouseX >= 0 && mouseY >= 0) {
        const cursorScale = 1 + clamp(bs.cursorVel / 2500, 0, 0.6);  // grows with speed
        const cR = 5.5 * cursorScale;
        ctx.save();
        ctx.shadowColor = "rgba(140, 220, 255, 0.95)";
        ctx.shadowBlur  = 18;
        ctx.fillStyle   = "rgba(220, 245, 255, 0.95)";
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, cR, 0, Math.PI * 2);
        ctx.fill();
        // Outer ring
        ctx.shadowBlur = 8;
        ctx.strokeStyle = "rgba(120, 200, 255, 0.55)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, cR + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      animId=requestAnimationFrame(loop);
    }

    animId=requestAnimationFrame(loop);

    // ── Input ──────────────────────────────────────────────────────────────────
    let nowMs=performance.now();
    const startPull=(x:number,y:number)=>{
      if(dist(x,y,blobX,blobY)<getBR()*1.1){
        pulling=true;returning=false;
        pullX=x;pullY=y;pullVX=0;pullVY=0;pullRadius=0;pullTargetR=getBR()*0.26;
        mouseX=x;mouseY=y;
        wakeUp();
        if(bs.autoBrain){applyEmotion("shocked", 1.5);}
        bs.activityState="interacting";bs.lastInteract=nowMs;
      } else {
        // Click far away: surprise
        if(bs.autoBrain && bs.emotion!=="sleeping"){applyEmotion("curious", 2);}
        bs.lastInteract = nowMs;
      }
    };
    const endPull=()=>{if(pulling&&!returning){returning=true;bs.activityState="recovering";}};

    const onMM=(e:MouseEvent)=>{mouseX=e.clientX;mouseY=e.clientY; bs.lastInteract = performance.now();};
    const onMD=(e:MouseEvent)=>{nowMs=performance.now();startPull(e.clientX,e.clientY);};
    const onMU=()=>endPull();
    const onTM=(e:TouchEvent)=>{e.preventDefault();mouseX=e.touches[0].clientX;mouseY=e.touches[0].clientY; bs.lastInteract = performance.now();};
    const onTS=(e:TouchEvent)=>{e.preventDefault();nowMs=performance.now();const t=e.touches[0];mouseX=t.clientX;mouseY=t.clientY;startPull(t.clientX,t.clientY);};
    const onTE=()=>endPull();

    canvas.addEventListener("mousemove",onMM);canvas.addEventListener("mousedown",onMD);canvas.addEventListener("mouseup",onMU);
    window.addEventListener("mouseup",onMU);
    canvas.addEventListener("touchmove",onTM,{passive:false});canvas.addEventListener("touchstart",onTS,{passive:false});canvas.addEventListener("touchend",onTE);

    return()=>{
      cancelAnimationFrame(animId);window.removeEventListener("resize",resize);window.removeEventListener("mouseup",onMU);
      canvas.removeEventListener("mousemove",onMM);canvas.removeEventListener("mousedown",onMD);canvas.removeEventListener("mouseup",onMU);
      canvas.removeEventListener("touchmove",onTM);canvas.removeEventListener("touchstart",onTS);canvas.removeEventListener("touchend",onTE);
      if (import.meta.env.DEV) delete (window as any).__blobAPI;
    };
  },[]);

  return(
    <>
      <canvas ref={canvasRef} style={{display:"block",position:"absolute",inset:0,width:"100%",height:"100%",background:"transparent",cursor:"none",userSelect:"none",touchAction:"none"}}/>
    </>
  );
}
