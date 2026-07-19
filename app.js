/* BMW M4 GT3 EVO — state machine: hero → opening → specs → hero */

const body = document.body;
const video = document.getElementById("carVideo");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* small screens stream the 720p footage (~1.2MB) instead of the 4K masters */
const smallScreen = matchMedia("(max-width: 900px)").matches;
const SRC = smallScreen
  ? { open: "assets/opening-720.mp4", close: "assets/closing-720.mp4" }
  : { open: "assets/opening.mp4", close: "assets/closing.mp4" };
video.src = SRC.open;

/* guard against phantom focus/anchor scroll on the clipped stage */
setInterval(() => {
  const se = document.scrollingElement;
  if (se.scrollLeft || se.scrollTop) se.scrollTo(0, 0);
}, 400);

/* ---------------- utils ---------------- */

const fmt = (n, mode) =>
  mode === "comma" ? Math.round(n).toLocaleString("en-US") : String(Math.round(n));

function countUp(el, target, dur = 1200, mode) {
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  (function tick(now) {
    const p = Math.min((now - start) / dur, 1);
    el.textContent = fmt(target * ease(p), mode);
    if (p < 1) requestAnimationFrame(tick);
  })(start);
}

function splitTitle(el) {
  const frag = document.createDocumentFragment();
  let i = 0;
  let word = null; // chars group into .word spans so lines only break between words
  const split = (text, extra) => {
    for (const ch of text) {
      if (ch === " ") {
        const s = document.createElement("span");
        s.className = "sp";
        frag.appendChild(s);
        word = null;
        continue;
      }
      if (!word) {
        word = document.createElement("span");
        word.className = "word";
        frag.appendChild(word);
      }
      const s = document.createElement("span");
      s.className = extra ? "ch " + extra : "ch";
      s.textContent = ch;
      s.style.setProperty("--i", i++);
      word.appendChild(s);
    }
  };
  [...el.childNodes].forEach((node) => {
    const isPx = node.nodeType === 1 && node.classList.contains("px-word");
    split(node.textContent, isPx ? "px" : "");
  });
  el.textContent = "";
  el.appendChild(frag);
}

splitTitle(document.getElementById("heroTitle"));
splitTitle(document.getElementById("specsTitle"));

/* ---------------- preloader ---------------- */

const loaderCount = document.getElementById("loaderCount");
const loaderBar = document.getElementById("loaderBar");
let videoReady = video.readyState >= 3;
video.addEventListener("canplaythrough", () => (videoReady = true), { once: true });
video.load();

const LOAD_MS = reduced ? 10 : 1500;
const t0 = performance.now();
(function load(now) {
  const p = Math.min((now - t0) / LOAD_MS, 1);
  const shown = Math.round(p * 100);
  loaderCount.textContent = String(shown).padStart(3, "0");
  loaderBar.style.width = shown + "%";
  if (p < 1) return requestAnimationFrame(load);
  // hold until the video can actually play (max +2.5s)
  const wait0 = performance.now();
  (function hold() {
    if (videoReady || performance.now() - wait0 > 2500) return reveal();
    requestAnimationFrame(hold);
  })();
})(t0);

function reveal() {
  body.classList.add("loaded");
  setTimeout(() => {
    body.classList.add("ready");
    document.querySelectorAll(".hero-ui .count").forEach((el, i) =>
      setTimeout(
        () => countUp(el, +el.dataset.target, 1300, el.dataset.format),
        1000 + i * 120
      )
    );
  }, reduced ? 50 : 650);
}

/* ---------------- state machine ---------------- */

const closeVideo = document.getElementById("closeVideo");
closeVideo.src = SRC.close; // fetched lazily, first time the hood opens
const seqLines = document.getElementById("seqLines");
const seqPct = document.getElementById("seqPct");
const seqBar = document.getElementById("seqBar");
const seqTag = document.querySelector(".seq-tag");
let seqRaf = null;

const BOOT_OPEN = [
  ["LINK", "M TELEMETRY BUS", "OK"],
  ["HYD", "HOOD ACTUATORS ARMED", "OK"],
  ["LOCK", "PANEL LATCH RELEASE", "OK"],
  ["SYS", "P58 ACCESS GRANTED", "RUN"],
];
const BOOT_CLOSE = [
  ["HYD", "HOOD ACTUATORS REVERSE", "OK"],
  ["LOCK", "PANEL LATCH ENGAGE", "OK"],
  ["SYS", "P58 BAY SEALED", "RUN"],
];

function bootSequence(lines, done) {
  seqLines.innerHTML = "";
  lines.forEach(([tag, msg, st], i) => {
    setTimeout(() => {
      const d = document.createElement("div");
      d.innerHTML = `<b>[${tag}]</b> ${msg} <span class="ok">· ${st}</span>`;
      seqLines.appendChild(d);
    }, i * 60);
  });
  if (done) setTimeout(done, reduced ? 0 : lines.length * 60 + 60);
}

function trackVideo(vid, invert) {
  const p = vid.duration ? vid.currentTime / vid.duration : 0;
  const pct = Math.round((invert ? 1 - p : p) * 100);
  seqPct.textContent = String(pct).padStart(3, "0");
  seqBar.style.width = pct + "%";
  if (!vid.paused && !vid.ended) seqRaf = requestAnimationFrame(() => trackVideo(vid, invert));
}

function openSpecs() {
  if (body.dataset.state !== "hero") return;
  if (document.activeElement) document.activeElement.blur();
  body.dataset.state = "opening";
  rpmTarget = 6800;
  seqTag.textContent = "OPENING SEQUENCE // P58 ACCESS";
  if (!closeVideo.dataset.loaded) {
    closeVideo.load(); // buffer the closing footage while the hood opens
    closeVideo.dataset.loaded = "1";
  }
  bootSequence(BOOT_OPEN, () => {
    if (reduced) {
      video.currentTime = video.duration || 4;
      enterSpecs();
      return;
    }
    video.playbackRate = 3; // ~1.3s opening — fast enough to read as an animation
    video.play().catch(() => enterSpecs());
    seqRaf = requestAnimationFrame(() => trackVideo(video, false));
  });
}

video.addEventListener("ended", () => {
  if (body.dataset.state === "opening") enterSpecs();
});

function enterSpecs() {
  cancelAnimationFrame(seqRaf);
  video.playbackRate = 1;
  seqPct.textContent = "100";
  seqBar.style.width = "100%";
  body.dataset.state = "specs";
  rpmTarget = 3000; // settle to idle after the opening burst
  stageShake(6); // hood fully deployed — thud
  document.querySelectorAll(".specs-stats .scount").forEach((el, i) =>
    setTimeout(
      () => countUp(el, +el.dataset.target, 1100, el.dataset.format),
      700 + i * 100
    )
  );
}

/* closing plays the real reversed footage — the hood physically shuts */
function closeSpecs() {
  if (body.dataset.state !== "specs") return;
  if (document.activeElement) document.activeElement.blur();
  if (typeof stopRev === "function") stopRev();
  rpmTarget = 0;
  body.dataset.state = "closing";
  seqTag.textContent = "CLOSING SEQUENCE // LOCK PANELS";
  bootSequence(BOOT_CLOSE, null);
  closeVideo.currentTime = 0;
  closeVideo.classList.add("show");
  video.pause();
  video.currentTime = 0; // reset the opening video underneath while it's covered
  if (reduced) return finishClose();
  closeVideo.playbackRate = 3;
  closeVideo.play().catch(finishClose);
  seqRaf = requestAnimationFrame(() => trackVideo(closeVideo, true));
}

closeVideo.addEventListener("ended", () => {
  if (body.dataset.state === "closing") finishClose();
});

function finishClose() {
  cancelAnimationFrame(seqRaf);
  closeVideo.pause();
  closeVideo.classList.remove("show");
  body.dataset.state = "hero";
  stageShake(7); // hood slams shut
  document.querySelectorAll(".hero-ui .count").forEach((el) =>
    countUp(el, +el.dataset.target, 900, el.dataset.format)
  );
}

document.getElementById("btnSpecs").addEventListener("click", openSpecs);
document.getElementById("btnClose").addEventListener("click", closeSpecs);
document.querySelectorAll(".nav-link[data-nav]").forEach((a) =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    if (a.dataset.nav === "specs") openSpecs();
    else closeSpecs();
  })
);
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const ol = document.getElementById("overload");
  if (ol.classList.contains("msg")) dismissOverload();
  else closeSpecs();
});

/* ---------------- list <-> marker hover sync ---------------- */

const markers = [...document.querySelectorAll(".marker")];
const items = [...document.querySelectorAll(".spec-item")];
const pair = (idx) => [
  markers.find((m) => m.dataset.idx === idx),
  items.find((s) => s.dataset.idx === idx),
];
[...markers, ...items].forEach((el) => {
  el.addEventListener("mouseenter", () =>
    pair(el.dataset.idx).forEach((n) => n && n.classList.add("hot"))
  );
  el.addEventListener("mouseleave", () =>
    pair(el.dataset.idx).forEach((n) => n && n.classList.remove("hot"))
  );
  // touch: a tap highlights the pair briefly
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    const p = pair(el.dataset.idx);
    p.forEach((n) => n && n.classList.add("hot"));
    setTimeout(() => p.forEach((n) => n && n.classList.remove("hot")), 900);
  });
});

/* ---------------- pointer: smooth custom cursor + parallax + crosshair ---------------- */

const carPar = document.getElementById("carPar");
const crosshair = document.getElementById("crosshair");
const chCoords = document.getElementById("chCoords");
const cursorDot = document.getElementById("cursorDot");
const cursorRing = document.getElementById("cursorRing");

if (!reduced && matchMedia("(pointer: fine)").matches) {
  let tx = innerWidth / 2, ty = innerHeight / 2; // target (real mouse)
  let dx = tx, dy = ty; // dot (fast follow)
  let rx = tx, ry = ty; // ring + crosshair (soft follow)
  let cursorLive = false;

  addEventListener("mousemove", (e) => {
    tx = e.clientX;
    ty = e.clientY;
    if (!cursorLive) {
      cursorLive = true;
      dx = rx = tx; dy = ry = ty;
      body.classList.add("cursor-on");
    }
    const nx = tx / innerWidth - 0.5;
    const ny = ty / innerHeight - 0.5;
    carPar.style.setProperty("--mx", nx.toFixed(3));
    carPar.style.setProperty("--my", ny.toFixed(3));
    litCell(tx, ty);
  });

  let frame = 0;
  (function cursorLoop() {
    dx += (tx - dx) * 0.5;
    dy += (ty - dy) * 0.5;
    rx += (tx - rx) * 0.16;
    ry += (ty - ry) * 0.16;
    cursorDot.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    cursorRing.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    // crosshair + coords are cheaper at ~20fps — no visible difference
    if (++frame % 3 === 0) {
      crosshair.style.setProperty("--cx", rx.toFixed(1) + "px");
      crosshair.style.setProperty("--cy", ry.toFixed(1) + "px");
      chCoords.textContent =
        "X " + String(Math.round(rx)).padStart(4, "0") +
        " · Y " + String(Math.round(ry)).padStart(4, "0");
    }
    requestAnimationFrame(cursorLoop);
  })();

  const HOT = "a, button, .spec-item, .marker, .shifter";
  addEventListener("mouseover", (e) =>
    body.classList.toggle("cursor-hot", !!e.target.closest(HOT))
  );
}

/* ---------------- screen shake ---------------- */

const stage = document.getElementById("stage");
function stageShake(ampPx) {
  if (reduced) return;
  stage.style.setProperty("--amp", ampPx + "px");
  stage.classList.remove("shake");
  void stage.offsetWidth; // restart the animation
  stage.classList.add("shake");
}

/* ---------------- M Drivelogic shifter ---------------- */

const shifter = document.getElementById("shifter");
const shiftKnob = document.getElementById("shiftKnob");
const gearVal = document.getElementById("gearVal");
/* punch values are page-level zoom now, so they read stronger — keep them tighter */
const GEARS = [
  { label: "R", y: 2, rpm: 1100, amp: 4, punch: 1.04, color: "#1c69d4" },
  { label: "N", y: 42, rpm: 0, amp: 1.5, punch: 1.015, color: "#0b0b0c" },
  { label: "S", y: 82, rpm: 2400, amp: 9, punch: 1.09, color: "#e4002b" },
];
let gearIdx = 1;
const gearFlash = document.getElementById("gearFlash");

/* gear punch: the whole page dives toward the car, then settles back */
const carRig = document.getElementById("carRig");
const szoom = document.getElementById("szoom");
let punchT1, punchT2;

function punchZoom(mult) {
  if (reduced) return;
  clearTimeout(punchT1);
  clearTimeout(punchT2);
  szoom.style.transition = "transform 0.16s cubic-bezier(0.3, 0.7, 0.3, 1)";
  szoom.style.setProperty("--punch", mult);
  punchT1 = setTimeout(() => {
    szoom.style.transition = "transform 0.5s var(--ease-out)";
    szoom.style.setProperty("--punch", "1");
    punchT2 = setTimeout(() => { szoom.style.transition = ""; }, 520);
  }, 170);
}

/* haptics — Android/Chrome; silently ignored where unsupported */
const canVibe = "vibrate" in navigator;
function vibe(pattern) {
  if (canVibe) try { navigator.vibrate(pattern); } catch (_) {}
}

shifter.addEventListener("click", () => {
  gearIdx = (gearIdx + 1) % GEARS.length;
  const g = GEARS[gearIdx];
  shiftKnob.style.top = g.y + "px";
  gearVal.textContent = g.label;
  gearVal.style.color = g.color;
  if (body.dataset.state === "hero") rpmTarget = g.rpm;
  stageShake(g.amp); // the harder the gear, the harder the room rattles
  punchZoom(g.punch); // and the deeper the page dives toward the car
  vibe(Math.round(g.amp * 8));
  // videogame streak: slam the gear letter across the screen
  gearFlash.textContent = g.label;
  gearFlash.style.setProperty("--gear-c", g.color);
  gearFlash.classList.remove("go");
  void gearFlash.offsetWidth;
  gearFlash.classList.add("go");
  // legendary card burst
  shifter.style.setProperty("--gear-c", g.color);
  shifter.classList.remove("pop");
  void shifter.offsetWidth;
  shifter.classList.add("pop");
});

/* ---------------- camera control (side arrows) ---------------- */

const camRead = document.getElementById("camRead");
const camUp = document.getElementById("camUp");
const camDown = document.getElementById("camDown");
/* multipliers over the responsive base scale, so mobile framing stays correct */
const CAMS = [
  { m: 0.8, label: "CAM 01 · WIDE" },
  { m: 1, label: "CAM 02 · STD" },
  { m: 1.3, label: "CAM 03 · NEAR" },
];
let camIdx = 1;

function applyCam() {
  const c = CAMS[camIdx];
  carRig.style.setProperty("--cam-m", c.m);
  camRead.textContent = c.label;
  camUp.classList.toggle("maxed", camIdx === CAMS.length - 1);
  camDown.classList.toggle("maxed", camIdx === 0);
}
camUp.addEventListener("click", () => {
  if (camIdx < CAMS.length - 1) { camIdx++; applyCam(); }
});
camDown.addEventListener("click", () => {
  if (camIdx > 0) { camIdx--; applyCam(); }
});
applyCam();

/* ---------------- hold-to-rev (specs view) ---------------- */

const btnRev = document.getElementById("btnRev");
const revRpm = document.getElementById("revRpm");
const overload = document.getElementById("overload");
const stageEl = stage;
const OVERLOAD_MS = 4200;
let revving = false;
let revT0 = 0;
let revRaf = null;
let lastVibe = 0;

/* hold: brightness + saturation build until the screen whites out */
function revLoop(now) {
  if (!revving) return;
  const p = Math.min((now - revT0) / OVERLOAD_MS, 1);
  rpmTarget = 3000 + p * 4400;
  if (!reduced) {
    stageEl.style.filter =
      `brightness(${(1 + p * 0.9).toFixed(3)}) saturate(${(1 + p * 1.6).toFixed(3)}) contrast(${(1 + p * 0.12).toFixed(3)})`;
    stageEl.style.setProperty("--amp", (2 + p * 8).toFixed(1) + "px");
    // whiteout takes over in the last stretch of the hold
    overload.style.opacity = p > 0.55 ? ((p - 0.55) / 0.45).toFixed(3) : "0";
  }
  // haptic pulses grow with the revs
  if (now - lastVibe > 180) {
    vibe(Math.round(25 + p * 95));
    lastVibe = now;
  }
  if (p >= 1) return completeOverload();
  revRaf = requestAnimationFrame(revLoop);
}

function startRev(e) {
  if (body.dataset.state !== "specs" || revving) return;
  if (overload.classList.contains("msg")) return;
  e.preventDefault();
  revving = true;
  revT0 = performance.now();
  btnRev.classList.add("on");
  overload.style.transition = "none";
  stageEl.style.transition = "filter 0s";
  if (!reduced) stageEl.classList.add("revving");
  revRaf = requestAnimationFrame(revLoop);
}

function stopRev() {
  if (!revving) return;
  revving = false;
  cancelAnimationFrame(revRaf);
  btnRev.classList.remove("on");
  stageEl.classList.remove("revving");
  // ease everything back down
  stageEl.style.transition = "";
  stageEl.style.filter = "";
  overload.style.transition = "opacity 0.45s ease";
  overload.style.opacity = "0";
  if (body.dataset.state === "specs") rpmTarget = 3000;
}

function completeOverload() {
  revving = false;
  cancelAnimationFrame(revRaf);
  btnRev.classList.remove("on");
  stageEl.classList.remove("revving");
  stageEl.style.transition = "";
  stageEl.style.filter = "";
  overload.style.transition = "opacity 0.2s ease";
  overload.style.opacity = "1";
  overload.classList.add("on", "msg");
  rpmTarget = 7200;
  vibe([90, 60, 160]); // redline knock
}

function dismissOverload() {
  if (!overload.classList.contains("msg")) return;
  overload.classList.remove("msg", "on");
  overload.style.transition = "opacity 0.5s ease";
  overload.style.opacity = "0";
  rpmTarget = 3000;
  stageShake(5); // back in the garage
}

btnRev.addEventListener("pointerdown", startRev);
addEventListener("pointerup", stopRev);
addEventListener("pointercancel", stopRev);
overload.addEventListener("click", dismissOverload);

/* ---------------- interactive grid cells ---------------- */

const gridCells = document.getElementById("gridCells");
const CELL = 72;
let gcols = 0, gcells = [];

function buildCells() {
  gcols = Math.ceil(innerWidth / CELL);
  const grows = Math.ceil(innerHeight / CELL);
  gridCells.style.gridTemplateColumns = `repeat(${gcols}, ${CELL}px)`;
  gridCells.style.gridTemplateRows = `repeat(${grows}, ${CELL}px)`;
  gridCells.innerHTML = "";
  gcells = [];
  for (let i = 0; i < gcols * grows; i++) {
    const d = document.createElement("div");
    d.className = "gcell";
    gridCells.appendChild(d);
    gcells.push(d);
  }
}
let lastCell = null;
function litCell(x, y) {
  const idx = Math.floor(y / CELL) * gcols + Math.floor(x / CELL);
  const el = gcells[idx];
  if (!el || el === lastCell) return;
  lastCell = el;
  el.classList.add("lit");
  setTimeout(() => el.classList.remove("lit"), 160);
}
if (!reduced && matchMedia("(pointer: fine)").matches) {
  buildCells();
  let rsT;
  addEventListener("resize", () => { clearTimeout(rsT); rsT = setTimeout(buildCells, 200); });
}

/* ---------------- ambient telemetry ---------------- */

const tOil = document.getElementById("tOil");
const tWtr = document.getElementById("tWtr");
const tRpm = document.getElementById("tRpm");
let oil = 90, wtr = 76, rpm = 0, rpmTarget = 0;

if (!reduced) {
  setInterval(() => {
    oil = Math.min(112, Math.max(84, oil + (Math.random() - 0.5) * 1.4));
    wtr = Math.min(96, Math.max(70, wtr + (Math.random() - 0.5) * 1.1));
    rpm += (rpmTarget - rpm) * 0.18 + (rpmTarget ? (Math.random() - 0.5) * 220 : 0);
    if (rpm < 0) rpm = 0;
    tOil.textContent = oil.toFixed(1);
    tWtr.textContent = wtr.toFixed(1);
    const rpmStr = String(Math.round(rpm)).padStart(4, "0");
    tRpm.textContent = rpmStr;
    revRpm.textContent = rpmStr;
  }, 380);

  /* idle glitch flicker on the hero title */
  const heroTitle = document.getElementById("heroTitle");
  setInterval(() => {
    if (body.dataset.state !== "hero" || Math.random() < 0.4) return;
    heroTitle.classList.add("glitch");
    setTimeout(() => heroTitle.classList.remove("glitch"), 300);
  }, 5200);
}
