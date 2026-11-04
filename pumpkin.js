// A playable pixel-art jack-o'-lantern that lives on the strip above the footer.
// Plain canvas, no libraries: the sprite is built from pixel rules at load and
// drawn at a low resolution, then scaled up with nearest-neighbor CSS.
(() => {
  "use strict";

  const strip = document.getElementById("pumpkin-strip");
  const canvas = document.getElementById("pumpkin");
  if (!strip || !canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  strip.hidden = false;

  // Palette: black, orange, one darker and one lighter orange.
  const PAL = { k: "#1b0f08", o: "#f5891f", d: "#b5520f", l: "#ffd166" };
  const RGB = {};
  for (const [name, hex] of Object.entries(PAL)) {
    RGB[name] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
  const mix = (a, b, t) => {
    if (t <= 0) return PAL[a];
    if (t >= 1) return PAL[b];
    const c = RGB[a].map((v, i) => Math.round(v + (RGB[b][i] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };

  // ---- Sprite -------------------------------------------------------------
  // Pumpkin body is a squat ellipse W x BH. The lid is cut along a zigzag:
  // seam(x) is the carved row in column x; rows above it belong to the lid,
  // the seam and everything below it to the body.
  const W = 28;
  const BH = 21;
  const CUT = 5;
  const seam = (x) => CUT + ((x >> 1) & 1);
  const MID = (W - 1) / 2; // mirror axis
  const LEG = 4; // leg length in logical pixels
  const RX = 14;
  const RY = BH / 2;

  const inside = (x, y) =>
    x >= 0 && x < W && y >= 0 && y < BH &&
    ((x + 0.5 - W / 2) / RX) ** 2 + ((y + 0.5 - RY) / RY) ** 2 <= 1;

  const grid = [];
  for (let y = 0; y < BH; y++) {
    const row = [];
    const ny = (y + 0.5 - RY) / RY;
    const hw = RX * Math.sqrt(Math.max(0, 1 - ny * ny));
    const rib = Math.floor(W / 2 - hw * 0.5);
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) { row.push(null); continue; }
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (edge) { row.push("k"); continue; }
      const nx = (x + 0.5 - W / 2) / RX;
      const shade = nx * 0.5 + ny * 0.86 > 0.6;
      const isRib = y > 0 && y < BH - 1 && (x === rib || x === W - 1 - rib);
      row.push(shade || isRib ? "d" : "o");
    }
    grid.push(row);
  }

  // Rind highlight (top-left), only lit up during a jump.
  const HIGHLIGHT = [[4, 8], [3, 9], [3, 10], [3, 11], [9, 3], [10, 3], [11, 2]]
    .filter(([x, y]) => grid[y][x] === "o");

  // Stem sits on top of the lid, rows -3..-1.
  const STEM = [
    [-3, 13, "kkkk"],
    [-2, 13, "kddk"],
    [-1, 13, "kddk"],
  ];

  // Faces are drawn for facing right and mirrored for facing left.
  // Each entry: [row, startColumn, pattern], "f" = carved pixel.
  const eyes = (rows) => [9, 17].flatMap((c) => rows.map(([y, dx, s]) => [y, c + dx, s]));
  const NOSE = [[11, 15, "f"], [12, 14, "fff"]];
  const FACE_CALM = [
    ...eyes([[8, 2, "f"], [9, 1, "fff"], [10, 0, "fffff"]]),
    ...NOSE,
    [13, 10, "f.........f"],
    [14, 10, "fff.fff.fff"],
    [15, 11, "fffffffff"],
  ];
  const FACE_EXCITED = [
    ...eyes([[7, 2, "f"], [8, 1, "fff"], [9, 0, "fffff"], [10, 0, "fffff"]]),
    ...NOSE,
    [13, 10, "ff.......ff"],
    [14, 10, "fff.fff.fff"],
    [15, 10, "fffffffffff"],
    [16, 11, "fffffffff"],
    [17, 13, "fffff"],
  ];
  // A face is its carved pixels plus the rind pixels around them ("rim"),
  // which darken while the face glows so the carving keeps a crisp edge.
  const toPixels = (rows) => {
    const set = new Set();
    for (const [y, x0, s] of rows) [...s].forEach((ch, i) => { if (ch === "f") set.add(`${x0 + i},${y}`); });
    const cut = [...set].map((k) => k.split(",").map(Number));
    const rim = new Set();
    for (const [x, y] of cut) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${x + dx},${y + dy}`;
        if (!set.has(k)) rim.add(k);
      }
    }
    return { cut, rim: [...rim].map((k) => k.split(",").map(Number)) };
  };
  const CALM_PX = toPixels(FACE_CALM);
  const EXCITED_PX = toPixels(FACE_EXCITED);

  // Legs: back and front hip columns (facing right), 3 wide "kdk" with a foot.
  // Walk cycle frames give each leg [dx, lift].
  const HIPS = [10, 15];
  const WALK = [
    [[-1, 0], [1, 0]],
    [[0, 0], [0, 1]],
    [[1, 0], [-1, 0]],
    [[0, 1], [0, 0]],
  ];
  const AIR = [[0, 1], [1, 1]];

  // ---- State ---------------------------------------------------------------
  const H = 64; // logical canvas height: room for a jump plus the flying lid
  const G = 480; // gravity, logical px / s^2
  const JUMP_V = 132;
  const LID_V = JUMP_V * 1.32;
  const SPEED = 62;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const keys = { left: false, right: false };
  const s = {
    x: 0, facing: 1,
    y: 0, vy: 0, air: false, // body height above ground
    legs: 0,
    lid: 0, lidV: 0, lidSeated: true, settle: 0,
    detail: 0, walkT: 0, idleT: 0, flicker: 0,
  };
  let lw = 120;
  let scale = 3;
  let shadow = "#44475a";
  let inView = true;
  let placed = false;

  function readTheme() {
    shadow = getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || shadow;
  }

  function resize() {
    const w = strip.clientWidth;
    scale = w >= 640 ? 3 : 2;
    lw = Math.max(W + 4, Math.floor(w / scale));
    canvas.width = lw;
    canvas.height = H;
    canvas.style.width = lw * scale + "px";
    canvas.style.height = H * scale + "px";
    ctx.imageSmoothingEnabled = false;
    if (!placed) { s.x = Math.round(lw * 0.5 - W / 2); placed = true; }
    s.x = Math.min(Math.max(s.x, 0), lw - W);
  }

  function jump() {
    if (s.air) return;
    s.air = true;
    s.vy = JUMP_V;
    s.lidSeated = false;
    s.lidV = LID_V;
  }

  // ---- Update --------------------------------------------------------------
  function update(dt) {
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const moving = dir !== 0;
    if (moving) {
      s.facing = dir;
      s.x = Math.min(Math.max(s.x + dir * SPEED * dt, 0), lw - W);
    }

    if (s.air) {
      s.y += s.vy * dt;
      s.vy -= G * dt;
      if (s.y <= 0) { s.y = 0; s.vy = 0; s.air = false; }
    }

    // Legs pop out while moving or airborne, and tuck away when it stops.
    const legTarget = moving || s.air ? LEG : 0;
    const legStep = 36 * dt;
    s.legs = s.legs < legTarget ? Math.min(legTarget, s.legs + legStep) : Math.max(legTarget, s.legs - legStep);

    const bodyH = s.y + Math.floor(s.legs);
    if (s.lidSeated) {
      s.lid = bodyH;
    } else {
      s.lid += s.lidV * dt;
      s.lidV -= G * dt;
      if (s.lid <= bodyH && s.lidV < 0) {
        s.lid = bodyH;
        if (s.lidV < -70) {
          s.lidV = -s.lidV * 0.22; // one small bounce
        } else {
          s.lidSeated = true;
          s.settle = 0.16;
        }
      }
    }
    s.settle = Math.max(0, s.settle - dt);

    const excited = s.air || !s.lidSeated;
    s.detail += ((excited ? 1 : 0) - s.detail) * Math.min(1, dt * (excited ? 9 : 3.2));

    if (moving && !s.air) s.walkT += dt; else s.walkT = 0;

    const idle = !moving && !excited && s.legs === 0;
    if (idle && !reduceMotion.matches) {
      s.idleT += dt;
      // Candle flicker: drift toward a new random ember level now and then.
      if (Math.random() < dt * 6) s.flickerTarget = Math.random() < 0.3 ? 0.22 : 0.06;
      s.flicker += ((s.flickerTarget || 0) - s.flicker) * Math.min(1, dt * 10);
    } else {
      s.idleT = 0;
      s.flicker += (0 - s.flicker) * Math.min(1, dt * 10);
    }
  }

  // ---- Draw ----------------------------------------------------------------
  function px(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  }

  function draw() {
    ctx.clearRect(0, 0, lw, H);
    const ground = H - 1;
    const ox = Math.round(s.x);
    const bodyH = Math.round(s.y) + Math.floor(s.legs);
    const oy = ground - (BH - 1) - bodyH; // world row of sprite row 0
    const mx = (x) => (s.facing > 0 ? ox + x : ox + 2 * MID - x);

    // Idle "breath": the lid lifts a pixel for a moment, showing the candle.
    const breath = !reduceMotion.matches && s.idleT % 2.6 > 2.0 ? 1 : 0;
    const lidLift = Math.round(s.lid - bodyH) + breath;
    const lidOff = lidLift > 0;

    // Soft shadow on the ground once it's off its bottom, shrinking with height.
    if (bodyH > 0) {
      const sw = Math.max(6, 14 - Math.round(bodyH * 0.3));
      ctx.fillStyle = shadow;
      ctx.fillRect(ox + Math.round(MID + 0.5 - sw / 2), ground, sw, 1);
    }

    // Legs
    const legLen = Math.floor(s.legs);
    if (legLen > 0) {
      const frame = s.air ? AIR : WALK[Math.floor(s.walkT * 10) % WALK.length];
      HIPS.forEach((hip, i) => {
        const [dx, lift] = frame[i];
        const len = legLen - lift;
        for (let r = 0; r < len; r++) {
          const y = oy + BH + r;
          const foot = r === len - 1;
          const pattern = foot ? "kddk" : "kdk";
          [...pattern].forEach((ch, j) => px(mx(hip + dx + j), y, PAL[ch]));
        }
      });
    }

    const glow = Math.min(1, s.detail * 0.9 + s.flicker);
    const highlight = s.detail;

    // Body, from the seam down. The seam is a quiet carved line while the
    // lid is on, and shows the lit inside when the lid lifts.
    for (let x = 0; x < W; x++) {
      for (let y = seam(x); y < BH; y++) {
        const c = grid[y][x];
        if (!c) continue;
        let color = PAL[c];
        if (y === seam(x) && c !== "k") color = lidOff ? mix("k", "l", Math.max(glow, 0.6)) : PAL.d;
        px(ox + x, oy + y, color);
      }
    }

    // Carved face, glowing from inside during a jump
    const facePx = s.detail > 0.5 ? EXCITED_PX : CALM_PX;
    if (s.detail > 0.02) {
      const rimColor = mix("o", "d", s.detail);
      for (const [x, y] of facePx.rim) if (grid[y][x] === "o") px(mx(x), oy + y, rimColor);
    }
    const faceColor = mix("k", "l", glow);
    for (const [x, y] of facePx.cut) px(mx(x), oy + y, faceColor);

    // Lid with stem; its underside gets an outline while it's off.
    const settleDip = s.settle > 0 && s.settle < 0.1 ? 1 : 0;
    const ly = oy - lidLift + settleDip;
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < seam(x); y++) {
        const c = grid[y][x];
        if (!c) continue;
        px(ox + x, ly + y, lidOff && y === seam(x) - 1 ? PAL.k : PAL[c]);
      }
    }
    for (const [y, x0, pattern] of STEM) {
      [...pattern].forEach((ch, j) => px(ox + x0 + j, ly + y, PAL[ch]));
    }

    // Rind highlight
    if (highlight > 0.02) {
      const hc = mix("o", "l", highlight);
      for (const [x, y] of HIGHLIGHT) px(ox + x, (y < seam(x) ? ly : oy) + y, hc);
    }
  }

  // ---- Loop ----------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    if (inView) draw();
    requestAnimationFrame(frame);
  }

  // ---- Input ---------------------------------------------------------------
  const KEYMAP = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowUp: "jump", KeyW: "jump", Space: "jump",
  };
  const INTERACTIVE = "a[href], button, input, textarea, select, summary, [contenteditable]:not([contenteditable='false']), [tabindex]:not([tabindex='-1'])";

  function ownsKeys(target) {
    if (!(target instanceof Element)) return true;
    if (target.closest(".pumpkin-pad")) return true;
    return !target.closest(INTERACTIVE);
  }

  function press(action, down) {
    if (action === "jump") { if (down) jump(); return; }
    keys[action] = down;
  }

  document.addEventListener("keydown", (e) => {
    const action = KEYMAP[e.code];
    if (!action || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!inView || !ownsKeys(e.target)) return;
    e.preventDefault();
    if (action === "jump" && e.repeat) return;
    press(action, true);
  });
  document.addEventListener("keyup", (e) => {
    const action = KEYMAP[e.code];
    if (action && action !== "jump") keys[action] = false;
  });
  window.addEventListener("blur", () => { keys.left = keys.right = false; });

  // On-screen buttons for touch devices
  for (const btn of strip.querySelectorAll(".pumpkin-pad button")) {
    const action = btn.dataset.action;
    const release = () => { btn.classList.remove("is-down"); if (action !== "jump") keys[action] = false; };
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch {}
      btn.classList.add("is-down");
      press(action, true);
    });
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("lostpointercapture", release);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    // Keyboard or assistive-tech activation (no pointer involved)
    btn.addEventListener("click", (e) => {
      if (e.detail !== 0) return;
      if (action === "jump") jump();
      else { s.facing = action === "right" ? 1 : -1; s.x = Math.min(Math.max(s.x + s.facing * 12, 0), lw - W); }
    });
  }
  window.addEventListener("touchstart", () => strip.classList.add("is-touch"), { once: true, passive: true });

  // ---- Wiring --------------------------------------------------------------
  readTheme();
  new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", readTheme);

  resize();
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(strip);
  else window.addEventListener("resize", resize);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => { inView = entries[entries.length - 1].isIntersecting; })
      .observe(canvas);
  }

  requestAnimationFrame((now) => { last = now; frame(now); });
})();
