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
        "Turn or fold cleanly to show the outer left hip, outer thigh, and left knee (Zone 1 impact areas).",
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
        "Turn or fold cleanly to show the outer right hip, outer thigh, and right knee (Zone 1 impact areas).",
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
    shortLabel: "7. Defect",
    title: "Defect Close-Up (Optional)",
    required: false,
    hints: {
      jacket:
        "Optional: photograph any visible scuff, abrasion, tear, repair, or zipper fault — one defect per shot. Place a coin right next to the mark for scale.",
      pants:
        "Optional: photograph any visible scuff, abrasion, tear, repair, or zipper fault — one defect per shot. Place a coin right next to the mark for scale.",
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

const state = {
  sessionId: null,
  garmentType: "jacket",
  currentStepIndex: 0,
  photosByAngle: new Map(), // front..labels -> photo object
  defectPhotos: [],
  lastFeedbackByAngle: new Map(),
  isUploading: false,
  riderCrash: false,
  riderUsage: "moderate",
  submitted: false,
  pollTimer: null,
  latestScore: null,
};

const els = {
  sessionPill: document.getElementById("phone-session-pill"),
  toast: document.getElementById("phone-toast"),
  errorView: document.getElementById("phone-error-view"),
  errorDetail: document.getElementById("phone-error-detail"),
  captureView: document.getElementById("phone-capture-view"),
  garmentBtns: document.querySelectorAll("[data-phone-garment]"),
  progressText: document.getElementById("phone-progress-text"),
  progressBar: document.getElementById("phone-progress-bar"),
  stepper: document.getElementById("phone-stepper"),
  stagePhoto: document.getElementById("stage-photo"),
  stageDisclosure: document.getElementById("stage-disclosure"),
  stageComplete: document.getElementById("stage-complete"),
  stepKicker: document.getElementById("step-kicker"),
  stepTitle: document.getElementById("step-title"),
  stepStatusPill: document.getElementById("step-status-pill"),
  stepHint: document.getElementById("step-hint"),
  stepPreviewImg: document.getElementById("step-preview-img"),
  stepGuideEmpty: document.getElementById("step-guide-empty"),
  stepEmptyLabel: document.getElementById("step-empty-label"),
  defectGallery: document.getElementById("phone-defect-gallery"),
  uploadBusy: document.getElementById("upload-busy"),
  clipBanner: document.getElementById("clip-feedback-banner"),
  clipTitle: document.getElementById("clip-feedback-title"),
  clipDetail: document.getElementById("clip-feedback-detail"),
  clipActions: document.getElementById("clip-feedback-actions"),
  cameraInput: document.getElementById("camera-input"),
  libraryInput: document.getElementById("library-input"),
  btnTakePhoto: document.getElementById("btn-take-photo"),
  btnChooseLibrary: document.getElementById("btn-choose-library"),
  btnPrevStep: document.getElementById("btn-prev-step"),
  btnNextStep: document.getElementById("btn-next-step"),
  missingBox: document.getElementById("disclosure-missing-box"),
  missingText: document.getElementById("disclosure-missing-text"),
  btnJumpMissing: document.getElementById("btn-jump-missing"),
  riderCrashBtns: document.querySelectorAll("[data-rider-crash]"),
  riderUsageBtns: document.querySelectorAll("[data-rider-usage]"),
  riderNotes: document.getElementById("rider-notes"),
  btnFinishSubmit: document.getElementById("btn-finish-submit"),
  btnBackToPhotos: document.getElementById("btn-back-to-photos"),
  completePollPill: document.getElementById("complete-poll-pill"),
  completeWaiting: document.getElementById("complete-waiting"),
  completeScoreCard: document.getElementById("complete-score-card"),
  phoneDecisionBanner: document.getElementById("phone-decision-banner"),
  phoneDecisionPill: document.getElementById("phone-decision-pill"),
  phoneDecisionTitle: document.getElementById("phone-decision-title"),
  phoneDecisionSummary: document.getElementById("phone-decision-summary"),
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

let toastTimer = null;
function showToast(message, variant = "info", durationMs = 4500) {
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
      state.submitted = true;
      state.latestScore = data.score;
      renderCompleteScreen(data.score);
    } else if (data.status === "ready_to_score") {
      state.submitted = true;
      renderCompleteScreen(null);
      startScorePolling();
    } else {
      // Jump to first uncaptured required angle if resuming mid-session
      const firstMissingIdx = REQUIRED_ANGLES.findIndex((a) => !state.photosByAngle.has(a));
      state.currentStepIndex = firstMissingIdx >= 0 ? firstMissingIdx : REQUIRED_ANGLES.length;
      renderStep();
    }
  } catch (err) {
    showErrorView(`Session "${sid}" could not be loaded: ${err.message}`);
  }
}

function showErrorView(message) {
  els.captureView.classList.add("hidden");
  els.errorView.classList.remove("hidden");
  els.errorDetail.textContent = message;
}

function hydrateFromStatus(data) {
  setGarmentType(data.garment_type || "jacket", { skipRender: true });

  state.photosByAngle.clear();
  state.defectPhotos = [];
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
// Rendering Guided Capture Steps
// ============================================================================

function setGarmentType(type, { skipRender = false } = {}) {
  state.garmentType = type === "pants" ? "pants" : "jacket";
  els.garmentBtns.forEach((btn) => {
    const active = btn.dataset.phoneGarment === state.garmentType;
    btn.classList.toggle("is-selected", active);
    btn.setAttribute("aria-pressed", String(active));
  });
  if (!skipRender && !state.submitted) {
    renderStep();
  }
}

function renderProgressAndStepper() {
  const capturedRequiredCount = REQUIRED_ANGLES.filter((a) => state.photosByAngle.has(a)).length;
  els.progressText.textContent = `${capturedRequiredCount} / ${REQUIRED_ANGLES.length} captured`;
  els.progressBar.style.width = `${(capturedRequiredCount / REQUIRED_ANGLES.length) * 100}%`;

  els.stepper.innerHTML = STEPS.map((step, idx) => {
    const isCurrent = !state.submitted && idx === state.currentStepIndex;
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
      state.submitted = false;
      state.currentStepIndex = Number(btn.dataset.stepIndex);
      renderStep();
    });
  });
}

function renderStep() {
  renderProgressAndStepper();

  const step = STEPS[state.currentStepIndex];
  els.stageComplete.classList.add("hidden");

  if (step.key === "disclosure") {
    els.stagePhoto.classList.add("hidden");
    els.stageDisclosure.classList.remove("hidden");
    renderDisclosureStep();
    return;
  }

  els.stageDisclosure.classList.add("hidden");
  els.stagePhoto.classList.remove("hidden");

  const isDefect = step.key === "defect";
  els.stepKicker.textContent = step.required
    ? `Required Angle ${state.currentStepIndex + 1} of ${REQUIRED_ANGLES.length}`
    : "Optional Extra Shot · Coin for Scale";
  els.stepTitle.textContent = step.title;
  els.stepHint.innerHTML = `<strong>${capitalize(state.garmentType)} guide:</strong> ${escapeHtml(
    step.hints[state.garmentType]
  )}`;

  const existingPhoto = isDefect
    ? state.defectPhotos[state.defectPhotos.length - 1]
    : state.photosByAngle.get(step.key);

  if (existingPhoto?.photo_url) {
    const cacheUrl = `${existingPhoto.photo_url}?t=${encodeURIComponent(
      existingPhoto.created_at || existingPhoto.id || Date.now()
    )}`;
    els.stepPreviewImg.src = cacheUrl;
    els.stepPreviewImg.alt = `${step.title} uploaded preview`;
    els.stepPreviewImg.classList.remove("hidden");
    els.stepGuideEmpty.classList.add("hidden");
  } else {
    els.stepPreviewImg.classList.add("hidden");
    els.stepGuideEmpty.classList.remove("hidden");
    els.stepEmptyLabel.textContent = isDefect
      ? "Optional: Capture visible defect with coin"
      : `Ready for ${step.title} photo`;
  }

  // Status pill
  if (isDefect) {
    els.stepStatusPill.className =
      state.defectPhotos.length > 0 ? "pill pill-approve" : "pill pill-neutral";
    els.stepStatusPill.textContent =
      state.defectPhotos.length > 0
        ? `${state.defectPhotos.length} Defect Shot${state.defectPhotos.length > 1 ? "s" : ""}`
        : "Optional";
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

  // Primary CTA label
  if (isDefect) {
    els.btnTakePhoto.textContent =
      state.defectPhotos.length > 0
        ? "Add Another Defect Photo (with Coin)"
        : "Take Defect Photo (with Coin)";
  } else {
    els.btnTakePhoto.textContent = existingPhoto ? `Retake ${step.title}` : `Take ${step.title} Photo`;
  }

  // Previous / Next labels
  els.btnPrevStep.disabled = state.currentStepIndex === 0;
  if (isDefect) {
    els.btnNextStep.textContent =
      state.defectPhotos.length > 0 ? "Continue to Disclosure →" : "Skip — No Visible Defects →";
  } else if (state.currentStepIndex === REQUIRED_ANGLES.length - 1) {
    els.btnNextStep.textContent = "Next: Defect / Finish →";
  } else {
    els.btnNextStep.textContent = "Next Angle →";
  }

  // Instant OpenCLIP Feedback Banner
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
      ? "Coin-scale defect close-up logged for store staff."
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
      "Check framing so the requested angle fills the frame cleanly, or keep this photo and move on.";
    els.clipActions.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" id="btn-clip-retake">
        Retake Photo
      </button>
      <button type="button" class="btn btn-primary btn-sm" id="btn-clip-keep">
        Keep Anyway &amp; Continue →
      </button>
    `;
    els.clipActions.querySelector("#btn-clip-retake").addEventListener("click", () => {
      els.cameraInput.click();
    });
    els.clipActions.querySelector("#btn-clip-keep").addEventListener("click", advanceStep);
  }
}

function advanceStep() {
  if (state.currentStepIndex < STEPS.length - 1) {
    state.currentStepIndex += 1;
    renderStep();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// ============================================================================
// Upload Photo -> POST /upload (OpenCLIP Stage 1 Verification)
// ============================================================================

async function handleFileSelected(file) {
  if (!file || !state.sessionId || state.isUploading) return;
  const step = STEPS[state.currentStepIndex];
  if (!step || step.key === "disclosure") return;

  // Immediate local preview
  const localUrl = URL.createObjectURL(file);
  els.stepPreviewImg.src = localUrl;
  els.stepPreviewImg.classList.remove("hidden");
  els.stepGuideEmpty.classList.add("hidden");

  state.isUploading = true;
  els.uploadBusy.classList.remove("hidden");
  els.clipBanner.classList.add("hidden");
  els.btnTakePhoto.disabled = true;
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
    } else {
      state.photosByAngle.set(step.key, photoRecord);
    }

    state.lastFeedbackByAngle.set(step.key, {
      angle_ok: Boolean(res.angle_ok),
      predicted_angle: res.predicted_angle,
      expected_similarity: res.expected_similarity,
    });

    renderStep();
  } catch (err) {
    showToast(`Upload failed: ${err.message}`, "error", 6000);
  } finally {
    URL.revokeObjectURL(localUrl);
    state.isUploading = false;
    els.uploadBusy.classList.add("hidden");
    els.btnTakePhoto.disabled = false;
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
      .map((a) => STEPS.find((s) => s.key === a)?.title || capitalize(a))
      .join(", ")}. Complete photo coverage improves your intake score.`;
  } else {
    els.missingBox.classList.add("hidden");
  }
}

async function handleFinishSubmit() {
  if (!state.sessionId) return;

  els.btnFinishSubmit.disabled = true;
  els.btnFinishSubmit.innerHTML = `<span class="spinner spinner-dark" aria-hidden="true"></span> Sending to Counter…`;

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

    state.submitted = true;
    renderCompleteScreen(null);
    startScorePolling();
  } catch (err) {
    showToast(`Could not complete session: ${err.message}`, "error", 6500);
  } finally {
    els.btnFinishSubmit.disabled = false;
    els.btnFinishSubmit.textContent = "Finish & Send to Counter";
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

function startScorePolling() {
  stopScorePolling();
  if (!state.sessionId) return;

  const check = async () => {
    try {
      const data = await apiJson(`/status/${encodeURIComponent(state.sessionId)}`);
      if (data.score) {
        state.latestScore = data.score;
        stopScorePolling();
        renderCompleteScreen(data.score);
      }
    } catch (err) {
      console.warn("Phone score poll error:", err);
    }
  };

  check();
  state.pollTimer = setInterval(check, 2000);
}

function renderCompleteScreen(score) {
  renderProgressAndStepper();
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
  let pillText = "50–84 · Human Review";
  if (score.decision === "auto_approved") {
    tone = "approve";
    pillText = "85–100 · Auto-Approved & Logged";
  } else if (score.decision === "rejected_retake") {
    tone = "reject";
    pillText = "0–49 · Photo Retake Required";
  } else if (score.decision === "rejected_upcycle") {
    tone = "reject";
    pillText = "0–49 · Declined for Buy-In";
  }

  els.phoneDecisionBanner.className = `decision-banner is-${tone}`;
  els.phoneDecisionPill.className = `pill pill-${tone}`;
  els.phoneDecisionPill.textContent = pillText;
  els.phoneDecisionTitle.textContent = score.decision_label || pillText;
  els.phoneDecisionSummary.textContent = score.summary || "";

  els.phoneScoreTotal.textContent = `${total} / 100`;
  els.phoneCovText.textContent = `${cov} / 50`;
  els.phoneCovBar.style.width = `${(cov / 50) * 100}%`;
  els.phoneCovBar.className = `progress-fill is-${cov >= 40 ? "approve" : cov >= 25 ? "review" : "reject"}`;

  els.phoneDmgText.textContent = `${dmg} / 50`;
  els.phoneDmgBar.style.width = `${(dmg / 50) * 100}%`;
  els.phoneDmgBar.className = `progress-fill is-${dmg >= 40 ? "approve" : dmg >= 25 ? "review" : "reject"}`;

  // Retake card if rejected_retake
  const retakeAngles = Array.isArray(score.retake_angles) ? score.retake_angles : [];
  if (score.decision === "rejected_retake" && retakeAngles.length > 0) {
    els.phoneRetakeCard.classList.remove("hidden");
    els.phoneRetakeText.textContent = `Please retake clearer photos for: ${retakeAngles
      .map((a) => STEPS.find((s) => s.key === a)?.title || capitalize(a))
      .join(", ")}.`;
  } else {
    els.phoneRetakeCard.classList.add("hidden");
  }

  // Upcycling card if present
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
// Event Wiring & Bootstrap
// ============================================================================

function bindEvents() {
  els.garmentBtns.forEach((btn) => {
    btn.addEventListener("click", () => setGarmentType(btn.dataset.phoneGarment));
  });

  els.btnTakePhoto.addEventListener("click", () => els.cameraInput.click());
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
      renderStep();
    }
  });

  els.btnNextStep.addEventListener("click", advanceStep);

  els.btnJumpMissing.addEventListener("click", () => {
    const firstMissingIdx = REQUIRED_ANGLES.findIndex((a) => !state.photosByAngle.has(a));
    if (firstMissingIdx >= 0) {
      state.currentStepIndex = firstMissingIdx;
      renderStep();
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
    state.currentStepIndex = REQUIRED_ANGLES.length; // Defect step
    renderStep();
  });

  els.btnPhoneRetakeFlagged.addEventListener("click", () => {
    stopScorePolling();
    state.submitted = false;
    const flagged = state.latestScore?.retake_angles?.[0];
    const targetIdx = STEPS.findIndex((s) => s.key === flagged);
    state.currentStepIndex = targetIdx >= 0 ? targetIdx : 0;
    renderStep();
  });
}

bindEvents();
loadInitialSession();
