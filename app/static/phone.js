// # Created by Caleb M. Irvine for use by Moto Reloaded

const REQUIRED_ANGLES = ["front", "left", "right", "back", "inside", "labels"];

const STEPS = [
  {
    key: "front",
    shortLabel: "1. Front",
    title: "Front Exterior",
    required: true,
    hints: {
      jacket:
        "Lay jacket flat, front facing up, fully zipped (~80% of frame). Remove impact protectors first. Captures torso, front shoulders, and fading.",
      pants:
        "Lay pants flat, front facing up, fastened (~80% of frame). Remove impact protectors first. Captures front hips, thighs, and knees.",
    },
  },
  {
    key: "left",
    shortLabel: "2. Left",
    title: "Left Outer Side",
    required: true,
    hints: {
      jacket:
        "Turn or fold cleanly to show the outer left shoulder, left sleeve, and left elbow/forearm (Zone 1 impact areas).",
      pants:
        "Fold the left leg flat so it fills the rectangle. Outer hip, thigh, and knee.",
    },
  },
  {
    key: "right",
    shortLabel: "3. Right",
    title: "Right Outer Side",
    required: true,
    hints: {
      jacket:
        "Turn or fold cleanly to show the outer right shoulder, right sleeve, and right elbow/forearm (Zone 1 impact areas).",
      pants:
        "Fold the right leg flat so it fills the rectangle. Outer hip, thigh, and knee.",
    },
  },
  {
    key: "back",
    shortLabel: "4. Back",
    title: "Back Exterior",
    required: true,
    hints: {
      jacket:
        "Turn jacket over and lay flat. Shows full back exterior and upper-back Zone 1 area.",
      pants:
        "Turn pants over and lay flat. Shows full back exterior and seat area (normal sitting sheen without fibre damage is Zone 2 wear).",
    },
  },
  {
    key: "inside",
    shortLabel: "5. Inside",
    title: "Inside & Lining",
    required: true,
    hints: {
      jacket:
        "Turn jacket fully inside out and lay flat. Shows inner lining condition, protective layer placement (full vs panels), and protector pockets.",
      pants:
        "Turn pants fully inside out and lay flat. Shows inner lining condition, protective layer placement, and hip/knee protector pockets.",
    },
  },
  {
    key: "labels",
    shortLabel: "6. Labels",
    title: "Labels Close-Up",
    required: true,
    hints: {
      jacket:
        "Shoot straight on, filling the frame, razor sharp: brand/size tag, fibre composition percentages, and CE EN 17092 label if present (absence in North America is normal). Reminder: a blurry label photo counts as missing.",
      pants:
        "Shoot straight on, filling the frame, razor sharp: brand/size tag, fibre composition percentages, and CE EN 17092 label if present (absence in North America is normal). Reminder: a blurry label photo counts as missing.",
    },
  },
  {
    key: "defect",
    shortLabel: "7. Close-up",
    title: "Damage close-up",
    required: false,
    hints: {
      jacket:
        "The six angles stay required. If you see a scuff, tear, stain, or broken pad, take one damage close-up of that spot. If nothing looks wrong, continue without an extra photo.",
      pants:
        "The six angles stay required. If you see a scuff, tear, stain, or broken pad, take one damage close-up of that spot. If nothing looks wrong, continue without an extra photo.",
    },
  },
  {
    key: "disclosure",
    shortLabel: "8. Finish",
    title: "Rider Disclosure",
    required: false,
    hints: { jacket: "", pants: "" },
  },
];

const JACKET_STEP_ORDER = ["front", "left", "right", "back", "inside", "labels", "defect", "disclosure"];
const PANTS_STEP_ORDER = ["front", "back", "left", "right", "inside", "labels", "defect", "disclosure"];

function activeSteps() {
  const pants = state.garmentType === "pants";
  const order = pants ? PANTS_STEP_ORDER : JACKET_STEP_ORDER;
  return order.map((key, index) => {
    const base = STEPS.find((step) => step.key === key);
    const step = {
      ...base,
      shortLabel: `${index + 1}. ${String(base.shortLabel).replace(/^\d+\.\s*/, "")}`,
    };
    if (!pants) return step;
    if (key === "left") {
      return { ...step, shortLabel: "3. Left fold", title: "Left fold" };
    }
    if (key === "right") {
      return { ...step, shortLabel: "4. Right fold", title: "Right fold" };
    }
    return step;
  });
}

function firstOpenStepIndex() {
  const steps = activeSteps();
  const missing = steps.findIndex((step) => step.required && !state.photosByAngle.has(step.key));
  if (missing >= 0) return missing;
  const closeup = steps.findIndex((step) => step.key === "defect");
  return closeup >= 0 ? closeup : 0;
}

// Auto-capture tuning (250ms ticks; 5 steady sharp ticks ~= 1.25s lock-on)
const ANALYZE_INTERVAL_MS = 250;
const LOCK_TICKS_REQUIRED = 5;
const CAMERA_WARMUP_MS = 1200;
const ANALYSIS_W = 120;
const ANALYSIS_H = 160;
const VIEWFINDER_VIEWBOX = "0 0 300 400";

const state = {
  sessionId: null,
  garmentType: "jacket",
  view: "category", // "category" | "photo" | "disclosure" | "complete"
  currentStepIndex: 0,
  photosByAngle: new Map(),
  defectPhotos: [],
  markChoice: null, // "clear" | "mark" | null
  flaggedSpot: "",
  lastFeedbackByAngle: new Map(),
  isUploading: false,
  riderCrash: false,
  riderUsage: "moderate",
  pollTimer: null,
  latestScore: null,
  // Live Photo-ID Viewfinder state
  cameraStream: null,
  cameraSupported: Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
  cameraFallback: false,
  retakeLiveMode: false,
  autoSnap: true,
  analyzeTimer: null,
  analysisCanvas: null,
  analysisCtx: null,
  prevLuma: null,
  lockTicks: 0,
  cameraOpenedAt: 0,
};

const els = {
  sessionPill: document.getElementById("phone-session-pill"),
  toast: document.getElementById("phone-toast"),
  errorView: document.getElementById("phone-error-view"),
  errorDetail: document.getElementById("phone-error-detail"),
  captureView: document.getElementById("phone-capture-view"),
  progressCard: document.getElementById("phone-progress-card"),
  btnChangeCategory: document.getElementById("btn-change-category"),
  garmentChipLabel: document.getElementById("phone-garment-chip-label"),
  progressText: document.getElementById("phone-progress-text"),
  progressBar: document.getElementById("phone-progress-bar"),
  stepper: document.getElementById("phone-stepper"),
  // Card 1: Category
  stageCategory: document.getElementById("stage-category"),
  btnPickJacket: document.getElementById("btn-phone-pick-jacket"),
  btnPickPants: document.getElementById("btn-phone-pick-pants"),
  badgeJacket: document.getElementById("badge-phone-jacket"),
  badgePants: document.getElementById("badge-phone-pants"),
  // Photo Viewfinder Card
  stagePhoto: document.getElementById("stage-photo"),
  stepKicker: document.getElementById("step-kicker"),
  stepTitle: document.getElementById("step-title"),
  stepStatusPill: document.getElementById("step-status-pill"),
  stepHint: document.getElementById("step-hint"),
  viewfinderBox: document.getElementById("viewfinder-box"),
  liveVideo: document.getElementById("live-camera-video"),
  stepPreviewImg: document.getElementById("step-preview-img"),
  viewfinderSvg: document.getElementById("viewfinder-svg"),
  stepGuideEmpty: document.getElementById("step-guide-empty"),
  stepEmptyLabel: document.getElementById("step-empty-label"),
  hudTop: document.getElementById("viewfinder-hud-top"),
  hudPill: document.getElementById("viewfinder-hud-pill"),
  btnAutosnapToggle: document.getElementById("btn-autosnap-toggle"),
  lockTrack: document.getElementById("viewfinder-lock-track"),
  lockBar: document.getElementById("viewfinder-lock-bar"),
  defectGallery: document.getElementById("phone-defect-gallery"),
  markChoiceForm: document.getElementById("mark-choice-form"),
  markChoiceError: document.getElementById("mark-choice-error"),
  markCloseupError: document.getElementById("mark-closeup-error"),
  uploadBusy: document.getElementById("upload-busy"),
  clipBanner: document.getElementById("clip-feedback-banner"),
  clipTitle: document.getElementById("clip-feedback-title"),
  clipDetail: document.getElementById("clip-feedback-detail"),
  clipActions: document.getElementById("clip-feedback-actions"),
  cameraInput: document.getElementById("camera-input"),
  libraryInput: document.getElementById("library-input"),
  btnSnapPhoto: document.getElementById("btn-snap-photo"),
  btnChooseLibrary: document.getElementById("btn-choose-library"),
  btnPrevStep: document.getElementById("btn-prev-step"),
  btnNextStep: document.getElementById("btn-next-step"),
  // Disclosure Card
  stageDisclosure: document.getElementById("stage-disclosure"),
  missingBox: document.getElementById("disclosure-missing-box"),
  missingText: document.getElementById("disclosure-missing-text"),
  btnJumpMissing: document.getElementById("btn-jump-missing"),
  riderCrashBtns: document.querySelectorAll("[data-rider-crash]"),
  riderUsageBtns: document.querySelectorAll("[data-rider-usage]"),
  riderNotes: document.getElementById("rider-notes"),
  btnFinishSubmit: document.getElementById("btn-finish-submit"),
  btnBackToPhotos: document.getElementById("btn-back-to-photos"),
  // Complete Card
  stageComplete: document.getElementById("stage-complete"),
  completePollPill: document.getElementById("complete-poll-pill"),
  completeWaiting: document.getElementById("complete-waiting"),
  completeScoreCard: document.getElementById("complete-score-card"),
  phoneDecisionBanner: document.getElementById("phone-decision-banner"),
  phoneDecisionPill: document.getElementById("phone-decision-pill"),
  phoneDecisionTitle: document.getElementById("phone-decision-title"),
  phoneDecisionSummary: document.getElementById("phone-decision-summary"),
  phoneDecisionGoal: document.getElementById("phone-decision-goal"),
  phoneRetakeTitle: document.getElementById("phone-retake-title"),
  phoneScoreTotal: document.getElementById("phone-score-total"),
  phoneCovText: document.getElementById("phone-cov-text"),
  phoneCovBar: document.getElementById("phone-cov-bar"),
  phoneDmgText: document.getElementById("phone-dmg-text"),
  phoneDmgBar: document.getElementById("phone-dmg-bar"),
  phoneRetakeCard: document.getElementById("phone-retake-card"),
  phoneRetakeText: document.getElementById("phone-retake-text"),
  btnPhoneRetakeFlagged: document.getElementById("btn-phone-retake-flagged"),
  phoneUpcycleCard: document.getElementById("phone-upcycle-card"),
  phoneUpcycleHeadline: document.getElementById("phone-upcycle-headline"),
  phoneUpcycleSummary: document.getElementById("phone-upcycle-summary"),
  phoneUpcycleList: document.getElementById("phone-upcycle-list"),
  phoneUpcycleTradein: document.getElementById("phone-upcycle-tradein"),
};

// ============================================================================
// Utilities
// ============================================================================

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function capitalize(str) {
  const s = String(str || "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n);
  return `${Math.max(0, Math.min(100, pct))}%`;
}

function replayDeckCardAnimation(el) {
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
}

let toastTimer = null;
function showToast(message, variant = "info", durationMs = 4200) {
  els.toast.className = "toast-banner";
  if (variant === "error") els.toast.classList.add("is-error");
  if (variant === "success") els.toast.classList.add("is-success");
  if (variant === "warn") els.toast.classList.add("is-warn");
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");

  if (toastTimer) clearTimeout(toastTimer);
  if (durationMs > 0) {
    toastTimer = setTimeout(() => {
      els.toast.classList.add("hidden");
    }, durationMs);
  }
}

async function apiJson(url, options = {}) {
  const res = await fetch(url, options);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new Error(body?.detail || body?.message || `Request failed (${res.status})`);
  }
  return body;
}

function parseSessionIdFromUrl() {
  const match = window.location.pathname.match(/\/capture\/([^/?#]+)/);
  if (match && match[1]) {
    return decodeURIComponent(match[1]);
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("session_id") || "";
}

// ============================================================================
// Dynamic Per-(Garment, Angle) Photo-ID SVG Viewfinder Overlays
// ============================================================================

const CORNER_BRACKETS_SVG = `
  <g stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none" opacity="0.92">
    <path d="M22 78 V54 H52" />
    <path d="M248 54 H278 V78" />
    <path d="M22 314 V338 H52" />
    <path d="M248 338 H278 V314" />
  </g>
`;

// Laid-flat motorcycle jacket: stand collar, long sleeves, hem near the cuffs.
const JACKET_OUTLINE =
  "M98 332 C94 240 90 186 106 164 L58 304 L30 290 C62 200 78 118 96 98 C114 72 130 62 142 80 L148 98 C150 106 150 106 152 98 L158 80 C170 62 186 72 204 98 C222 118 238 200 270 290 L242 304 L194 164 C210 186 206 240 202 332 Z";

// Laid-flat motorcycle pants: waistband, hip, crotch, and two long legs.
const PANTS_OUTLINE =
  "M74 66 H226 L238 156 C248 214 252 270 246 336 L178 336 L166 214 C158 190 142 190 134 214 L122 336 L54 336 C48 270 52 214 62 156 Z";

const ZONE_MARK_ATTRS =
  'fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="5 4" opacity="0.8"';

function sideMirrorAttr(angle) {
  return angle === "right" ? 'transform="translate(300 0) scale(-1 1)"' : "";
}

function buildViewfinderSvg(garment, angle) {
  const isPants = garment === "pants";

  if (angle === "labels") {
    return `
      ${CORNER_BRACKETS_SVG}
      <rect x="46" y="108" width="208" height="150" rx="10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="8 5" />
    `;
  }

  if (angle === "defect") {
    return `
      ${CORNER_BRACKETS_SVG}
      <g fill="none" stroke="currentColor">
        <circle cx="150" cy="200" r="54" stroke-width="2.2" stroke-dasharray="7 5" />
        <path d="M150 134 V162 M150 238 V266 M84 200 H112 M188 200 H216" stroke-width="2" />
      </g>
    `;
  }

  if (angle === "inside" && !isPants) {
    return `
      ${CORNER_BRACKETS_SVG}
      <g fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round">
        <path d="${JACKET_OUTLINE}" stroke-dasharray="7 5" />
        <rect x="88" y="108" width="32" height="26" rx="5" ${ZONE_MARK_ATTRS} />
        <rect x="180" y="108" width="32" height="26" rx="5" ${ZONE_MARK_ATTRS} />
        <rect x="56" y="204" width="26" height="32" rx="5" ${ZONE_MARK_ATTRS} />
        <rect x="218" y="204" width="26" height="32" rx="5" ${ZONE_MARK_ATTRS} />
        <rect x="122" y="142" width="56" height="30" rx="6" ${ZONE_MARK_ATTRS} />
      </g>
    `;
  }

  if (angle === "inside" && isPants) {
    return `
      ${CORNER_BRACKETS_SVG}
      <g fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round">
        <path d="${PANTS_OUTLINE}" stroke-dasharray="7 5" />
        <path d="M78 84 H222" stroke-width="1.7" opacity="0.7" />
        <rect x="84" y="158" width="36" height="28" rx="5" ${ZONE_MARK_ATTRS} />
        <rect x="180" y="158" width="36" height="28" rx="5" ${ZONE_MARK_ATTRS} />
        <rect x="70" y="248" width="40" height="36" rx="5" ${ZONE_MARK_ATTRS} />
        <rect x="190" y="248" width="40" height="36" rx="5" ${ZONE_MARK_ATTRS} />
        <ellipse cx="150" cy="124" rx="46" ry="26" ${ZONE_MARK_ATTRS} />
      </g>
    `;
  }

  if (!isPants && (angle === "front" || angle === "back")) {
    const detail =
      angle === "front"
        ? `<path d="M150 104 V326" stroke-width="1.8" opacity="0.8" />`
        : `<path d="M124 148 H176 L170 176 Q150 190 130 176 Z" stroke-width="1.8" stroke-dasharray="5 4" opacity="0.85" />`;
    const zones =
      angle === "front"
        ? `<circle cx="108" cy="128" r="14" ${ZONE_MARK_ATTRS} />
           <circle cx="192" cy="128" r="14" ${ZONE_MARK_ATTRS} />
           <circle cx="68" cy="222" r="12" ${ZONE_MARK_ATTRS} />
           <circle cx="232" cy="222" r="12" ${ZONE_MARK_ATTRS} />`
        : "";
    return `
      ${CORNER_BRACKETS_SVG}
      <g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">
        <path d="${JACKET_OUTLINE}" />
        ${detail}
        ${zones}
      </g>
    `;
  }

  if (!isPants && (angle === "left" || angle === "right")) {
    return `
      ${CORNER_BRACKETS_SVG}
      <g ${sideMirrorAttr(angle)} fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">
        <path d="M150 50 C112 52 98 88 102 124 L90 214 C82 250 98 274 120 288 L128 338 L176 338 L188 288 C210 270 214 242 202 208 L190 126 C186 82 170 48 150 50 Z" />
        <circle cx="150" cy="108" r="24" ${ZONE_MARK_ATTRS} />
        <circle cx="138" cy="258" r="20" ${ZONE_MARK_ATTRS} />
      </g>
    `;
  }

  if (isPants && (angle === "front" || angle === "back")) {
    const zones =
      angle === "front"
        ? `<path d="M150 86 V172" stroke-width="1.7" opacity="0.75" />
           <circle cx="96" cy="268" r="18" ${ZONE_MARK_ATTRS} />
           <circle cx="204" cy="268" r="18" ${ZONE_MARK_ATTRS} />`
        : `<ellipse cx="150" cy="122" rx="50" ry="28" ${ZONE_MARK_ATTRS} />`;
    return `
      ${CORNER_BRACKETS_SVG}
      <g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">
        <path d="${PANTS_OUTLINE}" />
        <path d="M78 84 H222" stroke-width="1.7" opacity="0.7" />
        ${zones}
      </g>
    `;
  }

  if (isPants && (angle === "left" || angle === "right")) {
    return `
      ${CORNER_BRACKETS_SVG}
      <g ${sideMirrorAttr(angle)} fill="none" stroke="currentColor" stroke-width="2.5">
        <rect x="86" y="46" width="128" height="308" rx="6" />
      </g>
    `;
  }

  return `
    ${CORNER_BRACKETS_SVG}
    <g fill="none" stroke="currentColor" stroke-width="2.5">
      <rect x="70" y="54" width="160" height="292" rx="8" />
    </g>
  `;
}

// ============================================================================
// Live Camera Stream & Lightweight Auto-Capture Analysis Loop (~250ms)
// ============================================================================

function stopAnalysisLoop() {
  if (state.analyzeTimer) {
    clearInterval(state.analyzeTimer);
    state.analyzeTimer = null;
  }
  state.lockTicks = 0;
  state.prevLuma = null;
  els.lockBar.style.width = "0%";
  els.viewfinderBox.classList.remove("is-locked");
}

function stopCameraStream() {
  stopAnalysisLoop();
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore track stop error
      }
    });
    state.cameraStream = null;
  }
  els.liveVideo.srcObject = null;
  els.liveVideo.classList.add("hidden");
}

function setHudStatus(text, tone = "neutral") {
  els.hudPill.textContent = text;
  els.hudPill.className = "viewfinder-hud-pill";
  if (tone === "good") els.hudPill.classList.add("is-good");
  if (tone === "warn") els.hudPill.classList.add("is-warn");
}

function updateAutoSnapButtonUi() {
  els.btnAutosnapToggle.textContent = state.autoSnap ? "Auto-Snap: ON" : "Auto-Snap: OFF";
  els.btnAutosnapToggle.classList.toggle("is-on", state.autoSnap);
  els.btnAutosnapToggle.setAttribute("aria-pressed", String(state.autoSnap));
}

async function startCameraViewfinder() {
  stopCameraStream();
  els.stepPreviewImg.classList.add("hidden");
  els.stepGuideEmpty.classList.add("hidden");
  els.viewfinderSvg.classList.remove("hidden");
  els.hudTop.classList.remove("hidden");
  els.lockTrack.classList.remove("hidden");

  if (!state.cameraSupported) {
    enterFallbackViewfinder();
    return;
  }

  els.viewfinderBox.classList.remove("is-fallback");
  setHudStatus("Starting camera…");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        aspectRatio: { ideal: 0.75 },
        width: { ideal: 1080 },
        height: { ideal: 1440 },
      },
      audio: false,
    });

    // If user already navigated away while awaiting permission, release immediately
    if (state.view !== "photo") {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    state.cameraStream = stream;
    state.cameraFallback = false;
    state.cameraOpenedAt = Date.now();
    els.liveVideo.srcObject = stream;
    els.liveVideo.classList.remove("hidden");
    await els.liveVideo.play().catch(() => {});

    updateAutoSnapButtonUi();
    setHudStatus(state.autoSnap ? "Align garment" : "Manual shutter ready");
    startAnalysisLoop();
  } catch (err) {
    console.warn("Live viewfinder unavailable, using native camera fallback:", err);
    enterFallbackViewfinder();
  }
}

function enterFallbackViewfinder() {
  stopCameraStream();
  state.cameraFallback = true;
  els.viewfinderBox.classList.add("is-fallback");
  els.stepGuideEmpty.classList.remove("hidden");
  els.hudTop.classList.add("hidden");
  els.lockTrack.classList.add("hidden");
}

function visibleVideoRect(video) {
  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  const ew = video.clientWidth || 0;
  const eh = video.clientHeight || 0;
  if (vw < 2 || vh < 2 || ew < 2 || eh < 2) {
    return null;
  }
  const videoAspect = vw / vh;
  const elemAspect = ew / eh;
  if (videoAspect > elemAspect) {
    const sw = vh * elemAspect;
    return { sx: (vw - sw) / 2, sy: 0, sw, sh: vh };
  }
  const sh = vw / elemAspect;
  return { sx: 0, sy: (vh - sh) / 2, sw: vw, sh };
}

function ensureAnalysisCanvas() {
  if (!state.analysisCanvas) {
    const canvas = document.createElement("canvas");
    canvas.width = ANALYSIS_W;
    canvas.height = ANALYSIS_H;
    state.analysisCanvas = canvas;
    state.analysisCtx = canvas.getContext("2d", { willReadFrequently: true });
  }
}

function startAnalysisLoop() {
  stopAnalysisLoop();
  if (!state.cameraStream) return;
  ensureAnalysisCanvas();

  state.analyzeTimer = setInterval(() => {
    if (!state.cameraStream || state.isUploading || state.view !== "photo") return;
    if (!state.autoSnap) {
      state.lockTicks = 0;
      els.lockBar.style.width = "0%";
      els.viewfinderBox.classList.remove("is-locked");
      setHudStatus("Manual shutter ready");
      return;
    }
    if (els.liveVideo.readyState < 2) return;

    const crop = visibleVideoRect(els.liveVideo);
    if (!crop) return;

    const w = ANALYSIS_W;
    const h = ANALYSIS_H;
    state.analysisCtx.drawImage(
      els.liveVideo,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      0,
      0,
      w,
      h
    );
    const { data } = state.analysisCtx.getImageData(0, 0, w, h);
    const luma = new Uint8Array(w * h);

    let sumLuma = 0;
    for (let i = 0, px = 0; i < data.length; i += 4, px += 1) {
      const y = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      luma[px] = y;
      sumLuma += y;
    }
    const meanLuma = sumLuma / (w * h);

    // Frame-to-frame steadiness delta
    let meanDelta = 0;
    if (state.prevLuma && state.prevLuma.length === luma.length) {
      let diffSum = 0;
      for (let i = 0; i < luma.length; i += 2) {
        diffSum += Math.abs(luma[i] - state.prevLuma[i]);
      }
      meanDelta = diffSum / (luma.length / 2);
    }
    state.prevLuma = luma;

    // Laplacian variance sharpness inside central 70% ROI
    const xStart = Math.floor(w * 0.15);
    const xEnd = Math.floor(w * 0.85);
    const yStart = Math.floor(h * 0.15);
    const yEnd = Math.floor(h * 0.85);
    let lapSum = 0;
    let lapSqSum = 0;
    let count = 0;

    for (let y = yStart; y < yEnd; y += 1) {
      const row = y * w;
      for (let x = xStart; x < xEnd; x += 1) {
        const idx = row + x;
        const lap =
          4 * luma[idx] -
          luma[idx - 1] -
          luma[idx + 1] -
          luma[idx - w] -
          luma[idx + w];
        lapSum += lap;
        lapSqSum += lap * lap;
        count += 1;
      }
    }
    const lapMean = count > 0 ? lapSum / count : 0;
    const sharpness = count > 0 ? lapSqSum / count - lapMean * lapMean : 0;

    const step = activeSteps()[state.currentStepIndex];
    const minSharpness = step?.key === "labels" ? 110 : 52;
    const warmupDone = Date.now() - state.cameraOpenedAt >= CAMERA_WARMUP_MS;

    if (meanLuma < 42) {
      state.lockTicks = 0;
      els.viewfinderBox.classList.remove("is-locked");
      els.lockBar.style.width = "0%";
      setHudStatus("Needs more light", "warn");
      return;
    }

    if (meanDelta > 11.5) {
      state.lockTicks = Math.max(0, state.lockTicks - 1);
      els.viewfinderBox.classList.remove("is-locked");
      els.lockBar.style.width = `${(state.lockTicks / LOCK_TICKS_REQUIRED) * 100}%`;
      setHudStatus("Hold steady…", "warn");
      return;
    }

    if (sharpness < minSharpness) {
      state.lockTicks = Math.max(0, state.lockTicks - 1);
      els.viewfinderBox.classList.remove("is-locked");
      els.lockBar.style.width = `${(state.lockTicks / LOCK_TICKS_REQUIRED) * 100}%`;
      setHudStatus(step?.key === "labels" ? "Move closer — sharpen label" : "Align garment");
      return;
    }

    if (!warmupDone) {
      setHudStatus("Align garment");
      return;
    }

    state.lockTicks += 1;
    const pct = Math.min(100, (state.lockTicks / LOCK_TICKS_REQUIRED) * 100);
    els.lockBar.style.width = `${pct}%`;
    els.viewfinderBox.classList.add("is-locked");

    if (state.lockTicks >= LOCK_TICKS_REQUIRED) {
      setHudStatus("Capturing!", "good");
      snapLiveFrame();
    } else {
      setHudStatus("Hold steady…", "good");
    }
  }, ANALYZE_INTERVAL_MS);
}

function snapLiveFrame() {
  if (!state.cameraStream || els.liveVideo.readyState < 2 || state.isUploading) return;
  const crop = visibleVideoRect(els.liveVideo);
  if (!crop) return;
  stopAnalysisLoop();
  const width = Math.max(2, Math.round(crop.sw));
  const height = Math.max(2, Math.round(crop.sh));
  const captureCanvas = document.createElement("canvas");
  captureCanvas.width = width;
  captureCanvas.height = height;
  const ctx = captureCanvas.getContext("2d");
  ctx.drawImage(els.liveVideo, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);

  const step = activeSteps()[state.currentStepIndex];
  const angleKey = step ? step.key : "photo";

  captureCanvas.toBlob(
    (blob) => {
      if (!blob) {
        showToast("Could not capture frame from camera. Try native shutter or library.", "error");
        return;
      }
      const file = new File([blob], `${angleKey}_${Date.now()}.jpg`, { type: "image/jpeg" });
      handleFileSelected(file);
    },
    "image/jpeg",
    0.92
  );
}

// ============================================================================
// Initial Session Load & State Hydration
// ============================================================================

async function loadInitialSession() {
  const sid = parseSessionIdFromUrl();
  if (!sid) {
    showErrorView("Missing session ID in capture URL. Scan the QR code on the counter screen.");
    return;
  }
  state.sessionId = sid;
  els.sessionPill.textContent = `Session ${sid}`;

  try {
    const data = await apiJson(`/status/${encodeURIComponent(sid)}`);
    hydrateFromStatus(data);
    els.captureView.classList.remove("hidden");
    els.errorView.classList.add("hidden");

    if (data.status === "scored" && data.score) {
      state.latestScore = data.score;
      renderCompleteScreen(data.score);
    } else if (data.status === "ready_to_score") {
      renderCompleteScreen(null);
      startScorePolling();
    } else if ((data.photos || []).length > 0) {
      state.currentStepIndex = firstOpenStepIndex();
      state.retakeLiveMode = false;
      renderStep({ animate: false });
    } else {
      renderCategoryCard({ animate: false });
    }
  } catch (err) {
    showErrorView(`Session "${sid}" could not be loaded: ${err.message}`);
  }
}

function showErrorView(message) {
  stopCameraStream();
  els.captureView.classList.add("hidden");
  els.errorView.classList.remove("hidden");
  els.errorDetail.textContent = message;
}

function hydrateFromStatus(data) {
  state.garmentType = data.garment_type === "pants" ? "pants" : "jacket";
  els.garmentChipLabel.textContent = capitalize(state.garmentType);

  state.photosByAngle.clear();
  state.defectPhotos = [];
  state.markChoice = null;
  (data.photos || []).forEach((p) => {
    const ang = String(p.angle || "").toLowerCase();
    if (ang === "defect") {
      state.defectPhotos.push(p);
    } else if (REQUIRED_ANGLES.includes(ang)) {
      state.photosByAngle.set(ang, p);
      state.lastFeedbackByAngle.set(ang, {
        angle_ok: Boolean(p.angle_ok),
        predicted_angle: p.predicted_angle || p.clip_predicted_angle || ang,
        expected_similarity: p.expected_similarity ?? p.clip_confidence,
      });
    }
  });
  if (state.defectPhotos.length > 0) {
    state.markChoice = "mark";
  }

  if (data.disclosure) {
    setRiderCrash(Boolean(data.disclosure.crash));
    const u = String(data.disclosure.usage || data.disclosure.exposure_band || "moderate").toLowerCase();
    setRiderUsage(["light", "moderate", "heavy"].includes(u) ? u : "moderate");
    if (data.disclosure.notes && !els.riderNotes.value) {
      els.riderNotes.value = data.disclosure.notes;
    }
  }
}

// ============================================================================
// Card 1: Mobile Garment Category Selection (with PATCH /sessions/<id> Sync)
// ============================================================================

function renderCategoryCard({ animate = true } = {}) {
  stopCameraStream();
  stopScorePolling();
  state.view = "category";

  els.progressCard.classList.add("hidden");
  els.stagePhoto.classList.add("hidden");
  els.stageDisclosure.classList.add("hidden");
  els.stageComplete.classList.add("hidden");
  els.stageCategory.classList.remove("hidden");

  const isPants = state.garmentType === "pants";
  els.btnPickJacket.classList.toggle("is-recommended", !isPants);
  els.btnPickPants.classList.toggle("is-recommended", isPants);
  els.badgeJacket.classList.toggle("hidden", isPants);
  els.badgePants.classList.toggle("hidden", !isPants);

  if (animate) replayDeckCardAnimation(els.stageCategory);
}

async function handleSelectMobileCategory(garmentType) {
  const chosen = garmentType === "pants" ? "pants" : "jacket";
  els.btnPickJacket.disabled = true;
  els.btnPickPants.disabled = true;

  try {
    await apiJson(`/sessions/${encodeURIComponent(state.sessionId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ garment_type: chosen }),
    });
  } catch (err) {
    // Non-fatal fallback: keep selected garment locally and proceed smoothly
    console.warn("Could not sync garment_type via PATCH:", err);
  } finally {
    els.btnPickJacket.disabled = false;
    els.btnPickPants.disabled = false;
  }

  state.garmentType = chosen;
  els.garmentChipLabel.textContent = capitalize(chosen);

  state.currentStepIndex = firstOpenStepIndex();
  state.retakeLiveMode = false;
  renderStep({ animate: true });
}

// ============================================================================
// Progress Bar, Stepper & Active Capture Card
// ============================================================================

function renderProgressAndStepper() {
  els.garmentChipLabel.textContent = capitalize(state.garmentType);
  const capturedRequiredCount = REQUIRED_ANGLES.filter((a) => state.photosByAngle.has(a)).length;
  els.progressText.textContent = `${capturedRequiredCount} / ${REQUIRED_ANGLES.length} captured`;
  els.progressBar.style.width = `${(capturedRequiredCount / REQUIRED_ANGLES.length) * 100}%`;

  els.stepper.innerHTML = activeSteps().map((step, idx) => {
    const isCurrent =
      (state.view === "photo" || state.view === "disclosure") && idx === state.currentStepIndex;
    let statusClass = "";
    let icon = "";

    if (step.required) {
      const photo = state.photosByAngle.get(step.key);
      if (photo) {
        statusClass = photo.angle_ok === false ? "is-warn" : "is-done";
        icon = photo.angle_ok === false ? "!" : "✓";
      }
    } else if (step.key === "defect" && state.defectPhotos.length > 0) {
      statusClass = "is-done";
      icon = `${state.defectPhotos.length}`;
    }

    return `
      <button
        type="button"
        class="step-chip ${isCurrent ? "is-current" : ""} ${statusClass}"
        data-step-index="${idx}"
        aria-current="${isCurrent ? "step" : "false"}"
      >
        <span>${escapeHtml(step.shortLabel)}</span>
        ${icon ? `<span class="tabular" aria-hidden="true">${escapeHtml(icon)}</span>` : ""}
      </button>
    `;
  }).join("");

  els.stepper.querySelectorAll("[data-step-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      stopScorePolling();
      state.currentStepIndex = Number(btn.dataset.stepIndex);
      state.retakeLiveMode = false;
      renderStep({ animate: true });
    });
  });

  const activeChip = els.stepper.querySelector(".step-chip.is-current");
  if (activeChip && typeof activeChip.scrollIntoView === "function") {
    activeChip.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }
}

function renderStep({ animate = false } = {}) {
  const step = activeSteps()[state.currentStepIndex];
  els.stageCategory.classList.add("hidden");
  els.stageComplete.classList.add("hidden");
  els.progressCard.classList.remove("hidden");

  if (step.key === "disclosure") {
    stopCameraStream();
    state.view = "disclosure";
    renderProgressAndStepper();
    els.stagePhoto.classList.add("hidden");
    els.stageDisclosure.classList.remove("hidden");
    if (animate) replayDeckCardAnimation(els.stageDisclosure);
    renderDisclosureStep();
    return;
  }

  state.view = "photo";
  renderProgressAndStepper();
  els.stageDisclosure.classList.add("hidden");
  els.stagePhoto.classList.remove("hidden");
  if (animate) replayDeckCardAnimation(els.stagePhoto);

  const isDefect = step.key === "defect";
  els.stepKicker.textContent = step.required
    ? `Required Angle ${state.currentStepIndex + 1} of ${REQUIRED_ANGLES.length}`
    : "One close-up, only if something looks wrong";
  els.stepTitle.textContent = step.title;
  let hintText = step.hints[state.garmentType] || "";
  if (isDefect && state.flaggedSpot) {
    hintText += ` The counter flagged ${state.flaggedSpot}. Take a damage close-up of that spot.`;
  }
  els.stepHint.innerHTML = `<strong>${capitalize(state.garmentType)} guide:</strong> ${escapeHtml(hintText)}`;
  els.viewfinderSvg.setAttribute("viewBox", VIEWFINDER_VIEWBOX);
  els.viewfinderSvg.innerHTML = buildViewfinderSvg(state.garmentType, step.key);

  const existingPhoto = isDefect
    ? state.defectPhotos[state.defectPhotos.length - 1]
    : state.photosByAngle.get(step.key);

  const showPreview = Boolean(existingPhoto?.photo_url) && !state.retakeLiveMode && !isDefect;

  if (showPreview) {
    stopCameraStream();
    const cacheUrl = `${existingPhoto.photo_url}?v=${encodeURIComponent(
      existingPhoto.id || existingPhoto.created_at || "1"
    )}`;
    if (els.stepPreviewImg.getAttribute("src") !== cacheUrl) {
      els.stepPreviewImg.src = cacheUrl;
    }
    els.stepPreviewImg.alt = `${step.title} uploaded preview`;
    els.stepPreviewImg.classList.remove("hidden");
    els.stepGuideEmpty.classList.add("hidden");
    els.viewfinderSvg.classList.add("hidden");
    els.hudTop.classList.add("hidden");
    els.lockTrack.classList.add("hidden");
    els.viewfinderBox.classList.remove("is-fallback", "is-locked");
  } else {
    els.stepEmptyLabel.textContent = isDefect
      ? "Damage close-up, only if you see a mark"
      : `Ready for ${step.title} photo`;
    startCameraViewfinder();
  }

  // Status Pill
  if (isDefect) {
    els.stepStatusPill.className =
      state.defectPhotos.length > 0 ? "pill pill-approve" : "pill pill-neutral";
    els.stepStatusPill.textContent =
      state.defectPhotos.length > 0
        ? `${state.defectPhotos.length} Close-up${state.defectPhotos.length > 1 ? "s" : ""}`
        : "Only if needed";
  } else if (existingPhoto) {
    const ok = existingPhoto.angle_ok !== false;
    els.stepStatusPill.className = ok ? "pill pill-approve" : "pill pill-review";
    els.stepStatusPill.textContent = ok ? "Verified" : "Check Angle";
  } else {
    els.stepStatusPill.className = "pill pill-neutral";
    els.stepStatusPill.textContent = "Required";
  }

  // Defect multi-shot gallery
  if (isDefect && state.defectPhotos.length > 0) {
    els.defectGallery.classList.remove("hidden");
    els.defectGallery.innerHTML = state.defectPhotos
      .map(
        (p, idx) => `
          <div class="defect-thumb-card" style="width: 96px;">
            <img src="${escapeHtml(p.photo_url)}" alt="Defect shot ${idx + 1}" />
            <div class="defect-thumb-caption">Defect #${idx + 1}</div>
          </div>
        `
      )
      .join("");
  } else {
    els.defectGallery.classList.add("hidden");
    els.defectGallery.innerHTML = "";
  }

  // Primary Shutter Button Label
  if (showPreview) {
    els.btnSnapPhoto.textContent = `Retake ${step.title}`;
  } else if (isDefect) {
    els.btnSnapPhoto.textContent =
      state.defectPhotos.length > 0
        ? "Snap another"
        : "Add a damage close-up";
  } else {
    els.btnSnapPhoto.textContent = `Snap ${step.title} Photo`;
  }

  renderMarkChoice(isDefect);

  // Navigation buttons
  els.btnPrevStep.disabled = state.currentStepIndex === 0;
  if (isDefect) {
    if (state.markChoice === "clear" && state.defectPhotos.length === 0) {
      els.btnNextStep.textContent = "Skip — Nothing Looks Wrong →";
    } else if (state.defectPhotos.length > 0) {
      els.btnNextStep.textContent = "Continue to Disclosure →";
    } else {
      els.btnNextStep.textContent = "Continue →";
    }
  } else if (state.currentStepIndex === REQUIRED_ANGLES.length - 1) {
    els.btnNextStep.textContent = "Next: Damage close-up →";
  } else {
    els.btnNextStep.textContent = "Next Angle →";
  }

  renderClipFeedback(step.key);
}

function renderClipFeedback(angleKey) {
  const fb = state.lastFeedbackByAngle.get(angleKey);
  if (!fb) {
    els.clipBanner.classList.add("hidden");
    return;
  }

  els.clipBanner.classList.remove("hidden");
  const isDefect = angleKey === "defect";
  const matched = isDefect || fb.angle_ok !== false;
  const sim = formatPct(fb.expected_similarity);

  if (matched) {
    els.clipBanner.className = "clip-feedback is-match";
    els.clipTitle.textContent = isDefect ? "Defect photo saved" : "Angle verified";
    els.clipDetail.textContent = isDefect
      ? "Damage close-up logged for store staff."
      : `OpenCLIP confirmed ${angleKey}${sim ? ` (${sim} match)` : ""}. Ready for the next step.`;
    els.clipActions.innerHTML = `
      <button type="button" class="btn btn-primary btn-sm" id="btn-clip-continue">
        Continue to Next Step →
      </button>
    `;
    els.clipActions.querySelector("#btn-clip-continue").addEventListener("click", advanceStep);
  } else {
    const predicted = fb.predicted_angle || "another angle";
    els.clipBanner.className = "clip-feedback is-mismatch";
    els.clipTitle.textContent = `Looks closer to ${predicted} — Retake or Keep Anyway`;
    els.clipDetail.textContent =
      "Check framing so the requested angle fills the silhouette cleanly, or keep this photo and move on.";
    els.clipActions.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" id="btn-clip-retake">
        Retake Photo
      </button>
      <button type="button" class="btn btn-primary btn-sm" id="btn-clip-keep">
        Keep Anyway &amp; Continue →
      </button>
    `;
    els.clipActions.querySelector("#btn-clip-retake").addEventListener("click", reopenLiveRetake);
    els.clipActions.querySelector("#btn-clip-keep").addEventListener("click", advanceStep);
  }
}

function reopenLiveRetake() {
  state.retakeLiveMode = true;
  if (state.cameraFallback || !state.cameraSupported) {
    els.cameraInput.click();
    return;
  }
  renderStep({ animate: false });
}

function renderMarkChoice(isDefect) {
  if (!els.markChoiceForm) return;
  els.markChoiceForm.classList.toggle("hidden", !isDefect);
  els.markChoiceForm.querySelectorAll('input[name="mark-seen"]').forEach((input) => {
    input.checked = input.value === state.markChoice;
  });
  if (!isDefect || !defectStepBlockReason()) clearMarkChoiceError();
}

function clearMarkChoiceError() {
  if (!els.markChoiceForm) return;
  els.markChoiceError.hidden = true;
  els.markCloseupError.hidden = true;
  els.markChoiceForm.querySelectorAll('input[name="mark-seen"]').forEach((input) => {
    input.classList.remove("user-invalid-fallback");
    input.setAttribute("aria-invalid", "false");
    input.removeAttribute("aria-describedby");
  });
}

function showMarkChoiceError(kind) {
  clearMarkChoiceError();
  const choiceError = kind === "closeup" ? els.markCloseupError : els.markChoiceError;
  const describedBy = kind === "closeup" ? "mark-closeup-error" : "mark-choice-error";
  choiceError.hidden = false;
  els.markChoiceForm.querySelectorAll('input[name="mark-seen"]').forEach((input) => {
    const flagThis = kind === "choice" || input.checked;
    if (flagThis) {
      input.classList.add("user-invalid-fallback");
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", describedBy);
    }
  });
  const focusTarget =
    els.markChoiceForm.querySelector('input[name="mark-seen"]:checked') ||
    els.markChoiceForm.querySelector('input[name="mark-seen"]');
  if (focusTarget) focusTarget.focus();
}

function defectStepBlockReason() {
  if (!state.markChoice) return "choice";
  if (state.markChoice === "mark" && state.defectPhotos.length === 0) return "closeup";
  return null;
}

function advanceStep() {
  if (activeSteps()[state.currentStepIndex]?.key === "defect") {
    const block = defectStepBlockReason();
    if (block) {
      showMarkChoiceError(block);
      return;
    }
  }
  if (state.currentStepIndex < activeSteps().length - 1) {
    state.currentStepIndex += 1;
    state.retakeLiveMode = false;
    renderStep({ animate: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// ============================================================================
// Upload Photo -> POST /upload (OpenCLIP Stage 1 Verification)
// ============================================================================

async function handleFileSelected(file) {
  if (!file || !state.sessionId || state.isUploading) return;
  const step = activeSteps()[state.currentStepIndex];
  if (!step || step.key === "disclosure") return;

  stopCameraStream();

  // Immediate local preview while uploading
  const localUrl = URL.createObjectURL(file);
  els.stepPreviewImg.src = localUrl;
  els.stepPreviewImg.classList.remove("hidden");
  els.stepGuideEmpty.classList.add("hidden");
  els.viewfinderSvg.classList.add("hidden");
  els.hudTop.classList.add("hidden");
  els.lockTrack.classList.add("hidden");

  state.isUploading = true;
  state.retakeLiveMode = false;
  els.uploadBusy.classList.remove("hidden");
  els.clipBanner.classList.add("hidden");
  els.btnSnapPhoto.disabled = true;
  els.btnChooseLibrary.disabled = true;

  try {
    const formData = new FormData();
    formData.append("session_id", state.sessionId);
    formData.append("angle", step.key);
    formData.append("file", file);

    const res = await apiJson("/upload", {
      method: "POST",
      body: formData,
    });

    const photoRecord = {
      id: Date.now(),
      angle: res.angle,
      photo_url: res.photo_url,
      angle_ok: Boolean(res.angle_ok),
      angle_status: res.angle_status,
      predicted_angle: res.predicted_angle,
      expected_similarity: res.expected_similarity,
      created_at: String(Date.now()),
    };

    if (step.key === "defect") {
      state.defectPhotos.push(photoRecord);
      state.markChoice = "mark";
    } else {
      state.photosByAngle.set(step.key, photoRecord);
    }

    state.lastFeedbackByAngle.set(step.key, {
      angle_ok: Boolean(res.angle_ok),
      predicted_angle: res.predicted_angle,
      expected_similarity: res.expected_similarity,
    });

    renderStep({ animate: false });
  } catch (err) {
    showToast(`Upload failed: ${err.message}`, "error", 6000);
    renderStep({ animate: false });
  } finally {
    URL.revokeObjectURL(localUrl);
    state.isUploading = false;
    els.uploadBusy.classList.add("hidden");
    els.btnSnapPhoto.disabled = false;
    els.btnChooseLibrary.disabled = false;
    els.cameraInput.value = "";
    els.libraryInput.value = "";
  }
}

// ============================================================================
// Rider Disclosure & Final Submit -> POST /sessions/<id>/complete
// ============================================================================

function setRiderCrash(val) {
  state.riderCrash = Boolean(val);
  els.riderCrashBtns.forEach((btn) => {
    const btnVal = btn.dataset.riderCrash === "true";
    const active = btnVal === state.riderCrash;
    btn.classList.toggle("is-selected", active && !btnVal);
    btn.classList.toggle("is-selected-danger", active && btnVal);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function setRiderUsage(val) {
  state.riderUsage = val;
  els.riderUsageBtns.forEach((btn) => {
    const active = btn.dataset.riderUsage === val;
    btn.classList.toggle("is-selected", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function renderDisclosureStep() {
  const missing = REQUIRED_ANGLES.filter((a) => !state.photosByAngle.has(a));
  if (missing.length > 0) {
    els.missingBox.classList.remove("hidden");
    els.missingText.textContent = `Missing: ${missing
      .map((a) => activeSteps().find((s) => s.key === a)?.title || capitalize(a))
      .join(", ")}.`;
  } else {
    els.missingBox.classList.add("hidden");
  }
}

async function handleFinishSubmit() {
  if (!state.sessionId) return;
  stopCameraStream();

  els.btnFinishSubmit.disabled = true;
  els.btnFinishSubmit.innerHTML = `<span class="spinner spinner-dark" aria-hidden="true"></span> Sending…`;

  try {
    const payload = {
      garment_type: state.garmentType,
      disclosure: {
        crash: state.riderCrash,
        usage: state.riderUsage,
        exposure_band: state.riderUsage,
        notes: els.riderNotes.value.trim(),
      },
    };

    await apiJson(`/sessions/${encodeURIComponent(state.sessionId)}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    renderCompleteScreen(null);
    startScorePolling();
  } catch (err) {
    showToast(`Could not complete session: ${err.message}`, "error", 6500);
  } finally {
    els.btnFinishSubmit.disabled = false;
    els.btnFinishSubmit.textContent = "Send to counter";
  }
}

// ============================================================================
// Post-Submission Confirmation & Live Score Summary Polling
// ============================================================================

function stopScorePolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function resultGoal(score) {
  const missing = Array.isArray(score.missing_angles) ? score.missing_angles : [];
  const mismatched = Array.isArray(score.mismatched_angles) ? score.mismatched_angles : [];
  const closeupOnly =
    score.decision === "rejected_retake" &&
    Boolean(score.closeup_needed) &&
    missing.length === 0 &&
    mismatched.length === 0;
  if (closeupOnly) {
    return "One close-up finishes the record. The score stays open until that spot is photographed.";
  }
  if (score.decision === "auto_approved") {
    return "Log it. Staff still check the garment in hand.";
  }
  if (score.decision === "human_review") {
    return "Borderline. Staff decide in hand.";
  }
  if (score.decision === "rejected_retake") {
    return "Photo coverage is incomplete. Retake the flagged angles.";
  }
  if (score.decision === "rejected_upcycle") {
    return "Declined for buy-in. Upcycle the materials, or talk trade-in.";
  }
  return "Finish photo coverage and damage disclosure.";
}

function isCloseupOnly(score) {
  if (!score || score.decision !== "rejected_retake" || !score.closeup_needed) return false;
  const missing = Array.isArray(score.missing_angles) ? score.missing_angles : [];
  const mismatched = Array.isArray(score.mismatched_angles) ? score.mismatched_angles : [];
  return missing.length === 0 && mismatched.length === 0;
}

function startScorePolling() {
  stopScorePolling();
  if (!state.sessionId) return;
  const seenAt = state.latestScore?.updated_at || "";

  const check = async () => {
    try {
      const data = await apiJson(`/status/${encodeURIComponent(state.sessionId)}`);
      const next = data.score;
      if (!next) return;
      if (seenAt && next.updated_at === seenAt) return;
      state.latestScore = next;
      stopScorePolling();
      renderCompleteScreen(next);
    } catch (err) {
      console.warn("Phone score poll error:", err);
    }
  };

  check();
  state.pollTimer = setInterval(check, 2000);
}

function renderCompleteScreen(score) {
  stopCameraStream();
  state.view = "complete";
  els.progressCard.classList.remove("hidden");
  renderProgressAndStepper();

  els.stageCategory.classList.add("hidden");
  els.stagePhoto.classList.add("hidden");
  els.stageDisclosure.classList.add("hidden");
  els.stageComplete.classList.remove("hidden");

  if (!score) {
    els.completePollPill.classList.remove("hidden");
    els.completeWaiting.classList.remove("hidden");
    els.completeScoreCard.classList.add("hidden");
    return;
  }

  els.completePollPill.classList.add("hidden");
  els.completeWaiting.classList.add("hidden");
  els.completeScoreCard.classList.remove("hidden");

  const total = Math.max(0, Math.min(100, Number(score.total_score ?? 0)));
  const cov = Math.max(0, Math.min(50, Number(score.photo_coverage_score ?? 0)));
  const dmg = Math.max(0, Math.min(50, Number(score.damage_disclosure_score ?? 0)));

  let tone = "review";
  let pillText = "Pending Staff Review";
  if (score.decision === "auto_approved") {
    tone = "approve";
    pillText = "Auto-Approved & Logged";
  } else if (score.decision === "rejected_retake") {
    tone = "reject";
    pillText = "Photo Retake Required";
  } else if (score.decision === "rejected_upcycle") {
    tone = "reject";
    pillText = "Declined for Buy-In";
  }

  els.phoneDecisionBanner.className = `decision-banner is-${tone}`;
  els.phoneDecisionPill.className = `pill pill-${tone}`;
  els.phoneDecisionPill.textContent = pillText;
  els.phoneDecisionTitle.textContent = score.decision_label || pillText;
  els.phoneDecisionSummary.textContent = score.summary || "";
  els.phoneDecisionGoal.textContent = resultGoal(score);

  els.phoneScoreTotal.textContent = `${total} / 100`;
  els.phoneCovText.textContent = `${cov} / 50`;
  els.phoneCovBar.style.width = `${(cov / 50) * 100}%`;
  els.phoneCovBar.className = `progress-fill is-${cov >= 40 ? "approve" : cov >= 25 ? "review" : "reject"}`;

  els.phoneDmgText.textContent = `${dmg} / 50`;
  els.phoneDmgBar.style.width = `${(dmg / 50) * 100}%`;
  els.phoneDmgBar.className = `progress-fill is-${dmg >= 40 ? "approve" : dmg >= 25 ? "review" : "reject"}`;

  const retakeAngles = Array.isArray(score.retake_angles) ? score.retake_angles : [];
  if (score.decision === "rejected_retake" && (retakeAngles.length > 0 || score.closeup_needed)) {
    els.phoneRetakeCard.classList.remove("hidden");
    if (isCloseupOnly(score)) {
      els.phoneRetakeTitle.textContent = "Damage close-up";
      els.phoneRetakeText.textContent = `Photograph ${score.closeup_needed}, then send the photos again. This holds the score. It is not a buy-in decline.`;
      els.btnPhoneRetakeFlagged.textContent = "Shoot the close-up";
    } else {
      const names = retakeAngles
        .filter((angle) => angle !== "defect")
        .map((angle) => activeSteps().find((step) => step.key === angle)?.title || capitalize(angle));
      const closeupBit = score.closeup_needed ? ` Also one damage close-up of ${score.closeup_needed}.` : "";
      els.phoneRetakeTitle.textContent = "Retake Flagged Angles";
      els.phoneRetakeText.textContent = `Please retake clearer photos for: ${names.join(", ") || "the flagged angles"}.${closeupBit}`;
      els.btnPhoneRetakeFlagged.textContent = "Retake Flagged Photos";
    }
  } else {
    els.phoneRetakeCard.classList.add("hidden");
  }

  const upcycle = score.upcycle_plan;
  if (upcycle && typeof upcycle === "object") {
    els.phoneUpcycleCard.classList.remove("hidden");
    els.phoneUpcycleHeadline.textContent =
      upcycle.headline || "Declined for Buy-In — Route to Circular Upcycling";
    els.phoneUpcycleSummary.textContent = upcycle.summary || "";
    const pathways = Array.isArray(upcycle.pathways)
      ? upcycle.pathways
      : Array.isArray(upcycle.recovery_pathways)
      ? upcycle.recovery_pathways
      : [];
    els.phoneUpcycleList.innerHTML = pathways
      .map((p) => `<li>${escapeHtml(p)}</li>`)
      .join("");
    els.phoneUpcycleTradein.innerHTML = `
      <strong>In-Store Responsible Retirement &amp; New-Gear Trade-In</strong>
      ${escapeHtml(
        upcycle.trade_in_note ||
          "Chat with Moto Reloaded staff in store about retiring this gear responsibly and exploring new riding gear options."
      )}
    `;
  } else {
    els.phoneUpcycleCard.classList.add("hidden");
  }
}

// ============================================================================
// Event Wiring & Clean Lifecycle Teardown
// ============================================================================

function bindEvents() {
  // Card 1: Category pickers
  els.btnPickJacket.addEventListener("click", () => handleSelectMobileCategory("jacket"));
  els.btnPickPants.addEventListener("click", () => handleSelectMobileCategory("pants"));
  els.btnChangeCategory.addEventListener("click", () => renderCategoryCard({ animate: true }));

  // Auto-Snap HUD toggle
  els.btnAutosnapToggle.addEventListener("click", () => {
    state.autoSnap = !state.autoSnap;
    state.lockTicks = 0;
    els.lockBar.style.width = "0%";
    els.viewfinderBox.classList.remove("is-locked");
    updateAutoSnapButtonUi();
    setHudStatus(state.autoSnap ? "Align garment" : "Manual shutter ready");
  });

  // Primary Shutter / Retake Button
  els.btnSnapPhoto.addEventListener("click", () => {
    const step = activeSteps()[state.currentStepIndex];
    const isDefect = step?.key === "defect";
    const existingPhoto = !isDefect ? state.photosByAngle.get(step?.key) : null;
    const showingPreview = Boolean(existingPhoto?.photo_url) && !state.retakeLiveMode && !isDefect;

    if (showingPreview) {
      reopenLiveRetake();
      return;
    }

    if (state.cameraStream && !state.cameraFallback && els.liveVideo.readyState >= 2) {
      snapLiveFrame();
    } else {
      els.cameraInput.click();
    }
  });

  els.btnChooseLibrary.addEventListener("click", () => els.libraryInput.click());

  els.cameraInput.addEventListener("change", (evt) => {
    const file = evt.target.files?.[0];
    if (file) handleFileSelected(file);
  });

  els.libraryInput.addEventListener("change", (evt) => {
    const file = evt.target.files?.[0];
    if (file) handleFileSelected(file);
  });

  els.btnPrevStep.addEventListener("click", () => {
    if (state.currentStepIndex > 0) {
      state.currentStepIndex -= 1;
      state.retakeLiveMode = false;
      renderStep({ animate: true });
    }
  });

  els.btnNextStep.addEventListener("click", advanceStep);

  if (els.markChoiceForm) {
    els.markChoiceForm.addEventListener("submit", (event) => {
      event.preventDefault();
      advanceStep();
    });
    els.markChoiceForm.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.name !== "mark-seen") return;
      state.markChoice = input.value === "mark" ? "mark" : "clear";
      clearMarkChoiceError();
      const step = activeSteps()[state.currentStepIndex];
      if (step?.key === "defect") {
        if (state.markChoice === "clear" && state.defectPhotos.length === 0) {
          els.btnNextStep.textContent = "Skip — Nothing Looks Wrong →";
        } else if (state.defectPhotos.length > 0) {
          els.btnNextStep.textContent = "Continue to Disclosure →";
        } else {
          els.btnNextStep.textContent = "Continue →";
        }
      }
    });
  }

  els.btnJumpMissing.addEventListener("click", () => {
    const firstMissingIdx = activeSteps().findIndex(
      (step) => step.required && !state.photosByAngle.has(step.key)
    );
    if (firstMissingIdx >= 0) {
      state.currentStepIndex = firstMissingIdx;
      state.retakeLiveMode = false;
      renderStep({ animate: true });
    }
  });

  els.riderCrashBtns.forEach((btn) => {
    btn.addEventListener("click", () => setRiderCrash(btn.dataset.riderCrash === "true"));
  });

  els.riderUsageBtns.forEach((btn) => {
    btn.addEventListener("click", () => setRiderUsage(btn.dataset.riderUsage));
  });

  els.btnFinishSubmit.addEventListener("click", handleFinishSubmit);

  els.btnBackToPhotos.addEventListener("click", () => {
    state.currentStepIndex = REQUIRED_ANGLES.length;
    state.retakeLiveMode = false;
    renderStep({ animate: true });
  });

  els.btnPhoneRetakeFlagged.addEventListener("click", () => {
    stopScorePolling();
    const score = state.latestScore || {};
    const angles = Array.isArray(score.retake_angles) ? score.retake_angles : [];
    const closeupOnly = isCloseupOnly(score);
    if (closeupOnly) {
      state.markChoice = "mark";
      state.flaggedSpot = String(score.closeup_needed || "");
    }
    const targetKey = closeupOnly ? "defect" : angles.find((angle) => angle !== "defect") || angles[0];
    const targetIdx = activeSteps().findIndex((step) => step.key === targetKey);
    state.currentStepIndex = targetIdx >= 0 ? targetIdx : 0;
    state.retakeLiveMode = true;
    renderStep({ animate: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Always release hardware camera tracks cleanly when navigating away or hiding page
  window.addEventListener("pagehide", stopCameraStream);
  window.addEventListener("beforeunload", stopCameraStream);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopCameraStream();
    } else if (state.view === "photo" && !state.isUploading) {
      const step = activeSteps()[state.currentStepIndex];
      const existing = step?.key !== "defect" ? state.photosByAngle.get(step?.key) : null;
      if (!existing || state.retakeLiveMode || step?.key === "defect") {
        startCameraViewfinder();
      }
    }
  });
}

bindEvents();
loadInitialSession();
