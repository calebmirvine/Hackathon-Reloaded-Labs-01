// # Created by Caleb M. Irvine for use by Moto Reloaded

const REQUIRED_ANGLES = ["front", "left", "right", "back", "inside", "labels"];

const ANGLE_META = {
  front: {
    title: "Front Exterior",
    jacket: "Laid flat, zipped · front torso & shoulders",
    pants: "Laid flat, fastened · front hips & knees",
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
    pants: "Inside-out lining, layers & knee/hip pockets",
  },
  labels: {
    title: "Labels Close-Up",
    jacket: "Sharp brand, composition & CE (if present)",
    pants: "Sharp brand, composition & CE (if present)",
  },
};

const state = {
  activeTab: "intake",
  selectedGarment: "jacket",
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
  queueFilter: "all",
  queueItems: [],
  sessions: [],
};

// DOM References
const els = {
  toast: document.getElementById("global-toast"),
  tabs: document.querySelectorAll(".nav-tab"),
  panels: {
    intake: document.getElementById("panel-intake"),
    queue: document.getElementById("panel-queue"),
    log: document.getElementById("panel-log"),
  },
  queueBadge: document.getElementById("queue-badge"),
  logBadge: document.getElementById("log-badge"),
  garmentButtons: document.querySelectorAll("[data-garment]"),
  btnStartSession: document.getElementById("btn-start-session"),
  sampleSelect: document.getElementById("sample-select"),
  btnLoadSample: document.getElementById("btn-load-sample"),
  intakeEmpty: document.getElementById("intake-empty"),
  intakeWorkspace: document.getElementById("intake-workspace"),
  sessionHeading: document.getElementById("session-heading"),
  sessionGarmentPill: document.getElementById("session-garment-pill"),
  sessionStatusPill: document.getElementById("session-status-pill"),
  pollingIndicator: document.getElementById("polling-indicator"),
  qrHandoffCard: document.getElementById("qr-handoff-card"),
  qrImage: document.getElementById("qr-image"),
  captureUrlInput: document.getElementById("capture-url-input"),
  btnCopyUrl: document.getElementById("btn-copy-url"),
  linkOpenCapture: document.getElementById("link-open-capture"),
  angleCountPill: document.getElementById("angle-count-pill"),
  angleGrid: document.getElementById("angle-grid"),
  defectSection: document.getElementById("defect-section"),
  defectCountPill: document.getElementById("defect-count-pill"),
  defectStrip: document.getElementById("defect-strip"),
  btnScoreNow: document.getElementById("btn-score-now"),
  counterCrashBtns: document.querySelectorAll("[data-counter-crash]"),
  counterUsageSelect: document.getElementById("counter-usage-select"),
  counterNotesInput: document.getElementById("counter-notes-input"),
  btnExportXlsx: document.getElementById("btn-export-xlsx"),
  scoreWaiting: document.getElementById("score-waiting"),
  scoreLoading: document.getElementById("score-loading"),
  scoreReport: document.getElementById("score-report"),
  decisionBanner: document.getElementById("decision-banner"),
  decisionBandPill: document.getElementById("decision-band-pill"),
  buyinStatusPill: document.getElementById("buyin-status-pill"),
  decisionTitle: document.getElementById("decision-title"),
  decisionSummary: document.getElementById("decision-summary"),
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
  scoreDisclaimer: document.getElementById("score-disclaimer"),
  queueFilterBtns: document.querySelectorAll("[data-queue-filter]"),
  btnRefreshQueue: document.getElementById("btn-refresh-queue"),
  queueList: document.getElementById("queue-list"),
  btnRefreshLog: document.getElementById("btn-refresh-log"),
  logTbody: document.getElementById("log-tbody"),
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

let toastTimer = null;
function showToast(message, variant = "info", durationMs = 4500) {
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

async function apiJson(url, options = {}) {
  const res = await fetch(url, options);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const detail = body?.detail || body?.message || `Request failed (${res.status})`;
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
        bandText: "85–100 · Auto-Approved & Logged",
        title: "Auto-Approved & Logged (85–100)",
        buyInText: "Buy-In Eligible · Confirm In-Hand",
        buyInClass: "pill-approve",
      };
    case "human_review":
      return {
        tone: "review",
        badgeClass: "pill-review",
        bandText: "50–84 · Human Review",
        title: "Human Review Required (50–84)",
        buyInText: "Queued for Alex / Barbara",
        buyInClass: "pill-review",
      };
    case "rejected_retake":
      return {
        tone: "reject",
        badgeClass: "pill-reject",
        bandText: "0–49 · Retake Required",
        title: "Rejected / Photo Retake Required (0–49)",
        buyInText: "Not Ready · Retake Flagged Angles",
        buyInClass: "pill-reject",
      };
    case "rejected_upcycle":
      return {
        tone: "reject",
        badgeClass: "pill-reject",
        bandText: "0–49 · Declined for Buy-In",
        title: "Declined for Buy-In — Route to Upcycling (0–49)",
        buyInText: "Declined · Route to Upcycling",
        buyInClass: "pill-reject",
      };
    default: {
      const n = Number(scoreValue);
      if (Number.isFinite(n) && n >= 85) return decisionMeta("auto_approved");
      if (Number.isFinite(n) && n >= 50) return decisionMeta("human_review");
      return {
        tone: "neutral",
        badgeClass: "pill-neutral",
        bandText: "Pending",
        title: "Pending Evaluation",
        buyInText: "Not Scored Yet",
        buyInClass: "pill-neutral",
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
// Tabs & Navigation
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

  if (tabName === "queue") {
    loadReviewQueue();
  } else if (tabName === "log") {
    loadSessionsLog();
  }
}

// ============================================================================
// Demo Samples Loader
// ============================================================================

async function loadDemoSamplesList() {
  try {
    const data = await apiJson("/demo/samples");
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) {
      els.sampleSelect.innerHTML = `<option value="">No local samples found</option>`;
      els.btnLoadSample.disabled = true;
      return;
    }
    els.sampleSelect.innerHTML = items
      .map((itemId) => `<option value="${escapeHtml(itemId)}">${escapeHtml(itemId)}</option>`)
      .join("");
    els.btnLoadSample.disabled = false;
  } catch (err) {
    els.sampleSelect.innerHTML = `<option value="">Samples unavailable</option>`;
    els.btnLoadSample.disabled = true;
    console.warn("Could not load demo samples:", err);
  }
}

async function handleLoadSample() {
  const itemId = els.sampleSelect.value;
  if (!itemId) {
    showToast("Select a local sample folder first.", "warn");
    return;
  }

  els.btnLoadSample.disabled = true;
  els.btnLoadSample.innerHTML = `<span class="spinner" aria-hidden="true"></span> Loading…`;
  try {
    const payload = {
      item_id: itemId,
      garment_type: state.selectedGarment,
    };
    const res = await apiJson("/demo/load-sample", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const captureUrl = `${window.location.origin}/capture/${res.session_id}`;
    activateSession(res.session_id, {
      garmentType: res.garment_type || state.selectedGarment,
      captureUrl,
      qrDataUrl: "",
    });
    showToast(
      `Loaded local sample ${itemId} (${(res.captured_angles || []).length} angles) into session ${res.session_id}. Scoring now…`,
      "success"
    );
    await pollSessionStatus();
    loadSessionsLog();
  } catch (err) {
    showToast(`Failed to load sample ${itemId}: ${err.message}`, "error", 6500);
  } finally {
    els.btnLoadSample.disabled = false;
    els.btnLoadSample.textContent = "Load Local Sample";
  }
}

// ============================================================================
// Session Creation & 2-Second Live Polling
// ============================================================================

async function handleStartSession() {
  els.btnStartSession.disabled = true;
  els.btnStartSession.innerHTML = `<span class="spinner spinner-dark" aria-hidden="true"></span> Starting…`;
  try {
    const res = await apiJson("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ garment_type: state.selectedGarment }),
    });

    activateSession(res.session_id, {
      garmentType: res.garment_type,
      captureUrl: res.capture_url,
      qrDataUrl: res.qr_data_url,
    });
    showToast(`Intake session ${res.session_id} created. Scan the QR code on a phone to start capture.`, "success");
    await pollSessionStatus();
    loadSessionsLog();
  } catch (err) {
    showToast(`Could not create session: ${err.message}`, "error", 6500);
  } finally {
    els.btnStartSession.disabled = false;
    els.btnStartSession.textContent = "Start Intake Session";
  }
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
  els.pollingIndicator.classList.add("hidden");
}

function startPolling() {
  stopPolling();
  if (!state.sessionId) return;
  els.pollingIndicator.classList.remove("hidden");
  state.pollTimer = setInterval(() => {
    pollSessionStatus();
  }, 2000);
}

function activateSession(sessionId, { garmentType = "jacket", captureUrl = "", qrDataUrl = "" } = {}) {
  stopPolling();
  state.sessionId = sessionId;
  state.garmentType = garmentType;
  state.captureUrl = captureUrl || `${window.location.origin}/capture/${sessionId}`;
  state.qrDataUrl = qrDataUrl || "";
  state.lastStatus = null;
  state.disclosureDirty = false;
  state.counterCrash = false;
  syncCounterDisclosureInputs({ crash: false, usage: "moderate", notes: "" });

  els.intakeEmpty.classList.add("hidden");
  els.intakeWorkspace.classList.remove("hidden");

  els.sessionHeading.textContent = `Session ${sessionId}`;
  els.sessionGarmentPill.textContent = capitalize(garmentType);

  if (state.qrDataUrl) {
    els.qrImage.src = state.qrDataUrl;
    els.captureUrlInput.value = state.captureUrl;
    els.linkOpenCapture.href = state.captureUrl;
    els.qrHandoffCard.classList.remove("hidden");
  } else {
    els.qrHandoffCard.classList.add("hidden");
  }

  els.btnExportXlsx.href = `/export/${encodeURIComponent(sessionId)}.xlsx`;
  els.btnExportXlsx.classList.remove("hidden");

  // Reset score view until status returns
  els.scoreReport.classList.add("hidden");
  els.scoreLoading.classList.add("hidden");
  els.scoreWaiting.classList.remove("hidden");

  switchTab("intake");
  startPolling();
}

async function pollSessionStatus() {
  if (!state.sessionId) return;
  const activeId = state.sessionId;

  try {
    const data = await apiJson(`/status/${encodeURIComponent(activeId)}`);
    if (state.sessionId !== activeId) return;

    state.lastStatus = data;
    state.garmentType = data.garment_type || state.garmentType;
    renderSessionStatus(data);

    // Auto-trigger POST /score once phone marks session ready_to_score
    const isReady = data.status === "ready_to_score" || Boolean(data.ready_to_score);
    if (
      isReady &&
      !data.score &&
      !state.isScoring &&
      !state.autoScoredSessions.has(activeId) &&
      Array.isArray(data.photos) &&
      data.photos.length > 0
    ) {
      state.autoScoredSessions.add(activeId);
      await triggerScore(activeId, { useCounterDisclosure: false });
    }
  } catch (err) {
    console.warn("Polling error:", err);
  }
}

// ============================================================================
// Render Active Session, Guided Angles & Score Report
// ============================================================================

function syncCounterDisclosureInputs(disclosure) {
  const d = disclosure || {};
  const crashBool = Boolean(d.crash);
  state.counterCrash = crashBool;

  els.counterCrashBtns.forEach((btn) => {
    const val = btn.dataset.counterCrash === "true";
    const isSelected = val === crashBool;
    btn.classList.toggle("is-selected", isSelected && !val);
    btn.classList.toggle("is-selected-danger", isSelected && val);
    btn.setAttribute("aria-pressed", String(isSelected));
  });

  const usage = String(d.usage || d.exposure_band || "moderate").toLowerCase();
  els.counterUsageSelect.value = ["light", "moderate", "heavy"].includes(usage) ? usage : "moderate";
  els.counterNotesInput.value = d.notes || "";
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

function renderSessionStatus(data) {
  const garment = data.garment_type || "jacket";
  els.sessionGarmentPill.textContent = capitalize(garment);

  const statusInfo = statusPillInfo(data.status);
  els.sessionStatusPill.className = `pill ${statusInfo.cls}`;
  els.sessionStatusPill.textContent = state.isScoring ? "Scoring…" : statusInfo.label;

  const photos = Array.isArray(data.photos) ? data.photos : [];
  const requiredMap = new Map();
  const defectPhotos = [];

  photos.forEach((p) => {
    const ang = String(p.angle || "").toLowerCase();
    if (ang === "defect") {
      defectPhotos.push(p);
    } else if (REQUIRED_ANGLES.includes(ang)) {
      requiredMap.set(ang, p);
    }
  });

  els.angleCountPill.textContent = `${requiredMap.size} / ${REQUIRED_ANGLES.length} captured`;
  els.btnScoreNow.disabled = photos.length === 0 || state.isScoring;
  els.btnScoreNow.textContent = data.score ? "Re-Score Session" : "Score Now";

  if (!state.disclosureDirty && data.disclosure) {
    syncCounterDisclosureInputs(data.disclosure);
  }

  // Render 6 Guided Angle Cards
  els.angleGrid.innerHTML = REQUIRED_ANGLES.map((angle) => {
    const meta = ANGLE_META[angle];
    const photo = requiredMap.get(angle);
    const hint = garment === "pants" ? meta.pants : meta.jacket;

    if (!photo) {
      return `
        <article class="angle-card">
          <div class="angle-thumb-wrap">
            <div class="angle-placeholder">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              <span>Awaiting ${escapeHtml(angle)}</span>
            </div>
          </div>
          <div class="angle-body">
            <div class="row-between">
              <span class="angle-name">${escapeHtml(meta.title)}</span>
              <span class="pill pill-neutral">Pending</span>
            </div>
            <p class="angle-meta">${escapeHtml(hint)}</p>
          </div>
        </article>
      `;
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

    const badge = angleOk
      ? `<span class="pill pill-approve">Verified${sim ? ` · ${escapeHtml(sim)}` : ""}</span>`
      : `<span class="pill pill-review">Check Angle</span>`;

    const mismatchNote = !angleOk
      ? `OpenCLIP saw: ${predicted}${sim ? ` (${sim})` : ""}`
      : refLabel || hint;

    const photoUrl = photo.photo_url || "";
    const cacheBusted = photoUrl ? `${photoUrl}?t=${encodeURIComponent(photo.created_at || photo.id || "1")}` : "";

    return `
      <article class="angle-card ${angleOk ? "is-verified" : "is-warn"}">
        <div class="angle-thumb-wrap">
          <button
            type="button"
            class="angle-thumb-btn"
            data-lightbox-url="${escapeHtml(cacheBusted)}"
            data-lightbox-title="${escapeHtml(meta.title)} (${escapeHtml(angle)})"
            data-lightbox-sub="${escapeHtml(angleOk ? `Verified by OpenCLIP · ${mismatchNote}` : mismatchNote)}"
            aria-label="Inspect ${escapeHtml(meta.title)} photo full size"
          >
            <img class="angle-thumb-img" src="${escapeHtml(cacheBusted)}" alt="${escapeHtml(meta.title)} capture" loading="lazy" />
          </button>
        </div>
        <div class="angle-body">
          <div class="row-between">
            <span class="angle-name">${escapeHtml(meta.title)}</span>
            ${badge}
          </div>
          <p class="angle-meta">${escapeHtml(mismatchNote)}</p>
        </div>
      </article>
    `;
  }).join("");

  // Bind lightbox triggers on thumbnails
  els.angleGrid.querySelectorAll("[data-lightbox-url]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openLightbox(
        btn.dataset.lightboxUrl,
        btn.dataset.lightboxTitle,
        btn.dataset.lightboxSub
      );
    });
  });

  // Render optional Defect Close-Ups strip
  if (defectPhotos.length > 0) {
    els.defectSection.classList.remove("hidden");
    els.defectCountPill.textContent = `${defectPhotos.length} ${defectPhotos.length === 1 ? "shot" : "shots"}`;
    els.defectStrip.innerHTML = defectPhotos
      .map((p, idx) => {
        const url = p.photo_url || "";
        return `
          <div class="defect-thumb-card">
            <button
              type="button"
              class="angle-thumb-btn"
              data-lightbox-url="${escapeHtml(url)}"
              data-lightbox-title="Defect Close-Up #${idx + 1}"
              data-lightbox-sub="Uploaded with coin-scale guidance"
            >
              <img src="${escapeHtml(url)}" alt="Defect close-up ${idx + 1}" loading="lazy" />
            </button>
            <div class="defect-thumb-caption">Defect #${idx + 1}</div>
          </div>
        `;
      })
      .join("");
    els.defectStrip.querySelectorAll("[data-lightbox-url]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openLightbox(btn.dataset.lightboxUrl, btn.dataset.lightboxTitle, btn.dataset.lightboxSub);
      });
    });
  } else {
    els.defectSection.classList.add("hidden");
    els.defectStrip.innerHTML = "";
  }

  // Render Score Report if available
  if (data.score && !state.isScoring) {
    renderScoreReport(data.score);
  } else if (state.isScoring) {
    els.scoreWaiting.classList.add("hidden");
    els.scoreReport.classList.add("hidden");
    els.scoreLoading.classList.remove("hidden");
  } else {
    els.scoreReport.classList.add("hidden");
    els.scoreLoading.classList.add("hidden");
    els.scoreWaiting.classList.remove("hidden");
  }
}

async function triggerScore(sessionId, { useCounterDisclosure = true } = {}) {
  if (!sessionId || state.isScoring) return;
  state.isScoring = true;
  els.btnScoreNow.disabled = true;
  els.scoreWaiting.classList.add("hidden");
  els.scoreReport.classList.add("hidden");
  els.scoreLoading.classList.remove("hidden");
  els.sessionStatusPill.className = "pill pill-cream";
  els.sessionStatusPill.textContent = "Scoring…";

  try {
    const body = { session_id: sessionId };
    if (useCounterDisclosure) {
      body.disclosure = getCounterDisclosurePayload();
    }
    const result = await apiJson("/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    state.disclosureDirty = false;
    state.isScoring = false;
    renderScoreReport(result);
    showToast(
      `Photo Coverage + Damage Disclosure Score ready: ${result.total_score}/100 (${result.decision_label || result.decision}).`,
      result.decision === "auto_approved" ? "success" : result.decision === "human_review" ? "warn" : "error"
    );

    // Refresh status, queue badge, and session log
    await pollSessionStatus();
    loadReviewQueue({ silent: true });
    loadSessionsLog({ silent: true });
  } catch (err) {
    state.isScoring = false;
    els.scoreLoading.classList.add("hidden");
    if (state.lastStatus?.score) {
      els.scoreReport.classList.remove("hidden");
    } else {
      els.scoreWaiting.classList.remove("hidden");
    }
    els.btnScoreNow.disabled = false;
    showToast(`Scoring failed: ${err.message}`, "error", 7000);
  }
}

function renderScoreReport(score) {
  els.scoreWaiting.classList.add("hidden");
  els.scoreLoading.classList.add("hidden");
  els.scoreReport.classList.remove("hidden");

  const total = Math.max(0, Math.min(100, Number(score.total_score ?? 0)));
  const coverage = Math.max(0, Math.min(50, Number(score.photo_coverage_score ?? 0)));
  const damage = Math.max(0, Math.min(50, Number(score.damage_disclosure_score ?? 0)));
  const meta = decisionMeta(score.decision, total);

  // Decision Banner
  els.decisionBanner.className = `decision-banner is-${meta.tone}`;
  els.decisionBandPill.className = `pill ${meta.badgeClass}`;
  els.decisionBandPill.textContent = meta.bandText;
  els.buyinStatusPill.className = `pill ${meta.buyInClass}`;
  els.buyinStatusPill.textContent = meta.buyInText;
  els.decisionTitle.textContent = score.decision_label || meta.title;
  els.decisionSummary.textContent = score.summary || "";

  // SVG Gauge (circumference for r=50 is 314.16)
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

  // Coverage & Damage Disclosure Bars
  els.scoreCoverageText.textContent = `${coverage} / 50`;
  els.scoreCoverageBar.style.width = `${(coverage / 50) * 100}%`;
  els.scoreCoverageBar.className = `progress-fill is-${coverage >= 40 ? "approve" : coverage >= 25 ? "review" : "reject"}`;

  els.scoreDamageText.textContent = `${damage} / 50`;
  els.scoreDamageBar.style.width = `${(damage / 50) * 100}%`;
  els.scoreDamageBar.className = `progress-fill is-${damage >= 40 ? "approve" : damage >= 25 ? "review" : "reject"}`;

  // Documentation-only protection disclosure status
  const protStatus = String(score.protection_disclosure_status || "unknown").toLowerCase();
  if (protStatus === "confirmed") {
    els.protectionDisclosurePill.className = "pill pill-approve";
    els.protectionDisclosurePill.textContent = "Confirmed (Documented)";
  } else if (protStatus === "reduced") {
    els.protectionDisclosurePill.className = "pill pill-reject";
    els.protectionDisclosurePill.textContent = "Reduced (Disclosed / Flagged)";
  } else {
    els.protectionDisclosurePill.className = "pill pill-neutral";
    els.protectionDisclosurePill.textContent = "Unknown (Normal on older gear)";
  }

  // Hard Gate Alert
  const hardGateReasons = Array.isArray(score.hard_gate_reasons) ? score.hard_gate_reasons : [];
  if (score.hard_gate_triggered && hardGateReasons.length > 0) {
    els.hardGateBox.classList.remove("hidden");
    els.hardGateList.innerHTML = hardGateReasons
      .map((r) => `<li>${escapeHtml(r)}</li>`)
      .join("");
  } else {
    els.hardGateBox.classList.add("hidden");
    els.hardGateList.innerHTML = "";
  }

  // Contradiction Alert
  if (score.contradiction_flagged) {
    els.contradictionBox.classList.remove("hidden");
    els.contradictionReason.textContent =
      score.contradiction_reason ||
      "Declared rider history appears to contradict visible photo evidence. Review carefully in hand.";
  } else {
    els.contradictionBox.classList.add("hidden");
  }

  // Retake Banner
  const retakeAngles = Array.isArray(score.retake_angles) ? score.retake_angles : [];
  if (score.decision === "rejected_retake" && retakeAngles.length > 0) {
    els.retakeBox.classList.remove("hidden");
    els.retakeAnglesText.textContent = `Ask the rider to capture clearer photos for: ${retakeAngles
      .map((a) => ANGLE_META[a]?.title || capitalize(a))
      .join(", ")}.`;
  } else {
    els.retakeBox.classList.add("hidden");
  }

  // Upcycling & Responsible Retirement Card
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
    els.upcyclePathways.innerHTML = pathways
      .map((step) => `<li>${escapeHtml(step)}</li>`)
      .join("");

    const tradeInMsg =
      upcycle.trade_in_note ||
      upcycle.trade_in_conversation ||
      "Invite the rider into an in-store gear consultation to retire this piece responsibly and explore trade-in options toward new riding gear.";
    els.upcycleTradein.innerHTML = `
      <strong>In-Store Responsible Retirement &amp; New-Gear Trade-In Conversation</strong>
      ${escapeHtml(tradeInMsg)}
    `;
    els.upcycleClerkStep.textContent = upcycle.next_step_for_clerk
      ? `Store Clerk Action: ${upcycle.next_step_for_clerk}`
      : "";
  } else {
    els.upcycleCard.classList.add("hidden");
  }

  // Extracted Labels Strip (with North America CE-label neutrality)
  const labels = score.extracted_labels || {};
  const ceVal = String(labels.ce_label || "none").trim();
  const isCeNone = ceVal.toLowerCase() === "none" || ceVal === "";
  const ceDisplay = isCeNone ? "None shown" : `EN 17092 Class ${ceVal}`;
  const ceNote = isCeNone
    ? labels.ce_note || "Normal in North America — absence of a CE label is not a penalty."
    : "Documentation label observed in photo.";

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
      <span class="label-tile-key">CE EN 17092 Label</span>
      <span class="label-tile-val">${escapeHtml(ceDisplay)}</span>
      <span class="label-tile-note">${escapeHtml(ceNote)}</span>
    </div>
    <div class="label-tile">
      <span class="label-tile-key">Fibre Composition (${escapeHtml(capitalize(matGroup))})</span>
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

  // Compliance Disclaimer
  els.scoreDisclaimer.textContent =
    score.disclaimer ||
    "Photo coverage and damage disclosure check only. Moto Reloaded and this tool do not assess, certify, test, or guarantee protective performance.";
}

// ============================================================================
// Review Queue (50-84)
// ============================================================================

async function loadReviewQueue({ silent = false } = {}) {
  try {
    const data = await apiJson("/review-queue");
    const items = Array.isArray(data?.items) ? data.items : [];
    state.queueItems = items;

    const pendingCount = items.filter(
      (i) => (i.review_status || i.status) === "pending"
    ).length;
    els.queueBadge.textContent = String(pendingCount);
    els.queueBadge.classList.toggle("is-warn", pendingCount > 0);

    if (state.activeTab === "queue" || !silent) {
      renderReviewQueue();
    }
  } catch (err) {
    if (!silent) {
      showToast(`Could not load review queue: ${err.message}`, "error");
    }
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
          Sessions scoring <strong>50–84</strong> automatically appear here for Alex &amp; Barbara's
          physical in-hand inspection.
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
          : `<span class="pill pill-review">Pending In-Hand Check</span>`;

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
              scoreObj.summary || "Queued for physical confirmation."
            )}</p>`;

      return `
        <article class="queue-card ${reviewStatus === "pending" ? "is-pending" : ""}" data-queue-session="${escapeHtml(item.session_id)}">
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
            <label class="field-label" for="notes-${escapeHtml(item.session_id)}">Alex / Barbara In-Hand Notes</label>
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
              data-open-session="${escapeHtml(item.session_id)}"
              data-open-garment="${escapeHtml(item.garment_type || "jacket")}"
            >
              Open Report
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  // Wire queue card buttons
  els.queueList.querySelectorAll("[data-review-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sid = btn.dataset.sessionId;
      const nextStatus = btn.dataset.reviewAction;
      const notesEl = document.getElementById(`notes-${sid}`);
      const staffNotes = notesEl ? notesEl.value.trim() : "";

      btn.disabled = true;
      try {
        await apiJson(`/review-queue/${encodeURIComponent(sid)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus, staff_notes: staffNotes }),
        });
        showToast(
          nextStatus === "approved"
            ? `Session ${sid} marked Approved In-Hand.`
            : `Session ${sid} declined for buy-in and routed to Upcycling.`,
          nextStatus === "approved" ? "success" : "warn"
        );
        await loadReviewQueue();
      } catch (err) {
        showToast(`Could not update review item: ${err.message}`, "error");
        btn.disabled = false;
      }
    });
  });

  els.queueList.querySelectorAll("[data-open-session]").forEach((btn) => {
    btn.addEventListener("click", () => {
      reopenExistingSession(btn.dataset.openSession, btn.dataset.openGarment);
    });
  });
}

// ============================================================================
// Intake Log Tab
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
    if (!silent) {
      showToast(`Could not load session log: ${err.message}`, "error");
    }
  }
}

function renderSessionsLog() {
  if (state.sessions.length === 0) {
    els.logTbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding: 1.5rem; color: var(--fg-muted);">
          No intake sessions recorded yet. Start a session or load a local sample from Live Intake.
        </td>
      </tr>
    `;
    return;
  }

  els.logTbody.innerHTML = state.sessions
    .map((s) => {
      const st = statusPillInfo(s.status);
      const dec = s.decision ? decisionMeta(s.decision, s.total_score) : null;
      const scoreCell =
        s.total_score !== null && s.total_score !== undefined
          ? `<strong class="tabular">${escapeHtml(s.total_score)} / 100</strong>`
          : `<span style="color:var(--fg-muted);">—</span>`;
      const routingCell = dec
        ? `<span class="pill ${dec.badgeClass}">${escapeHtml(dec.bandText)}</span>`
        : `<span class="pill pill-neutral">Pending</span>`;

      return `
        <tr class="is-clickable" data-log-session="${escapeHtml(s.session_id)}" data-log-garment="${escapeHtml(s.garment_type || "jacket")}">
          <td class="mono" style="font-weight: 700; color: var(--fg-primary);">${escapeHtml(s.session_id)}</td>
          <td>${escapeHtml(capitalize(s.garment_type || "jacket"))}</td>
          <td class="tabular">${escapeHtml(s.photo_count ?? 0)}</td>
          <td><span class="pill ${st.cls}">${escapeHtml(st.label)}</span></td>
          <td>${scoreCell}</td>
          <td>${routingCell}</td>
          <td style="white-space: nowrap;">${escapeHtml(formatDate(s.updated_at || s.created_at))}</td>
          <td>
            <button type="button" class="btn btn-secondary btn-sm">Open</button>
          </td>
        </tr>
      `;
    })
    .join("");

  els.logTbody.querySelectorAll("[data-log-session]").forEach((row) => {
    row.addEventListener("click", () => {
      reopenExistingSession(row.dataset.logSession, row.dataset.logGarment);
    });
  });
}

async function reopenExistingSession(sessionId, garmentType = "jacket") {
  // Prevent unintended auto-scoring when inspecting a previously saved session
  state.autoScoredSessions.add(sessionId);
  activateSession(sessionId, {
    garmentType,
    captureUrl: `${window.location.origin}/capture/${sessionId}`,
    qrDataUrl: "",
  });
  await pollSessionStatus();
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
  els.tabs.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  els.garmentButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedGarment = btn.dataset.garment;
      els.garmentButtons.forEach((b) => {
        const selected = b.dataset.garment === state.selectedGarment;
        b.classList.toggle("is-selected", selected);
        b.setAttribute("aria-pressed", String(selected));
      });
    });
  });

  els.btnStartSession.addEventListener("click", handleStartSession);
  els.btnLoadSample.addEventListener("click", handleLoadSample);

  els.btnCopyUrl.addEventListener("click", async () => {
    const val = els.captureUrlInput.value;
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      showToast("Mobile capture link copied to clipboard.", "success", 2500);
    } catch {
      els.captureUrlInput.select();
      document.execCommand("copy");
      showToast("Mobile capture link copied.", "success", 2500);
    }
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
    });
  });

  els.counterUsageSelect.addEventListener("change", () => {
    state.disclosureDirty = true;
  });

  els.counterNotesInput.addEventListener("input", () => {
    state.disclosureDirty = true;
  });

  els.btnScoreNow.addEventListener("click", () => {
    if (state.sessionId) {
      triggerScore(state.sessionId, { useCounterDisclosure: true });
    }
  });

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

  els.btnCloseLightbox.addEventListener("click", () => {
    els.lightbox.close();
  });
  els.lightbox.addEventListener("click", (evt) => {
    if (evt.target === els.lightbox) {
      els.lightbox.close();
    }
  });
}

function init() {
  bindEvents();
  loadDemoSamplesList();
  loadReviewQueue({ silent: true });
  loadSessionsLog({ silent: true });
}

init();
