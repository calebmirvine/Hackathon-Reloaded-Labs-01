// # Created by Caleb M. Irvine for use by Moto Reloaded

const REQUIRED_ANGLES = ["front", "left", "right", "back", "inside", "labels"];

const ANGLE_META = {
  front: {
    title: "Front Exterior",
    jacket: "Laid flat, zipped · torso & front shoulders",
    pants: "Laid flat, fastened · hips & knees",
  },
  left: {
    title: "Left Side",
    jacket: "Outer left shoulder, sleeve & elbow (Zone 1)",
    pants: "Outer left hip, thigh & knee (Zone 1)",
  },
  right: {
    title: "Right Side",
    jacket: "Outer right shoulder, sleeve & elbow (Zone 1)",
    pants: "Outer right hip, thigh & knee (Zone 1)",
  },
  back: {
    title: "Back Exterior",
    jacket: "Full back & upper-back Zone 1",
    pants: "Full back & seat area",
  },
  inside: {
    title: "Inside & Lining",
    jacket: "Inside-out lining, layers & protector pockets",
    pants: "Inside-out lining, layers & hip/knee pockets",
  },
  labels: {
    title: "Labels Close-Up",
    jacket: "Sharp brand, composition & CE (if present)",
    pants: "Sharp brand, composition & CE (if present)",
  },
};

const DEFAULT_RUNTIME_SETTINGS = {
  vision_deployment: "gpt-4.1",
  temperature: 0.1,
  max_tokens: 1800,
  poll_interval_ms: 2000,
  auto_score_on_complete: true,
  clip_warn_threshold: 0.22,
  auto_approve_min: 85,
  human_review_min: 50,
  public_base_url: "",
};

const state = {
  activeTab: "intake",
  wizardStep: 1, // 1 = Category, 2 = Capture, 3 = Verification & Audit
  sessionId: null,
  garmentType: "jacket",
  captureUrl: "",
  qrDataUrl: "",
  pollTimer: null,
  isScoring: false,
  autoScoredSessions: new Set(),
  lastStatus: null,
  disclosureDirty: false,
  counterCrash: false,
  // Flicker-free DOM signature trackers
  angleSignatures: new Map(),
  angleCardNodes: new Map(),
  defectSig: "",
  lastScoreSig: "",
  // Workspace data
  settings: { ...DEFAULT_RUNTIME_SETTINGS },
  availableDeployments: ["gpt-4.1", "gpt-4.1-mini"],
  publicConfig: {
    score_mode: "live",
    passcode_configured: false,
    admin_write_protected: false,
    live_scores_remaining_today: null,
    max_live_scores_per_day: 0,
    max_live_scores_per_hour: 0,
  },
  livePasscode: (() => {
    try {
      return sessionStorage.getItem("moto_live_passcode") || "";
    } catch {
      return "";
    }
  })(),
  diagnostics: null,
  latestTracePayload: null,
  auditTracePayload: null,
  queueFilter: "all",
  queueItems: [],
  sessions: [],
};

const els = {
  toast: document.getElementById("global-toast"),
  headerModelPill: document.getElementById("header-model-pill"),
  portfolioModeBar: document.getElementById("portfolio-mode-bar"),
  portfolioModePill: document.getElementById("portfolio-mode-pill"),
  portfolioModeDesc: document.getElementById("portfolio-mode-desc"),
  portfolioPasscodeForm: document.getElementById("portfolio-passcode-form"),
  portfolioPasscodeInput: document.getElementById("portfolio-passcode-input"),
  btnUnlockLive: document.getElementById("btn-unlock-live"),
  btnLockLive: document.getElementById("btn-lock-live"),
  adminLockBadge: document.getElementById("admin-lock-badge"),
  card1SampleDrawer: document.getElementById("card1-sample-drawer"),
  tabs: document.querySelectorAll(".nav-tab"),
  panels: {
    intake: document.getElementById("panel-intake"),
    queue: document.getElementById("panel-queue"),
    log: document.getElementById("panel-log"),
    admin: document.getElementById("panel-admin"),
  },
  queueBadge: document.getElementById("queue-badge"),
  logBadge: document.getElementById("log-badge"),
  // Wizard
  wizSteps: {
    1: document.getElementById("wiz-step-1"),
    2: document.getElementById("wiz-step-2"),
    3: document.getElementById("wiz-step-3"),
  },
  cards: {
    1: document.getElementById("card-step-1"),
    2: document.getElementById("card-step-2"),
    3: document.getElementById("card-step-3"),
  },
  // Card 1
  pickJacketBtn: document.getElementById("btn-pick-jacket"),
  pickPantsBtn: document.getElementById("btn-pick-pants"),
  card1SampleSelect: document.getElementById("card1-sample-select"),
  card1SampleGarment: document.getElementById("card1-sample-garment"),
  btnCard1LoadSample: document.getElementById("btn-card1-load-sample"),
  // Card 2
  btnBackCategory: document.getElementById("btn-back-category"),
  captureSessionTitle: document.getElementById("capture-session-title"),
  captureGarmentPill: document.getElementById("capture-garment-pill"),
  captureStatusPill: document.getElementById("capture-status-pill"),
  pollingIndicator: document.getElementById("polling-indicator"),
  pollingLabel: document.getElementById("polling-label"),
  angleCountPill: document.getElementById("angle-count-pill"),
  qrRail: document.getElementById("qr-rail"),
  qrFrameBox: document.getElementById("qr-frame-box"),
  qrImage: document.getElementById("qr-image"),
  captureUrlInput: document.getElementById("capture-url-input"),
  btnCopyUrl: document.getElementById("btn-copy-url"),
  linkOpenCapture: document.getElementById("link-open-capture"),
  angleGrid: document.getElementById("angle-grid"),
  defectSection: document.getElementById("defect-section"),
  defectCountPill: document.getElementById("defect-count-pill"),
  defectStrip: document.getElementById("defect-strip"),
  disclosureSummaryPill: document.getElementById("disclosure-summary-pill"),
  counterCrashBtns: document.querySelectorAll("[data-counter-crash]"),
  counterUsageSelect: document.getElementById("counter-usage-select"),
  counterNotesInput: document.getElementById("counter-notes-input"),
  btnPollNow: document.getElementById("btn-poll-now"),
  captureReadyHint: document.getElementById("capture-ready-hint"),
  btnContinueAudit: document.getElementById("btn-continue-audit"),
  // Card 3
  auditSessionTitle: document.getElementById("audit-session-title"),
  auditGarmentPill: document.getElementById("audit-garment-pill"),
  auditBrandPill: document.getElementById("audit-brand-pill"),
  btnExportXlsx: document.getElementById("btn-export-xlsx"),
  scoreLoading: document.getElementById("score-loading"),
  scoreLoadingDetail: document.getElementById("score-loading-detail"),
  scoreReport: document.getElementById("score-report"),
  decisionBanner: document.getElementById("decision-banner"),
  decisionBandPill: document.getElementById("decision-band-pill"),
  buyinStatusPill: document.getElementById("buyin-status-pill"),
  decisionTitle: document.getElementById("decision-title"),
  decisionSummary: document.getElementById("decision-summary"),
  decisionGoal: document.getElementById("decision-goal"),
  gaugeA11y: document.getElementById("gauge-a11y"),
  gaugeCircle: document.getElementById("gauge-circle"),
  scoreTotal: document.getElementById("score-total"),
  scoreCoverageText: document.getElementById("score-coverage-text"),
  scoreCoverageBar: document.getElementById("score-coverage-bar"),
  scoreDamageText: document.getElementById("score-damage-text"),
  scoreDamageBar: document.getElementById("score-damage-bar"),
  protectionDisclosurePill: document.getElementById("protection-disclosure-pill"),
  hardGateBox: document.getElementById("hard-gate-box"),
  hardGateList: document.getElementById("hard-gate-list"),
  contradictionBox: document.getElementById("contradiction-box"),
  contradictionReason: document.getElementById("contradiction-reason"),
  retakeBox: document.getElementById("retake-box"),
  retakeAnglesText: document.getElementById("retake-angles-text"),
  upcycleCard: document.getElementById("upcycle-card"),
  upcycleMaterialPill: document.getElementById("upcycle-material-pill"),
  upcycleHeadline: document.getElementById("upcycle-headline"),
  upcycleSummary: document.getElementById("upcycle-summary"),
  upcyclePathways: document.getElementById("upcycle-pathways"),
  upcycleTradein: document.getElementById("upcycle-tradein"),
  upcycleClerkStep: document.getElementById("upcycle-clerk-step"),
  labelsGrid: document.getElementById("labels-grid"),
  checklistSummaryPill: document.getElementById("checklist-summary-pill"),
  checklistTbody: document.getElementById("checklist-tbody"),
  auditTraceCard: document.getElementById("audit-trace-card"),
  auditTraceHeading: document.getElementById("audit-trace-heading"),
  auditTraceProviderPill: document.getElementById("audit-trace-provider-pill"),
  auditTraceStats: document.getElementById("audit-trace-stats"),
  auditTraceSystem: document.getElementById("audit-trace-system"),
  auditTraceUser: document.getElementById("audit-trace-user"),
  auditTraceRaw: document.getElementById("audit-trace-raw"),
  btnAuditCopyPrompt: document.getElementById("btn-audit-copy-prompt"),
  btnAuditCopyJson: document.getElementById("btn-audit-copy-json"),
  auditInlineReview: document.getElementById("audit-inline-review"),
  auditStaffNotes: document.getElementById("audit-staff-notes"),
  btnAuditApprove: document.getElementById("btn-audit-approve"),
  btnAuditDecline: document.getElementById("btn-audit-decline"),
  scoreDisclaimer: document.getElementById("score-disclaimer"),
  btnAuditBackCapture: document.getElementById("btn-audit-back-capture"),
  btnAuditRescore: document.getElementById("btn-audit-rescore"),
  btnStartNextIntake: document.getElementById("btn-start-next-intake"),
  // Queue & Ledger
  queueFilterBtns: document.querySelectorAll("[data-queue-filter]"),
  btnRefreshQueue: document.getElementById("btn-refresh-queue"),
  queueList: document.getElementById("queue-list"),
  btnRefreshLog: document.getElementById("btn-refresh-log"),
  logTbody: document.getElementById("log-tbody"),
  // Admin & Debug
  btnRefreshAdmin: document.getElementById("btn-refresh-admin"),
  adminDiagGrid: document.getElementById("admin-diag-grid"),
  adminSettingsForm: document.getElementById("admin-settings-form"),
  setDeployment: document.getElementById("set-deployment"),
  setPollInterval: document.getElementById("set-poll-interval"),
  setTemperature: document.getElementById("set-temperature"),
  setMaxTokens: document.getElementById("set-max-tokens"),
  setClipThreshold: document.getElementById("set-clip-threshold"),
  setPublicUrl: document.getElementById("set-public-url"),
  setAutoApproveMin: document.getElementById("set-auto-approve-min"),
  setHumanReviewMin: document.getElementById("set-human-review-min"),
  setAutoScore: document.getElementById("set-auto-score"),
  btnSaveSettings: document.getElementById("btn-save-settings"),
  sandboxSampleSelect: document.getElementById("sandbox-sample-select"),
  sandboxGarmentSelect: document.getElementById("sandbox-garment-select"),
  sandboxPresetSelect: document.getElementById("sandbox-preset-select"),
  btnSandboxRun: document.getElementById("btn-sandbox-run"),
  adminTraceSubtitle: document.getElementById("admin-trace-subtitle"),
  adminTraceEmpty: document.getElementById("admin-trace-empty"),
  adminTraceContent: document.getElementById("admin-trace-content"),
  adminTraceStats: document.getElementById("admin-trace-stats"),
  adminTraceSystem: document.getElementById("admin-trace-system"),
  adminTraceUser: document.getElementById("admin-trace-user"),
  adminTraceRaw: document.getElementById("admin-trace-raw"),
  btnAdminCopyPrompt: document.getElementById("btn-admin-copy-prompt"),
  btnAdminCopyJson: document.getElementById("btn-admin-copy-json"),
  // Lightbox
  lightbox: document.getElementById("photo-lightbox"),
  lightboxTitle: document.getElementById("lightbox-title"),
  lightboxSubtitle: document.getElementById("lightbox-subtitle"),
  lightboxImg: document.getElementById("lightbox-img"),
  btnCloseLightbox: document.getElementById("btn-close-lightbox"),
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

function formatDate(iso) {
  if (!iso) return "—";
  try {
    const dt = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n);
  return `${Math.max(0, Math.min(100, pct))}%`;
}

function prettyJsonText(raw) {
  if (raw === null || raw === undefined || raw === "") return "{}";
  if (typeof raw === "object") {
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return String(raw);
    }
  }
  const text = String(raw).trim();
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

async function copyText(text, successMsg) {
  if (!text) {
    showToast("Nothing to copy yet.", "warn", 2200);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg, "success", 2400);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    showToast(successMsg, "success", 2400);
  }
}

let toastTimer = null;
function showToast(message, variant = "info", durationMs = 4200) {
  els.toast.className = "toast-banner";
  if (variant === "error") els.toast.classList.add("is-error");
  if (variant === "success") els.toast.classList.add("is-success");
  if (variant === "warn") els.toast.classList.add("is-warn");
  els.toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button type="button" class="btn btn-ghost btn-sm" style="min-height:30px;padding:0.2rem 0.6rem;">Dismiss</button>
  `;
  els.toast.querySelector("button").addEventListener("click", () => {
    els.toast.classList.add("hidden");
  });
  els.toast.classList.remove("hidden");

  if (toastTimer) clearTimeout(toastTimer);
  if (durationMs > 0) {
    toastTimer = setTimeout(() => {
      els.toast.classList.add("hidden");
    }, durationMs);
  }
}

function buildAuthHeaders(extra = {}) {
  const headers = { ...extra };
  if (state.livePasscode) {
    headers["X-Live-Passcode"] = state.livePasscode;
  }
  return headers;
}

function setLivePasscode(value) {
  state.livePasscode = String(value || "").trim();
  try {
    if (state.livePasscode) {
      sessionStorage.setItem("moto_live_passcode", state.livePasscode);
    } else {
      sessionStorage.removeItem("moto_live_passcode");
    }
  } catch {
    // Ignore storage quota / private-browsing errors
  }
}

async function loadPublicConfig() {
  try {
    const cfg = await apiJson("/config/public");
    if (cfg && typeof cfg === "object") {
      state.publicConfig = { ...state.publicConfig, ...cfg };
    }
  } catch (err) {
    console.warn("Could not load public runtime config:", err);
  }
  renderPortfolioModeBar();
}

function renderPortfolioModeBar() {
  const cfg = state.publicConfig || {};
  const mode = cfg.score_mode || "live";
  const isUnlocked = Boolean(state.livePasscode);
  const adminLocked = Boolean(cfg.admin_write_protected) && !isUnlocked;

  if (els.adminLockBadge) {
    els.adminLockBadge.classList.toggle("hidden", !adminLocked);
  }

  if (mode === "live") {
    els.portfolioModeBar.classList.add("hidden");
    return;
  }

  els.portfolioModeBar.classList.remove("hidden");

  const remaining = cfg.live_scores_remaining_today;
  const maxDay = cfg.max_live_scores_per_day;
  const quotaText =
    maxDay > 0 && remaining !== null && remaining !== undefined
      ? ` (${remaining}/${maxDay} live calls left today)`
      : "";

  if (mode === "demo") {
    els.portfolioModePill.className = "pill pill-review";
    els.portfolioModePill.textContent = "Portfolio Demo Mode · $0 API Spend";
    els.portfolioModeDesc.textContent =
      "Real Stage-1 OpenCLIP angle checks and 0–100 deterministic scoring are active. Live Azure OpenAI calls are disabled in this showcase.";
    els.portfolioPasscodeForm.classList.add("hidden");
    return;
  }

  els.portfolioPasscodeForm.classList.remove("hidden");
  if (isUnlocked) {
    els.portfolioModePill.className = "pill pill-approve";
    els.portfolioModePill.textContent = `Live Azure AI Unlocked · ${state.settings.vision_deployment || "gpt-4.1-mini"}`;
    els.portfolioModeDesc.textContent = `Live Azure OpenAI vision rubric inspection is unlocked for this browser tab${quotaText}.`;
    els.portfolioPasscodeInput.classList.add("hidden");
    els.btnUnlockLive.classList.add("hidden");
    els.btnLockLive.classList.remove("hidden");
  } else {
    els.portfolioModePill.className = "pill pill-review";
    els.portfolioModePill.textContent = "Demo Mode · $0 API Spend";
    els.portfolioModeDesc.textContent =
      `Real Stage-1 OpenCLIP angle verification & 0–100 scoring run free. Enter the access passcode to unlock live Azure OpenAI vision inspection${quotaText}.`;
    els.portfolioPasscodeInput.classList.remove("hidden");
    els.btnUnlockLive.classList.remove("hidden");
    els.btnLockLive.classList.add("hidden");
  }
}

async function handleUnlockPasscode(evt) {
  evt.preventDefault();
  const candidate = els.portfolioPasscodeInput.value.trim();
  if (!candidate) {
    showToast("Enter the live access passcode first.", "warn", 3000);
    return;
  }

  els.btnUnlockLive.disabled = true;
  try {
    const res = await apiJson("/auth/verify-passcode", {
      method: "POST",
      headers: { "X-Live-Passcode": candidate },
    });
    setLivePasscode(candidate);
    els.portfolioPasscodeInput.value = "";
    if (res && typeof res === "object") {
      state.publicConfig = { ...state.publicConfig, ...res };
    }
    renderPortfolioModeBar();
    showToast("Live Azure OpenAI vision scoring unlocked for this session.", "success", 4200);
  } catch (err) {
    showToast(`Could not unlock Live AI: ${err.message}`, "error", 5500);
  } finally {
    els.btnUnlockLive.disabled = false;
  }
}

function handleLockPasscode() {
  setLivePasscode("");
  renderPortfolioModeBar();
  showToast("Returned to Portfolio Demo Mode ($0 API spend).", "info", 3200);
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
    const detail =
      typeof body?.detail === "string"
        ? body.detail
        : Array.isArray(body?.detail)
        ? body.detail.map((d) => d.msg || JSON.stringify(d)).join("; ")
        : body?.message || `Request failed (${res.status})`;
    throw new Error(detail);
  }
  return body;
}

function decisionMeta(decision, scoreValue = null) {
  switch (decision) {
    case "auto_approved":
      return {
        tone: "approve",
        badgeClass: "pill-approve",
        bandText: "Auto-Approved",
        title: "Auto-Approved & Logged",
        buyInText: "Buy-In Eligible · Confirm In-Hand",
        buyInClass: "pill-approve",
        goalText: "Log it for buy-in. Staff still confirm the garment in hand before any offer.",
      };
    case "human_review":
      return {
        tone: "review",
        badgeClass: "pill-review",
        bandText: "Pending Staff Review",
        title: "Pending Staff Review",
        buyInText: "Held for In-Hand Inspection",
        buyInClass: "pill-review",
        goalText: "Borderline wear stays with staff. In-hand inspection chooses circulation or retirement.",
      };
    case "rejected_retake":
      return {
        tone: "reject",
        badgeClass: "pill-reject",
        bandText: "Retake Required",
        title: "Retake Required (0–49)",
        buyInText: "Not Ready · Retake Flagged Angles",
        buyInClass: "pill-reject",
        goalText: "Photo coverage is incomplete. Retake the flagged angles before any intake decision.",
      };
    case "rejected_upcycle":
      return {
        tone: "reject",
        badgeClass: "pill-reject",
        bandText: "Declined — Upcycle Pathway",
        title: "Declined for Buy-In — Upcycle Pathway",
        buyInText: "Declined · Route to Upcycling",
        buyInClass: "pill-reject",
        goalText: "Declined for buy-in. Keep the materials in circulation and open the new-gear trade-in conversation.",
      };
    default: {
      const n = Number(scoreValue);
      if (Number.isFinite(n) && n >= state.settings.auto_approve_min) return decisionMeta("auto_approved");
      if (Number.isFinite(n) && n >= state.settings.human_review_min) return decisionMeta("human_review");
      return {
        tone: "neutral",
        badgeClass: "pill-neutral",
        bandText: "Pending",
        title: "Pending Evaluation",
        buyInText: "Not Scored Yet",
        buyInClass: "pill-neutral",
        goalText: "Finish photo coverage and damage disclosure before choosing buy-in, review, or upcycling.",
      };
    }
  }
}

function statusPillInfo(status) {
  switch (status) {
    case "created":
      return { label: "Waiting for Phone", cls: "pill-black" };
    case "capturing":
      return { label: "Capturing Photos", cls: "pill-review" };
    case "ready_to_score":
      return { label: "Ready to Score", cls: "pill-cream" };
    case "scored":
      return { label: "Scored", cls: "pill-approve" };
    default:
      return { label: capitalize(status || "Unknown"), cls: "pill-neutral" };
  }
}

// ============================================================================
// Flicker-Free 6-Angle Deck Initialization (Built ONCE — Never Rebuilt on Poll)
// ============================================================================

function initAngleDeck() {
  els.angleGrid.replaceChildren();
  state.angleCardNodes.clear();
  state.angleSignatures.clear();

  REQUIRED_ANGLES.forEach((angle) => {
    const meta = ANGLE_META[angle];

    const card = document.createElement("article");
    card.className = "angle-card";
    card.dataset.angle = angle;

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "angle-thumb-wrap";

    const placeholder = document.createElement("div");
    placeholder.className = "angle-placeholder";
    placeholder.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
      <span>Awaiting ${escapeHtml(angle)}</span>
    `;

    const thumbBtn = document.createElement("button");
    thumbBtn.type = "button";
    thumbBtn.className = "angle-thumb-btn hidden";
    thumbBtn.setAttribute("aria-label", `Inspect ${meta.title} full size`);

    const img = document.createElement("img");
    img.className = "angle-thumb-img";
    img.alt = `${meta.title} capture`;
    img.decoding = "async";
    thumbBtn.appendChild(img);

    thumbBtn.addEventListener("click", () => {
      openLightbox(
        thumbBtn.dataset.lightboxUrl || "",
        thumbBtn.dataset.lightboxTitle || meta.title,
        thumbBtn.dataset.lightboxSub || ""
      );
    });

    thumbWrap.appendChild(placeholder);
    thumbWrap.appendChild(thumbBtn);

    const body = document.createElement("div");
    body.className = "angle-body";

    const headerRow = document.createElement("div");
    headerRow.className = "row-between";

    const nameSpan = document.createElement("span");
    nameSpan.className = "angle-name";
    nameSpan.textContent = meta.title;

    const badgeSpan = document.createElement("span");
    badgeSpan.className = "pill pill-neutral";
    badgeSpan.textContent = "Pending";

    headerRow.appendChild(nameSpan);
    headerRow.appendChild(badgeSpan);

    const metaP = document.createElement("p");
    metaP.className = "angle-meta";
    metaP.textContent = meta.jacket;

    body.appendChild(headerRow);
    body.appendChild(metaP);

    card.appendChild(thumbWrap);
    card.appendChild(body);
    els.angleGrid.appendChild(card);

    state.angleCardNodes.set(angle, {
      card,
      placeholder,
      thumbBtn,
      img,
      badgeSpan,
      metaP,
    });
  });
}

function resetCaptureDeckSignatures() {
  state.angleSignatures.clear();
  state.defectSig = "";
  state.lastScoreSig = "";
}

function syncAngleDeck(photos, garment) {
  const requiredMap = new Map();
  const defectPhotos = [];

  (photos || []).forEach((p) => {
    const ang = String(p.angle || "").toLowerCase();
    if (ang === "defect") {
      defectPhotos.push(p);
    } else if (REQUIRED_ANGLES.includes(ang)) {
      requiredMap.set(ang, p);
    }
  });

  els.angleCountPill.textContent = `${requiredMap.size} / ${REQUIRED_ANGLES.length} captured`;

  REQUIRED_ANGLES.forEach((angle) => {
    const nodes = state.angleCardNodes.get(angle);
    if (!nodes) return;

    const meta = ANGLE_META[angle];
    const hint = garment === "pants" ? meta.pants : meta.jacket;
    const photo = requiredMap.get(angle) || null;

    const sig = photo
      ? `${photo.id}|${photo.filepath}|${photo.angle_ok}|${photo.clip_predicted_angle}|${photo.clip_confidence}|${garment}`
      : `empty|${garment}`;

    // Flicker-free guard: skip DOM mutation completely when signature is unchanged
    if (state.angleSignatures.get(angle) === sig) {
      return;
    }
    state.angleSignatures.set(angle, sig);

    if (!photo) {
      nodes.card.className = "angle-card";
      nodes.placeholder.classList.remove("hidden");
      nodes.thumbBtn.classList.add("hidden");
      nodes.img.removeAttribute("src");
      nodes.badgeSpan.className = "pill pill-neutral";
      nodes.badgeSpan.textContent = "Pending";
      nodes.metaP.textContent = hint;
      return;
    }

    const angleOk = Boolean(photo.angle_ok);
    const predicted = photo.predicted_angle || photo.clip_predicted_angle || angle;
    const sim = formatPct(photo.expected_similarity ?? photo.clip_confidence);
    const refs = Array.isArray(photo.matched_references)
      ? photo.matched_references
      : Array.isArray(photo.clip_matched_refs)
      ? photo.clip_matched_refs
      : [];
    const topRef = refs[0];
    const refLabel = topRef
      ? `Ref: ${topRef.item_id || "sample"} (${topRef.angle || angle})`
      : "";

    const subtitleText = !angleOk
      ? `OpenCLIP saw: ${predicted}${sim ? ` (${sim})` : ""}`
      : refLabel || hint;

    const photoUrl = photo.photo_url || "";
    const cacheBusted = photoUrl
      ? `${photoUrl}?v=${encodeURIComponent(photo.id || photo.created_at || "1")}`
      : "";

    nodes.card.className = `angle-card ${angleOk ? "is-verified" : "is-warn"}`;
    nodes.placeholder.classList.add("hidden");
    nodes.thumbBtn.classList.remove("hidden");
    if (nodes.img.getAttribute("src") !== cacheBusted) {
      nodes.img.src = cacheBusted;
    }
    nodes.thumbBtn.dataset.lightboxUrl = cacheBusted;
    nodes.thumbBtn.dataset.lightboxTitle = `${meta.title} (${angle})`;
    nodes.thumbBtn.dataset.lightboxSub = angleOk
      ? `Verified by OpenCLIP · ${subtitleText}`
      : subtitleText;

    nodes.badgeSpan.className = angleOk ? "pill pill-approve" : "pill pill-review";
    nodes.badgeSpan.textContent = angleOk ? `Verified${sim ? ` · ${sim}` : ""}` : "Check Angle";
    nodes.metaP.textContent = subtitleText;
  });

  // Signature-tracked defect strip
  const nextDefectSig = defectPhotos.map((d) => `${d.id}|${d.filepath}`).join(",");
  if (state.defectSig !== nextDefectSig) {
    state.defectSig = nextDefectSig;
    if (defectPhotos.length === 0) {
      els.defectSection.classList.add("hidden");
      els.defectStrip.replaceChildren();
    } else {
      els.defectSection.classList.remove("hidden");
      els.defectCountPill.textContent = `${defectPhotos.length} ${defectPhotos.length === 1 ? "shot" : "shots"}`;
      els.defectStrip.replaceChildren();
      defectPhotos.forEach((p, idx) => {
        const card = document.createElement("div");
        card.className = "defect-thumb-card";
        const url = p.photo_url || "";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "angle-thumb-btn";
        const img = document.createElement("img");
        img.src = url;
        img.alt = `Defect close-up ${idx + 1}`;
        img.loading = "lazy";
        btn.appendChild(img);
        btn.addEventListener("click", () => {
          openLightbox(url, `Defect Close-Up #${idx + 1}`, "Coin-scale close-up photo");
        });
        const cap = document.createElement("div");
        cap.className = "defect-thumb-caption";
        cap.textContent = `Defect #${idx + 1}`;
        card.appendChild(btn);
        card.appendChild(cap);
        els.defectStrip.appendChild(card);
      });
    }
  }
}

// ============================================================================
// Workspace Tabs & 3-Step Card-Deck Navigation
// ============================================================================

function switchTab(tabName) {
  state.activeTab = tabName;
  els.tabs.forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  Object.entries(els.panels).forEach(([key, panel]) => {
    panel.classList.toggle("hidden", key !== tabName);
  });

  syncPollingLifecycle();

  if (tabName === "queue") {
    loadReviewQueue();
  } else if (tabName === "log") {
    loadSessionsLog();
  } else if (tabName === "admin") {
    loadAdminPanel();
  }
}

function setWizardStep(step) {
  state.wizardStep = step;

  [1, 2, 3].forEach((n) => {
    const card = els.cards[n];
    const btn = els.wizSteps[n];
    const isActive = n === step;
    card.classList.toggle("hidden", !isActive);

    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-current", isActive ? "step" : "false");

    const hasSession = Boolean(state.sessionId);
    const hasScore = Boolean(state.lastStatus?.score || state.isScoring);
    btn.disabled = (n === 2 && !hasSession) || (n === 3 && (!hasSession || (!hasScore && n !== step)));
    btn.classList.toggle("is-complete", (n === 1 && hasSession && step > 1) || (n === 2 && hasScore && step > 2));
  });

  syncPollingLifecycle();
}

function resetToCategoryCard() {
  stopPolling();
  state.sessionId = null;
  state.captureUrl = "";
  state.qrDataUrl = "";
  state.lastStatus = null;
  state.isScoring = false;
  state.disclosureDirty = false;
  state.counterCrash = false;
  state.auditTracePayload = null;
  resetCaptureDeckSignatures();
  syncAngleDeck([], "jacket");
  setWizardStep(1);
}

// ============================================================================
// Smart Polling Lifecycle (Stops on "scored", off Step 2, or Manual Mode)
// ============================================================================

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
  els.pollingIndicator.classList.add("hidden");
}

function shouldPollNow() {
  if (state.activeTab !== "intake") return false;
  if (state.wizardStep !== 2) return false;
  if (!state.sessionId) return false;
  if (state.isScoring) return false;
  if (state.lastStatus?.status === "scored") return false;
  if (Number(state.settings.poll_interval_ms) <= 0) return false;
  return true;
}

function syncPollingLifecycle() {
  if (!shouldPollNow()) {
    stopPolling();
    if (
      state.activeTab === "intake" &&
      state.wizardStep === 2 &&
      state.sessionId &&
      Number(state.settings.poll_interval_ms) <= 0
    ) {
      els.pollingIndicator.classList.remove("hidden");
      els.pollingLabel.textContent = "Manual Poll";
    }
    return;
  }

  const intervalMs = Math.max(500, Number(state.settings.poll_interval_ms) || 2000);
  stopPolling();
  els.pollingIndicator.classList.remove("hidden");
  els.pollingLabel.textContent = `Live · ${(intervalMs / 1000).toFixed(1)}s`;
  state.pollTimer = setInterval(() => {
    pollSessionStatus();
  }, intervalMs);
}

// ============================================================================
// Card 1 Actions: Start Session / Quick Local Sample
// ============================================================================

async function startNewCategorySession(garmentType) {
  els.pickJacketBtn.disabled = true;
  els.pickPantsBtn.disabled = true;

  try {
    const res = await apiJson("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ garment_type: garmentType }),
    });

    openSessionInStep(res.session_id, {
      step: 2,
      garmentType: res.garment_type || garmentType,
      captureUrl: res.capture_url,
      qrDataUrl: res.qr_data_url,
    });
    showToast(`Session ${res.session_id} created. Scan the QR code on a phone to capture photos.`, "success");
    await pollSessionStatus();
    loadSessionsLog({ silent: true });
  } catch (err) {
    showToast(`Could not start session: ${err.message}`, "error", 6000);
  } finally {
    els.pickJacketBtn.disabled = false;
    els.pickPantsBtn.disabled = false;
  }
}

function openSessionInStep(
  sessionId,
  { step = 2, garmentType = "jacket", captureUrl = "", qrDataUrl = "" } = {}
) {
  stopPolling();
  state.sessionId = sessionId;
  state.garmentType = garmentType;
  state.captureUrl = captureUrl || `${window.location.origin}/capture/${sessionId}`;
  state.qrDataUrl = qrDataUrl || "";
  state.lastStatus = null;
  state.disclosureDirty = false;
  state.counterCrash = false;
  resetCaptureDeckSignatures();
  syncCounterDisclosureInputs({ crash: false, usage: "moderate", notes: "" });

  els.captureSessionTitle.textContent = `Session ${sessionId}`;
  els.captureGarmentPill.textContent = capitalize(garmentType);
  els.auditSessionTitle.textContent = `Session ${sessionId}`;
  els.auditGarmentPill.textContent = capitalize(garmentType);
  els.btnExportXlsx.href = `/export/${encodeURIComponent(sessionId)}.xlsx`;

  els.captureUrlInput.value = state.captureUrl;
  els.linkOpenCapture.href = state.captureUrl;

  if (state.qrDataUrl) {
    els.qrImage.src = state.qrDataUrl;
    els.qrFrameBox.classList.remove("hidden");
  } else {
    els.qrImage.removeAttribute("src");
    els.qrFrameBox.classList.add("hidden");
  }

  syncAngleDeck([], garmentType);
  switchTab("intake");
  setWizardStep(step);
}

async function loadLocalSampleAndOpen({
  itemId,
  garmentType = "jacket",
  disclosure = null,
  autoScoreAndOpenAudit = true,
  triggerBtn = null,
}) {
  if (!itemId) {
    showToast("Select a local sample folder first.", "warn");
    return;
  }

  const origLabel = triggerBtn ? triggerBtn.textContent : "";
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.innerHTML = `<span class="spinner" aria-hidden="true"></span> Loading…`;
  }

  try {
    const payload = { item_id: itemId, garment_type: garmentType };
    if (disclosure) payload.disclosure = disclosure;

    const res = await apiJson("/demo/load-sample", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const targetStep = autoScoreAndOpenAudit ? 3 : 2;
    openSessionInStep(res.session_id, {
      step: targetStep,
      garmentType: res.garment_type || garmentType,
      captureUrl: `${window.location.origin}/capture/${res.session_id}`,
      qrDataUrl: "",
    });

    if (autoScoreAndOpenAudit) {
      state.autoScoredSessions.add(res.session_id);
      await pollSessionStatus({ skipAutoScore: true });
      await triggerScore(res.session_id, { useCounterDisclosure: false });
    } else {
      await pollSessionStatus();
    }
    loadSessionsLog({ silent: true });
  } catch (err) {
    showToast(`Failed to load sample ${itemId}: ${err.message}`, "error", 6500);
  } finally {
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.textContent = origLabel;
    }
  }
}

// ============================================================================
// Card 2: Polling & Capture Status Sync
// ============================================================================

function updateDisclosureSummaryPill() {
  const usageLabel = capitalize(els.counterUsageSelect.value || "moderate");
  if (state.counterCrash) {
    els.disclosureSummaryPill.className = "pill pill-reject";
    els.disclosureSummaryPill.textContent = `Crash Disclosed · ${usageLabel}`;
  } else {
    els.disclosureSummaryPill.className = "pill pill-neutral";
    els.disclosureSummaryPill.textContent = `No Crash · ${usageLabel}`;
  }
}

function syncCounterDisclosureInputs(disclosure) {
  const d = disclosure || {};
  state.counterCrash = Boolean(d.crash);

  els.counterCrashBtns.forEach((btn) => {
    const val = btn.dataset.counterCrash === "true";
    const isSelected = val === state.counterCrash;
    btn.classList.toggle("is-selected", isSelected && !val);
    btn.classList.toggle("is-selected-danger", isSelected && val);
    btn.setAttribute("aria-pressed", String(isSelected));
  });

  const usage = String(d.usage || d.exposure_band || "moderate").toLowerCase();
  els.counterUsageSelect.value = ["light", "moderate", "heavy"].includes(usage) ? usage : "moderate";
  els.counterNotesInput.value = d.notes || "";
  updateDisclosureSummaryPill();
}

function getCounterDisclosurePayload() {
  const usage = els.counterUsageSelect.value || "moderate";
  return {
    crash: state.counterCrash,
    usage,
    exposure_band: usage,
    notes: els.counterNotesInput.value.trim(),
  };
}

async function pollSessionStatus({ skipAutoScore = false } = {}) {
  if (!state.sessionId) return;
  const activeId = state.sessionId;

  try {
    const data = await apiJson(`/status/${encodeURIComponent(activeId)}`);
    if (state.sessionId !== activeId) return;

    state.lastStatus = data;
    state.garmentType = data.garment_type || state.garmentType;
    renderCaptureState(data);

    // Stop polling immediately once scored
    if (data.status === "scored") {
      stopPolling();
      if (data.score) {
        renderAuditDossier(data.score);
      }
      setWizardStep(state.wizardStep);
      return;
    }

    // Auto-score & advance to Card 3 when phone completes capture (if enabled in Admin settings)
    const isReady = data.status === "ready_to_score" || Boolean(data.ready_to_score);
    if (
      !skipAutoScore &&
      state.settings.auto_score_on_complete &&
      isReady &&
      !data.score &&
      !state.isScoring &&
      !state.autoScoredSessions.has(activeId) &&
      Array.isArray(data.photos) &&
      data.photos.length > 0
    ) {
      state.autoScoredSessions.add(activeId);
      setWizardStep(3);
      await triggerScore(activeId, { useCounterDisclosure: false });
    }
  } catch (err) {
    console.warn("Session poll warning:", err);
  }
}

function renderCaptureState(data) {
  const garment = data.garment_type || "jacket";
  els.captureGarmentPill.textContent = capitalize(garment);
  els.auditGarmentPill.textContent = capitalize(garment);

  const st = statusPillInfo(data.status);
  els.captureStatusPill.className = `pill ${st.cls}`;
  els.captureStatusPill.textContent = state.isScoring ? "Scoring…" : st.label;

  const photos = Array.isArray(data.photos) ? data.photos : [];
  syncAngleDeck(photos, garment);

  if (!state.disclosureDirty && data.disclosure) {
    syncCounterDisclosureInputs(data.disclosure);
  }

  els.btnContinueAudit.disabled = photos.length === 0 || state.isScoring;
  if (data.score) {
    els.btnContinueAudit.textContent = "Open Audit Dossier →";
    els.captureReadyHint.textContent = "Scored — open Card 3 to review results or re-score.";
  } else if (data.status === "ready_to_score") {
    els.btnContinueAudit.textContent = "Run Audit & Score →";
    els.captureReadyHint.textContent = "Mobile capture finished — ready to run verification audit.";
  } else if (photos.length > 0) {
    els.btnContinueAudit.textContent = "Continue to Audit →";
    els.captureReadyHint.textContent = `${photos.length} photo${photos.length === 1 ? "" : "s"} received — finish on phone or continue now.`;
  } else {
    els.btnContinueAudit.textContent = "Continue to Audit →";
    els.captureReadyHint.textContent = "Waiting for mobile uploads…";
  }

  if (data.score && !state.isScoring) {
    renderAuditDossier(data.score);
  }
}

// ============================================================================
// Card 3: Scoring, Audit Dossier & Frontier Agent Trace
// ============================================================================

async function triggerScore(sessionId, { useCounterDisclosure = true } = {}) {
  if (!sessionId || state.isScoring) return;
  stopPolling();
  state.isScoring = true;
  setWizardStep(3);

  els.scoreReport.classList.add("hidden");
  els.scoreLoading.classList.remove("hidden");
  els.scoreLoadingDetail.textContent = `Invoking ${state.settings.vision_deployment || "gpt-4.1"} rubric inspection & deterministic 0–100 scoring…`;
  els.btnAuditRescore.disabled = true;

  try {
    const body = { session_id: sessionId };
    if (useCounterDisclosure) {
      body.disclosure = getCounterDisclosurePayload();
    }
    const result = await apiJson("/score", {
      method: "POST",
      headers: buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });

    state.disclosureDirty = false;
    state.isScoring = false;
    state.lastScoreSig = ""; // force render new result
    if (state.lastStatus) {
      state.lastStatus.status = "scored";
      state.lastStatus.score = result;
    } else {
      state.lastStatus = { session_id: sessionId, status: "scored", score: result };
    }

    renderAuditDossier(result);
    setWizardStep(3);
    showToast(
      `Photo Coverage + Damage Disclosure Score ready: ${result.total_score}/100 (${result.decision_label || result.decision}).`,
      result.decision === "auto_approved" ? "success" : result.decision === "human_review" ? "warn" : "error"
    );

    loadReviewQueue({ silent: true });
    loadSessionsLog({ silent: true });
    loadPublicConfig();
  } catch (err) {
    state.isScoring = false;
    els.scoreLoading.classList.add("hidden");
    if (state.lastStatus?.score) {
      els.scoreReport.classList.remove("hidden");
    }
    showToast(`Scoring failed: ${err.message}`, "error", 7000);
  } finally {
    els.btnAuditRescore.disabled = false;
  }
}

function renderAuditDossier(score) {
  if (!score) return;

  const scoreSig = `${score.session_id || state.sessionId}|${score.total_score}|${score.decision}|${score.updated_at || ""}|${score.agent_trace?.latency_ms || ""}`;
  if (state.lastScoreSig === scoreSig && !els.scoreReport.classList.contains("hidden")) {
    return;
  }
  state.lastScoreSig = scoreSig;

  els.scoreLoading.classList.add("hidden");
  els.scoreReport.classList.remove("hidden");

  const total = Math.max(0, Math.min(100, Number(score.total_score ?? 0)));
  const coverage = Math.max(0, Math.min(50, Number(score.photo_coverage_score ?? 0)));
  const damage = Math.max(0, Math.min(50, Number(score.damage_disclosure_score ?? 0)));
  const meta = decisionMeta(score.decision, total);

  // Brand pill on Audit header
  const brand = score.extracted_labels?.brand;
  if (brand && brand.toLowerCase() !== "unknown") {
    els.auditBrandPill.textContent = brand;
    els.auditBrandPill.classList.remove("hidden");
  } else {
    els.auditBrandPill.classList.add("hidden");
  }

  // Decision Banner
  els.decisionBanner.className = `decision-banner is-${meta.tone}`;
  els.decisionBandPill.className = `pill ${meta.badgeClass}`;
  els.decisionBandPill.textContent = meta.bandText;
  els.buyinStatusPill.className = `pill ${meta.buyInClass}`;
  els.buyinStatusPill.textContent = meta.buyInText;
  els.decisionTitle.textContent = score.decision_label || meta.title;
  els.decisionSummary.textContent = score.summary || "";
  els.decisionGoal.textContent = meta.goalText || "";

  // Radial Gauge
  const circumference = 2 * Math.PI * 50;
  const offset = circumference * (1 - total / 100);
  const strokeColor =
    meta.tone === "approve"
      ? "var(--status-approve)"
      : meta.tone === "review"
      ? "var(--status-review)"
      : "var(--status-reject)";

  els.gaugeCircle.style.strokeDasharray = `${circumference.toFixed(2)}`;
  els.gaugeCircle.style.strokeDashoffset = `${offset.toFixed(2)}`;
  els.gaugeCircle.style.stroke = strokeColor;
  els.scoreTotal.textContent = String(total);
  els.gaugeA11y.setAttribute(
    "aria-label",
    `Photo Coverage plus Damage Disclosure Score: ${total} out of 100`
  );

  // Subscore Bars
  els.scoreCoverageText.textContent = `${coverage} / 50`;
  els.scoreCoverageBar.style.width = `${(coverage / 50) * 100}%`;
  els.scoreCoverageBar.className = `progress-fill is-${coverage >= 40 ? "approve" : coverage >= 25 ? "review" : "reject"}`;

  els.scoreDamageText.textContent = `${damage} / 50`;
  els.scoreDamageBar.style.width = `${(damage / 50) * 100}%`;
  els.scoreDamageBar.className = `progress-fill is-${damage >= 40 ? "approve" : damage >= 25 ? "review" : "reject"}`;

  // Documentation status pill
  const protStatus = String(score.protection_disclosure_status || "unknown").toLowerCase();
  if (protStatus === "confirmed") {
    els.protectionDisclosurePill.className = "pill pill-approve";
    els.protectionDisclosurePill.textContent = "Confirmed (Documented)";
  } else if (protStatus === "reduced") {
    els.protectionDisclosurePill.className = "pill pill-reject";
    els.protectionDisclosurePill.textContent = "Reduced (Flagged)";
  } else {
    els.protectionDisclosurePill.className = "pill pill-neutral";
    els.protectionDisclosurePill.textContent = "Unknown (Normal on older gear)";
  }

  // Hard Gate Banner
  const hardGateReasons = Array.isArray(score.hard_gate_reasons) ? score.hard_gate_reasons : [];
  if (score.hard_gate_triggered && hardGateReasons.length > 0) {
    els.hardGateBox.classList.remove("hidden");
    els.hardGateList.innerHTML = hardGateReasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("");
  } else {
    els.hardGateBox.classList.add("hidden");
    els.hardGateList.replaceChildren();
  }

  // Contradiction Alert
  if (score.contradiction_flagged) {
    els.contradictionBox.classList.remove("hidden");
    els.contradictionReason.textContent =
      score.contradiction_reason ||
      "Declared rider history contradicts visible photo evidence. Inspect carefully in hand.";
  } else {
    els.contradictionBox.classList.add("hidden");
  }

  // Retake Banner
  const retakeAngles = Array.isArray(score.retake_angles) ? score.retake_angles : [];
  if (score.decision === "rejected_retake" && retakeAngles.length > 0) {
    els.retakeBox.classList.remove("hidden");
    els.retakeAnglesText.textContent = `Retake clearer photos for: ${retakeAngles
      .map((a) => ANGLE_META[a]?.title || capitalize(a))
      .join(", ")}.`;
  } else {
    els.retakeBox.classList.add("hidden");
  }

  // Circular Upcycling Card
  const upcycle = score.upcycle_plan;
  if (upcycle && typeof upcycle === "object") {
    els.upcycleCard.classList.remove("hidden");
    const matLabel = String(upcycle.material_group || score.extracted_labels?.material_group || "mixed")
      .replace(/_/g, " / ");
    els.upcycleMaterialPill.textContent = `Material: ${capitalize(matLabel)}`;
    els.upcycleHeadline.textContent =
      upcycle.headline || "Declined for Buy-In — Route to Circular Upcycling & Trade-In";
    els.upcycleSummary.textContent = upcycle.summary || "";

    const pathways = Array.isArray(upcycle.pathways)
      ? upcycle.pathways
      : Array.isArray(upcycle.recovery_pathways)
      ? upcycle.recovery_pathways
      : [];
    els.upcyclePathways.innerHTML = pathways.map((step) => `<li>${escapeHtml(step)}</li>`).join("");

    const tradeInMsg =
      upcycle.trade_in_note ||
      upcycle.trade_in_conversation ||
      "Start an in-store gear consultation with Moto Reloaded staff to retire this garment responsibly and explore trade-in options toward new riding gear.";
    els.upcycleTradein.innerHTML = `
      <strong>In-Store Responsible Retirement &amp; New-Gear Trade-In</strong>
      ${escapeHtml(tradeInMsg)}
    `;
    els.upcycleClerkStep.textContent = upcycle.next_step_for_clerk
      ? `Store Staff Next Step: ${upcycle.next_step_for_clerk}`
      : "";
  } else {
    els.upcycleCard.classList.add("hidden");
  }

  // Extracted Labels Strip (North America CE neutrality)
  const labels = score.extracted_labels || {};
  const ceVal = String(labels.ce_label || "none").trim();
  const isCeNone = ceVal.toLowerCase() === "none" || ceVal === "";
  const ceDisplay = isCeNone ? "None shown" : `EN 17092 Class ${ceVal}`;
  const ceNote = isCeNone
    ? labels.ce_note || "Normal in North America — zero penalty."
    : "Documentation label observed.";
  const matGroup = String(labels.material_group || "unknown").replace(/_/g, " / ");

  els.labelsGrid.innerHTML = `
    <div class="label-tile">
      <span class="label-tile-key">Brand</span>
      <span class="label-tile-val">${escapeHtml(labels.brand || "Unknown")}</span>
    </div>
    <div class="label-tile">
      <span class="label-tile-key">Size</span>
      <span class="label-tile-val">${escapeHtml(labels.size || "Unknown")}</span>
    </div>
    <div class="label-tile">
      <span class="label-tile-key">CE EN 17092</span>
      <span class="label-tile-val">${escapeHtml(ceDisplay)}</span>
      <span class="label-tile-note">${escapeHtml(ceNote)}</span>
    </div>
    <div class="label-tile">
      <span class="label-tile-key">Fibre (${escapeHtml(capitalize(matGroup))})</span>
      <span class="label-tile-val">${escapeHtml(labels.composition || "Not determinable")}</span>
    </div>
  `;

  // Checklist Table
  const checklist = Array.isArray(score.checklist) ? score.checklist : [];
  const passedCount = checklist.filter((item) => item.passed).length;
  els.checklistSummaryPill.textContent = `${passedCount} / ${checklist.length} passed`;

  if (checklist.length === 0) {
    els.checklistTbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center;color:var(--fg-muted);">No checklist items recorded.</td>
      </tr>
    `;
  } else {
    els.checklistTbody.innerHTML = checklist
      .map((item) => {
        const passPill = item.passed
          ? `<span class="pill pill-approve">Pass</span>`
          : `<span class="pill pill-reject">Fail</span>`;

        const sev = String(item.severity || "none").toLowerCase();
        let sevPill = `<span class="pill pill-neutral">None</span>`;
        if (sev === "minor") sevPill = `<span class="pill pill-review">Minor</span>`;
        else if (sev === "major") sevPill = `<span class="pill pill-reject">Major</span>`;
        else if (sev === "hard_gate") sevPill = `<span class="pill pill-reject">Hard Gate</span>`;

        const catLabel =
          item.category === "photo_coverage" ? "Photo Coverage" : "Damage Disclosure";

        return `
          <tr>
            <td>${passPill}</td>
            <td>
              <span class="check-item-label">${escapeHtml(item.label || item.key)}</span>
              <span class="check-item-cat">${escapeHtml(catLabel)}</span>
            </td>
            <td>${sevPill}</td>
            <td>${escapeHtml(item.reason || "—")}</td>
          </tr>
        `;
      })
      .join("");
  }

  // Frontier Agent Output & Prompt Trace Card
  renderAuditAgentTrace(score.agent_trace);

  // Inline Staff Review buttons if decision is human_review
  if (score.decision === "human_review") {
    els.auditInlineReview.classList.remove("hidden");
  } else {
    els.auditInlineReview.classList.add("hidden");
  }

  els.scoreDisclaimer.textContent =
    score.disclaimer ||
    "Photo coverage and damage disclosure check only. Moto Reloaded and this tool do not assess, certify, test, or guarantee protective performance.";
}

function buildTraceStatsHtml(trace) {
  const usage = trace.usage || {};
  const promptTok = usage.prompt_tokens ?? "—";
  const compTok = usage.completion_tokens ?? "—";
  const totalTok = usage.total_tokens ?? "—";
  const latency = trace.latency_ms !== null && trace.latency_ms !== undefined ? `${trace.latency_ms} ms` : "—";

  return `
    <div class="trace-stat">
      <span class="trace-stat-key">Agent</span>
      <span class="trace-stat-val">${escapeHtml(trace.agent_label || "Vision Rubric Agent")}</span>
    </div>
    <div class="trace-stat">
      <span class="trace-stat-key">Provider &amp; Deployment</span>
      <span class="trace-stat-val">${escapeHtml(trace.provider || "Azure OpenAI")} · ${escapeHtml(trace.deployment || "—")}</span>
    </div>
    <div class="trace-stat">
      <span class="trace-stat-key">Model Returned</span>
      <span class="trace-stat-val mono">${escapeHtml(trace.model_returned || trace.deployment || "—")}</span>
    </div>
    <div class="trace-stat">
      <span class="trace-stat-key">Latency</span>
      <span class="trace-stat-val tabular">${escapeHtml(latency)}</span>
    </div>
    <div class="trace-stat">
      <span class="trace-stat-key">Tokens (P / C / Total)</span>
      <span class="trace-stat-val tabular">${escapeHtml(`${promptTok} / ${compTok} / ${totalTok}`)}</span>
    </div>
    <div class="trace-stat">
      <span class="trace-stat-key">Stage-1 OpenCLIP</span>
      <span class="trace-stat-val">${escapeHtml(trace.clip_stage1_model || "OpenCLIP ViT-B-32 (frozen)")}</span>
    </div>
  `;
}

function renderAuditAgentTrace(trace) {
  if (!trace || typeof trace !== "object") {
    state.auditTracePayload = null;
    els.auditTraceHeading.textContent = "Frontier Trace Unavailable";
    els.auditTraceProviderPill.textContent = "No Trace";
    els.auditTraceStats.innerHTML = `
      <div class="trace-stat" style="grid-column: 1 / -1;">
        <span class="trace-stat-key">Info</span>
        <span class="trace-stat-val">Re-score this session to capture full Frontier Agent prompt &amp; JSON trace.</span>
      </div>
    `;
    els.auditTraceSystem.textContent = "No system prompt captured for this record.";
    els.auditTraceUser.textContent = "No user prompt captured for this record.";
    els.auditTraceRaw.textContent = "{}";
    return;
  }

  state.auditTracePayload = trace;
  els.auditTraceHeading.textContent = trace.agent_label || "Azure OpenAI Vision Rubric Agent";
  els.auditTraceProviderPill.textContent = `${trace.provider || "Azure OpenAI"} · ${trace.deployment || "gpt-4.1"}`;
  els.auditTraceStats.innerHTML = buildTraceStatsHtml(trace);
  els.auditTraceSystem.textContent = trace.system_prompt || "(Not provided)";
  els.auditTraceUser.textContent = trace.user_prompt || "(Not provided)";
  els.auditTraceRaw.textContent = prettyJsonText(trace.raw_response);
}

// ============================================================================
// Workspace 2: Review Queue
// ============================================================================

async function loadReviewQueue({ silent = false } = {}) {
  try {
    const data = await apiJson("/review-queue");
    const items = Array.isArray(data?.items) ? data.items : [];
    state.queueItems = items;

    const pendingCount = items.filter((i) => (i.review_status || i.status) === "pending").length;
    els.queueBadge.textContent = String(pendingCount);
    els.queueBadge.classList.toggle("is-warn", pendingCount > 0);

    if (state.activeTab === "queue" || !silent) {
      renderReviewQueue();
    }
  } catch (err) {
    if (!silent) showToast(`Could not load review queue: ${err.message}`, "error");
  }
}

function renderReviewQueue() {
  const filtered = state.queueItems.filter((item) => {
    if (state.queueFilter === "all") return true;
    const status = item.review_status || item.status || "pending";
    return status === state.queueFilter;
  });

  if (filtered.length === 0) {
    els.queueList.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3>No items in this review view</h3>
        <p style="font-size: 0.88rem;">
          Sessions scoring in the human-review band automatically appear here for in-hand store staff inspection.
        </p>
      </div>
    `;
    return;
  }

  els.queueList.innerHTML = filtered
    .map((item) => {
      const reviewStatus = item.review_status || item.status || "pending";
      const statusBadge =
        reviewStatus === "approved"
          ? `<span class="pill pill-approve">Approved In-Hand</span>`
          : reviewStatus === "declined_upcycle"
          ? `<span class="pill pill-reject">Declined → Upcycle</span>`
          : `<span class="pill pill-review">Pending Staff Review</span>`;

      const scoreObj = item.score || {};
      const failedItems = Array.isArray(scoreObj.checklist)
        ? scoreObj.checklist.filter((c) => !c.passed)
        : [];
      const brand = scoreObj.extracted_labels?.brand || "Unidentified brand";

      const failedHtml =
        failedItems.length > 0
          ? `<ul class="alert-list">${failedItems
              .slice(0, 4)
              .map(
                (f) =>
                  `<li><strong>${escapeHtml(f.label)}:</strong> ${escapeHtml(f.reason || f.severity)}</li>`
              )
              .join("")}</ul>`
          : `<p style="font-size: 0.84rem; color: var(--fg-muted);">${escapeHtml(
              scoreObj.summary || "Queued for in-hand confirmation."
            )}</p>`;

      return `
        <article class="queue-card ${reviewStatus === "pending" ? "is-pending" : ""}">
          <div class="row-between">
            <div class="row-wrap">
              <span class="pill pill-black mono">${escapeHtml(item.session_id)}</span>
              <span class="pill pill-neutral">${escapeHtml(capitalize(item.garment_type || "jacket"))}</span>
            </div>
            ${statusBadge}
          </div>

          <div class="row-between">
            <div>
              <strong style="font-size: 1rem;">${escapeHtml(brand)}</strong>
              <div style="font-size: 0.78rem; color: var(--fg-muted);">
                Queued ${escapeHtml(formatDate(item.queued_at || item.updated_at))}
              </div>
            </div>
            <div style="text-align: right;">
              <div class="tabular" style="font-size: 1.35rem; font-weight: 700; color: var(--status-review);">
                ${escapeHtml(item.total_score ?? 0)} / 100
              </div>
              <div class="tabular" style="font-size: 0.75rem; color: var(--fg-muted);">
                Cov ${escapeHtml(item.photo_coverage_score ?? 0)}/50 · Discl ${escapeHtml(item.damage_disclosure_score ?? 0)}/50
              </div>
            </div>
          </div>

          <div>
            <span class="field-label">Flagged for In-Hand Check</span>
            ${failedHtml}
          </div>

          <div>
            <label class="field-label" for="notes-${escapeHtml(item.session_id)}">Staff Inspection Notes</label>
            <textarea
              id="notes-${escapeHtml(item.session_id)}"
              class="textarea"
              rows="2"
              placeholder="Record physical stitching, zipper, odor, or lining findings…"
            >${escapeHtml(item.staff_notes || "")}</textarea>
          </div>

          <div class="row-wrap">
            <button
              type="button"
              class="btn btn-approve btn-sm"
              data-review-action="approved"
              data-session-id="${escapeHtml(item.session_id)}"
            >
              Approve In-Hand
            </button>
            <button
              type="button"
              class="btn btn-danger btn-sm"
              data-review-action="declined_upcycle"
              data-session-id="${escapeHtml(item.session_id)}"
            >
              Decline → Upcycle
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              data-open-audit="${escapeHtml(item.session_id)}"
              data-open-garment="${escapeHtml(item.garment_type || "jacket")}"
            >
              Open Audit Card →
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  els.queueList.querySelectorAll("[data-review-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sid = btn.dataset.sessionId;
      const nextStatus = btn.dataset.reviewAction;
      const notesEl = document.getElementById(`notes-${sid}`);
      const staffNotes = notesEl ? notesEl.value.trim() : "";

      btn.disabled = true;
      try {
        await submitReviewResolution(sid, nextStatus, staffNotes);
        await loadReviewQueue();
      } catch (err) {
        showToast(`Could not update review item: ${err.message}`, "error");
        btn.disabled = false;
      }
    });
  });

  els.queueList.querySelectorAll("[data-open-audit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openExistingSessionInAudit(btn.dataset.openAudit, btn.dataset.openGarment);
    });
  });
}

async function submitReviewResolution(sessionId, status, staffNotes) {
  await apiJson(`/review-queue/${encodeURIComponent(sessionId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, staff_notes: staffNotes }),
  });
  showToast(
    status === "approved"
      ? `Session ${sessionId} marked Approved In-Hand.`
      : `Session ${sessionId} declined for buy-in and routed to Upcycling.`,
    status === "approved" ? "success" : "warn"
  );
}

// ============================================================================
// Workspace 3: Intake Ledger
// ============================================================================

async function loadSessionsLog({ silent = false } = {}) {
  try {
    const data = await apiJson("/sessions");
    const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
    state.sessions = sessions;
    els.logBadge.textContent = String(sessions.length);

    if (state.activeTab === "log" || !silent) {
      renderSessionsLog();
    }
  } catch (err) {
    if (!silent) showToast(`Could not load intake ledger: ${err.message}`, "error");
  }
}

function renderSessionsLog() {
  if (state.sessions.length === 0) {
    els.logTbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding: 1.5rem; color: var(--fg-muted);">
          No intake records yet. Start a new intake from Card 1 or run a sample in Admin &amp; Debug.
        </td>
      </tr>
    `;
    return;
  }

  els.logTbody.innerHTML = state.sessions
    .map((s) => {
      const dec = s.decision ? decisionMeta(s.decision, s.total_score) : null;
      const scoreCell =
        s.total_score !== null && s.total_score !== undefined
          ? `<strong class="tabular">${escapeHtml(s.total_score)} / 100</strong>`
          : `<span style="color:var(--fg-muted);">—</span>`;
      const decisionCell = dec
        ? `<span class="pill ${dec.badgeClass}">${escapeHtml(dec.bandText)}</span>`
        : `<span class="pill pill-neutral">${escapeHtml(statusPillInfo(s.status).label)}</span>`;
      const brandRef = s.brand || s.disclosure?.source_item_id || "—";

      return `
        <tr class="is-clickable" data-log-session="${escapeHtml(s.session_id)}" data-log-garment="${escapeHtml(s.garment_type || "jacket")}" data-log-scored="${s.status === "scored" ? "true" : "false"}">
          <td class="mono" style="font-weight: 700; color: var(--fg-primary);">${escapeHtml(s.session_id)}</td>
          <td>${escapeHtml(capitalize(s.garment_type || "jacket"))}</td>
          <td>${escapeHtml(brandRef)}</td>
          <td class="tabular">${escapeHtml(s.photo_count ?? 0)}</td>
          <td>${scoreCell}</td>
          <td>${decisionCell}</td>
          <td style="white-space: nowrap;">${escapeHtml(formatDate(s.updated_at || s.created_at))}</td>
          <td>
            <div class="row-wrap" style="gap: 0.4rem;">
              <button type="button" class="btn btn-primary btn-sm" data-ledger-audit="${escapeHtml(s.session_id)}">Audit</button>
              <a
                href="/export/${encodeURIComponent(s.session_id)}.xlsx"
                download
                class="btn btn-secondary btn-sm"
                data-ledger-export="true"
              >
                .xlsx
              </a>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  els.logTbody.querySelectorAll("[data-log-session]").forEach((row) => {
    row.addEventListener("click", (evt) => {
      if (evt.target.closest("[data-ledger-export]")) return;
      const isScored = row.dataset.logScored === "true";
      if (isScored) {
        openExistingSessionInAudit(row.dataset.logSession, row.dataset.logGarment);
      } else {
        openExistingSessionInCapture(row.dataset.logSession, row.dataset.logGarment);
      }
    });
  });
}

async function openExistingSessionInAudit(sessionId, garmentType = "jacket") {
  state.autoScoredSessions.add(sessionId);
  openSessionInStep(sessionId, {
    step: 3,
    garmentType,
    captureUrl: `${window.location.origin}/capture/${sessionId}`,
    qrDataUrl: "",
  });
  await pollSessionStatus({ skipAutoScore: true });
  if (!state.lastStatus?.score) {
    setWizardStep(2);
  }
}

async function openExistingSessionInCapture(sessionId, garmentType = "jacket") {
  state.autoScoredSessions.add(sessionId);
  openSessionInStep(sessionId, {
    step: 2,
    garmentType,
    captureUrl: `${window.location.origin}/capture/${sessionId}`,
    qrDataUrl: "",
  });
  await pollSessionStatus({ skipAutoScore: true });
}

// ============================================================================
// Workspace 4: Admin & Debug (Settings, Diagnostics, Sandbox, Latest Trace)
// ============================================================================

async function loadRuntimeSettings({ silent = true } = {}) {
  try {
    const data = await apiJson("/admin/settings");
    if (data?.settings) {
      state.settings = { ...DEFAULT_RUNTIME_SETTINGS, ...data.settings };
    }
    if (Array.isArray(data?.available_deployments) && data.available_deployments.length > 0) {
      state.availableDeployments = data.available_deployments;
    }
    applySettingsToUi();
  } catch (err) {
    if (!silent) showToast(`Could not load runtime settings: ${err.message}`, "error");
  }
}

function applySettingsToUi() {
  const s = state.settings;
  els.headerModelPill.textContent = `${s.vision_deployment || "gpt-4.1"} · Inference-Only`;

  // Populate deployment select
  els.setDeployment.innerHTML = state.availableDeployments
    .map((dep) => `<option value="${escapeHtml(dep)}">${escapeHtml(dep)}</option>`)
    .join("");
  els.setDeployment.value = s.vision_deployment || "gpt-4.1";

  // Poll interval select (add custom option if persisted value isn't in standard presets)
  const pollVal = String(s.poll_interval_ms ?? 2000);
  if (!Array.from(els.setPollInterval.options).some((opt) => opt.value === pollVal)) {
    const opt = document.createElement("option");
    opt.value = pollVal;
    opt.textContent = `${pollVal} ms (Custom)`;
    els.setPollInterval.appendChild(opt);
  }
  els.setPollInterval.value = pollVal;

  els.setTemperature.value = String(s.temperature ?? 0.1);
  els.setMaxTokens.value = String(s.max_tokens ?? 1800);
  els.setClipThreshold.value = String(s.clip_warn_threshold ?? 0.22);
  els.setPublicUrl.value = s.public_base_url || "";
  els.setAutoApproveMin.value = String(s.auto_approve_min ?? 85);
  els.setHumanReviewMin.value = String(s.human_review_min ?? 50);
  els.setAutoScore.checked = Boolean(s.auto_score_on_complete);

  syncPollingLifecycle();
}

async function handleSaveSettings(evt) {
  evt.preventDefault();
  els.btnSaveSettings.disabled = true;
  els.btnSaveSettings.textContent = "Saving…";

  try {
    const payload = {
      vision_deployment: els.setDeployment.value,
      poll_interval_ms: Number(els.setPollInterval.value),
      temperature: Number(els.setTemperature.value),
      max_tokens: Number(els.setMaxTokens.value),
      clip_warn_threshold: Number(els.setClipThreshold.value),
      public_base_url: els.setPublicUrl.value.trim(),
      auto_approve_min: Number(els.setAutoApproveMin.value),
      human_review_min: Number(els.setHumanReviewMin.value),
      auto_score_on_complete: Boolean(els.setAutoScore.checked),
    };

    const data = await apiJson("/admin/settings", {
      method: "POST",
      headers: buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });

    if (data?.settings) {
      state.settings = { ...DEFAULT_RUNTIME_SETTINGS, ...data.settings };
      applySettingsToUi();
    }
    showToast("Runtime settings saved and applied immediately.", "success");
    loadAdminDiagnostics({ silent: true });
  } catch (err) {
    showToast(`Settings rejected: ${err.message}`, "error", 6500);
  } finally {
    els.btnSaveSettings.disabled = false;
    els.btnSaveSettings.textContent = "Save Settings";
  }
}

async function loadAdminDiagnostics({ silent = false } = {}) {
  try {
    const diag = await apiJson("/admin/diagnostics");
    state.diagnostics = diag;
    renderAdminDiagnostics(diag);
  } catch (err) {
    if (!silent) showToast(`Could not load diagnostics: ${err.message}`, "error");
  }
}

function renderAdminDiagnostics(diag) {
  const azure = diag?.azure || {};
  const clip = diag?.openclip || {};
  const dbInfo = diag?.database || {};
  const compliance = diag?.compliance || {};

  const azureBadge = azure.configured
    ? `<span class="pill pill-approve">Configured</span>`
    : `<span class="pill pill-reject">Missing Env</span>`;

  const refsCount = clip.refs_count ?? 0;
  const clipBadge =
    refsCount > 0
      ? `<span class="pill pill-approve">${escapeHtml(refsCount)} Vectors</span>`
      : `<span class="pill pill-review">Zero-Shot Fallback</span>`;

  els.adminDiagGrid.innerHTML = `
    <div class="diag-card">
      <div class="row-between">
        <span class="trace-stat-key">Azure OpenAI Vision</span>
        ${azureBadge}
      </div>
      <strong class="mono" style="font-size: 0.85rem;">${escapeHtml(azure.endpoint_host || "Not configured")}</strong>
      <div style="font-size: 0.8rem; color: var(--fg-muted);">
        Deployment: <strong>${escapeHtml(azure.active_deployment || state.settings.vision_deployment)}</strong> · API ${escapeHtml(azure.api_version || "—")}
      </div>
    </div>

    <div class="diag-card">
      <div class="row-between">
        <span class="trace-stat-key">OpenCLIP Stage 1</span>
        ${clipBadge}
      </div>
      <strong style="font-size: 0.88rem;">${escapeHtml(clip.checkpoint || "ViT-B-32")} (${escapeHtml(clip.pretrained || "laion2b_s34b_b79k")})</strong>
      <div style="font-size: 0.8rem; color: var(--fg-muted);">
        Device: <strong>${escapeHtml(clip.device || "auto")}</strong> · Model ${clip.model_loaded ? "loaded" : "lazy-ready"}
      </div>
    </div>

    <div class="diag-card">
      <div class="row-between">
        <span class="trace-stat-key">SQLite Ledger</span>
        <span class="pill pill-black tabular">${escapeHtml(dbInfo.session_count ?? 0)} Sessions</span>
      </div>
      <strong class="mono" style="font-size: 0.8rem; word-break: break-all;">${escapeHtml(dbInfo.db_path || "intake.db")}</strong>
      <div style="font-size: 0.8rem; color: var(--fg-muted);">
        Pending Staff Reviews: <strong>${escapeHtml(dbInfo.pending_review_count ?? 0)}</strong>
      </div>
    </div>

    <div class="diag-card">
      <div class="row-between">
        <span class="trace-stat-key">Compliance Locks</span>
        <span class="pill pill-reject">Hard Gate Locked</span>
      </div>
      <strong style="font-size: 0.88rem;">Inference-Only · Zero Training</strong>
      <div style="font-size: 0.8rem; color: var(--fg-muted);">
        ${compliance.hard_gate_locked !== false ? "Crash / contamination / Zone-1 capped <= 49." : "Check lock."}
      </div>
    </div>
  `;

  // Render Latest Frontier Agent Trace (prefer diagnostics, fallback to current audit trace)
  const latest = diag?.latest_agent_trace;
  const trace = latest?.agent_trace || state.auditTracePayload;

  if (!trace) {
    state.latestTracePayload = null;
    els.adminTraceEmpty.classList.remove("hidden");
    els.adminTraceContent.classList.add("hidden");
    return;
  }

  state.latestTracePayload = trace;
  els.adminTraceEmpty.classList.add("hidden");
  els.adminTraceContent.classList.remove("hidden");

  if (latest?.session_id) {
    els.adminTraceSubtitle.textContent = `Session ${latest.session_id} (${capitalize(
      latest.garment_type || "garment"
    )}) · Score ${latest.total_score ?? "—"}/100 · Updated ${formatDate(latest.updated_at)}`;
  }

  els.adminTraceStats.innerHTML = buildTraceStatsHtml(trace);
  els.adminTraceSystem.textContent = trace.system_prompt || "(Not provided)";
  els.adminTraceUser.textContent = trace.user_prompt || "(Not provided)";
  els.adminTraceRaw.textContent = prettyJsonText(trace.raw_response);
}

async function loadAdminPanel() {
  await Promise.all([loadRuntimeSettings({ silent: false }), loadAdminDiagnostics({ silent: false })]);
}

async function loadDemoSamplesList() {
  try {
    const data = await apiJson("/demo/samples");
    const items = Array.isArray(data?.items) ? data.items : [];
    const optionsHtml = items.length
      ? items.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join("")
      : `<option value="">No local samples found</option>`;

    els.card1SampleSelect.innerHTML = optionsHtml;
    els.sandboxSampleSelect.innerHTML = optionsHtml;
    els.btnCard1LoadSample.disabled = items.length === 0;
    els.btnSandboxRun.disabled = items.length === 0;
    if (els.card1SampleDrawer) {
      els.card1SampleDrawer.classList.toggle("hidden", items.length === 0);
    }
  } catch (err) {
    els.card1SampleSelect.innerHTML = `<option value="">Samples unavailable</option>`;
    els.sandboxSampleSelect.innerHTML = `<option value="">Samples unavailable</option>`;
    els.btnCard1LoadSample.disabled = true;
    els.btnSandboxRun.disabled = true;
    if (els.card1SampleDrawer) {
      els.card1SampleDrawer.classList.add("hidden");
    }
    console.warn("Could not load demo samples:", err);
  }
}

function getSandboxDisclosurePreset(presetKey) {
  if (presetKey === "crash") {
    return {
      crash: true,
      usage: "moderate",
      exposure_band: "moderate",
      notes: "Sandbox preset: rider disclosed prior crash involvement (Hard Compliance Gate test).",
    };
  }
  if (presetKey === "contradiction") {
    return {
      crash: false,
      usage: "light",
      exposure_band: "light",
      notes: "Sandbox preset: rider claimed garment is almost new, lightly worn 1 season, stored indoors.",
    };
  }
  return {
    crash: false,
    usage: "light",
    exposure_band: "light",
    notes: "Sandbox preset: clean light-use intake.",
  };
}

// ============================================================================
// Lightbox Modal
// ============================================================================

function openLightbox(url, title, subtitle) {
  if (!url) return;
  els.lightboxTitle.textContent = title || "Photo Preview";
  els.lightboxSubtitle.textContent = subtitle || "";
  els.lightboxImg.src = url;
  if (typeof els.lightbox.showModal === "function") {
    els.lightbox.showModal();
  }
}

// ============================================================================
// Event Wiring & Bootstrap
// ============================================================================

function bindEvents() {
  // Workspace tabs
  els.tabs.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Stepper click navigation
  [1, 2, 3].forEach((stepNum) => {
    els.wizSteps[stepNum].addEventListener("click", () => {
      if (els.wizSteps[stepNum].disabled) return;
      if (stepNum === 1) {
        resetToCategoryCard();
      } else {
        setWizardStep(stepNum);
      }
    });
  });

  // Card 1: Category cards & sample drawer
  els.pickJacketBtn.addEventListener("click", () => startNewCategorySession("jacket"));
  els.pickPantsBtn.addEventListener("click", () => startNewCategorySession("pants"));

  els.btnCard1LoadSample.addEventListener("click", () => {
    loadLocalSampleAndOpen({
      itemId: els.card1SampleSelect.value,
      garmentType: els.card1SampleGarment.value,
      autoScoreAndOpenAudit: true,
      triggerBtn: els.btnCard1LoadSample,
    });
  });

  // Card 2: Back, Copy URL, Disclosure controls, Poll Now, Continue to Audit
  els.btnBackCategory.addEventListener("click", resetToCategoryCard);

  els.btnCopyUrl.addEventListener("click", () => {
    copyText(els.captureUrlInput.value, "Mobile capture link copied to clipboard.");
  });

  els.counterCrashBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.disclosureDirty = true;
      state.counterCrash = btn.dataset.counterCrash === "true";
      els.counterCrashBtns.forEach((b) => {
        const val = b.dataset.counterCrash === "true";
        const isSelected = val === state.counterCrash;
        b.classList.toggle("is-selected", isSelected && !val);
        b.classList.toggle("is-selected-danger", isSelected && val);
        b.setAttribute("aria-pressed", String(isSelected));
      });
      updateDisclosureSummaryPill();
    });
  });

  els.counterUsageSelect.addEventListener("change", () => {
    state.disclosureDirty = true;
    updateDisclosureSummaryPill();
  });

  els.counterNotesInput.addEventListener("input", () => {
    state.disclosureDirty = true;
  });

  els.btnPollNow.addEventListener("click", async () => {
    if (!state.sessionId) return;
    els.btnPollNow.disabled = true;
    await pollSessionStatus();
    els.btnPollNow.disabled = false;
  });

  els.btnContinueAudit.addEventListener("click", () => {
    if (!state.sessionId) return;
    if (state.lastStatus?.score && !state.disclosureDirty) {
      setWizardStep(3);
      renderAuditDossier(state.lastStatus.score);
    } else {
      triggerScore(state.sessionId, { useCounterDisclosure: state.disclosureDirty });
    }
  });

  // Card 3: Audit Dossier buttons & Trace copy actions
  els.btnAuditBackCapture.addEventListener("click", () => {
    setWizardStep(2);
    if (state.lastStatus) renderCaptureState(state.lastStatus);
  });

  els.btnAuditRescore.addEventListener("click", () => {
    if (state.sessionId) {
      triggerScore(state.sessionId, { useCounterDisclosure: state.disclosureDirty });
    }
  });

  els.btnStartNextIntake.addEventListener("click", resetToCategoryCard);

  els.btnAuditCopyPrompt.addEventListener("click", () => {
    const t = state.auditTracePayload;
    if (!t) return showToast("No prompt trace available.", "warn");
    const combined = `=== SYSTEM PROMPT ===\n${t.system_prompt || ""}\n\n=== USER PROMPT ===\n${t.user_prompt || ""}`;
    copyText(combined, "Frontier prompts copied to clipboard.");
  });

  els.btnAuditCopyJson.addEventListener("click", () => {
    const t = state.auditTracePayload;
    if (!t) return showToast("No raw JSON response available.", "warn");
    copyText(prettyJsonText(t.raw_response), "Raw Frontier JSON copied to clipboard.");
  });

  els.btnAuditApprove.addEventListener("click", async () => {
    if (!state.sessionId) return;
    els.btnAuditApprove.disabled = true;
    try {
      await submitReviewResolution(state.sessionId, "approved", els.auditStaffNotes.value.trim());
      els.auditInlineReview.classList.add("hidden");
      loadReviewQueue({ silent: true });
    } catch (err) {
      showToast(`Review update failed: ${err.message}`, "error");
    } finally {
      els.btnAuditApprove.disabled = false;
    }
  });

  els.btnAuditDecline.addEventListener("click", async () => {
    if (!state.sessionId) return;
    els.btnAuditDecline.disabled = true;
    try {
      await submitReviewResolution(state.sessionId, "declined_upcycle", els.auditStaffNotes.value.trim());
      els.auditInlineReview.classList.add("hidden");
      loadReviewQueue({ silent: true });
    } catch (err) {
      showToast(`Review update failed: ${err.message}`, "error");
    } finally {
      els.btnAuditDecline.disabled = false;
    }
  });

  // Queue & Ledger
  els.queueFilterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.queueFilter = btn.dataset.queueFilter;
      els.queueFilterBtns.forEach((b) => {
        b.classList.toggle("is-selected", b.dataset.queueFilter === state.queueFilter);
      });
      renderReviewQueue();
    });
  });
  els.btnRefreshQueue.addEventListener("click", () => loadReviewQueue());
  els.btnRefreshLog.addEventListener("click", () => loadSessionsLog());

  // Admin & Debug
  els.btnRefreshAdmin.addEventListener("click", () => loadAdminPanel());
  els.adminSettingsForm.addEventListener("submit", handleSaveSettings);

  els.btnSandboxRun.addEventListener("click", () => {
    loadLocalSampleAndOpen({
      itemId: els.sandboxSampleSelect.value,
      garmentType: els.sandboxGarmentSelect.value,
      disclosure: getSandboxDisclosurePreset(els.sandboxPresetSelect.value),
      autoScoreAndOpenAudit: true,
      triggerBtn: els.btnSandboxRun,
    });
  });

  els.btnAdminCopyPrompt.addEventListener("click", () => {
    const t = state.latestTracePayload;
    if (!t) return showToast("No prompt trace available.", "warn");
    const combined = `=== SYSTEM PROMPT ===\n${t.system_prompt || ""}\n\n=== USER PROMPT ===\n${t.user_prompt || ""}`;
    copyText(combined, "Latest Frontier prompts copied to clipboard.");
  });

  els.btnAdminCopyJson.addEventListener("click", () => {
    const t = state.latestTracePayload;
    if (!t) return showToast("No raw JSON response available.", "warn");
    copyText(prettyJsonText(t.raw_response), "Latest raw Frontier JSON copied to clipboard.");
  });

  // Portfolio Demo Mode passcode form
  els.portfolioPasscodeForm.addEventListener("submit", handleUnlockPasscode);
  els.btnLockLive.addEventListener("click", handleLockPasscode);

  // Lightbox
  els.btnCloseLightbox.addEventListener("click", () => els.lightbox.close());
  els.lightbox.addEventListener("click", (evt) => {
    if (evt.target === els.lightbox) els.lightbox.close();
  });
}

function init() {
  initAngleDeck();
  bindEvents();
  setWizardStep(1);
  loadPublicConfig();
  loadRuntimeSettings({ silent: true });
  loadDemoSamplesList();
  loadReviewQueue({ silent: true });
  loadSessionsLog({ silent: true });
}

init();
