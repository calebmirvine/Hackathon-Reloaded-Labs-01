# Created by Caleb M. Irvine for use by Moto Reloaded
"""Stage 1: OpenCLIP angle verification and reference lookup (pretrained, frozen, inference only).

Provides a lazy thread-safe singleton for frozen pretrained OpenCLIP `ViT-B-32`
(`laion2b_s34b_b79k`) and `numpy` cosine similarity matching against `refs.npy`
and `refs_meta.json`, with a graceful zero-shot text fallback when `refs.npy` is
not present.
"""

from __future__ import annotations

import json
import os
import threading
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps

REQUIRED_ANGLES: list[str] = ["front", "left", "right", "back", "inside", "labels"]
VALID_ANGLES: list[str] = [*REQUIRED_ANGLES, "defect"]

CLIP_MODEL_NAME = "ViT-B-32"
CLIP_PRETRAINED = "laion2b_s34b_b79k"

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REFS_NPY = REPO_ROOT / "refs.npy"
DEFAULT_REFS_META = REPO_ROOT / "refs_meta.json"

# Macro-groups for soft angle verification:
# Exterior mirror/near-tie views (front/back, left/right) stay in the same
# macro-group so dark jackets/pants do not trigger noisy false mismatches, while
# cross-group uploads (e.g., labels or inside uploaded into front) are flagged.
_MACRO_GROUP: dict[str, str] = {
    "front": "exterior",
    "back": "exterior",
    "left": "exterior",
    "right": "exterior",
    "inside": "inside",
    "labels": "labels",
    "defect": "defect",
}

_ZERO_SHOT_PROMPTS: dict[str, list[str]] = {
    "front": [
        "a photo of the full front exterior of a motorcycle jacket laid flat",
        "a photo of the full front exterior of motorcycle riding pants laid flat",
    ],
    "back": [
        "a photo of the full back exterior of a motorcycle jacket laid flat",
        "a photo of the back exterior and seat of motorcycle riding pants laid flat",
    ],
    "left": [
        "a photo of the left side and outer left sleeve of a motorcycle jacket",
        "a photo of the left side and outer thigh of motorcycle riding pants",
    ],
    "right": [
        "a photo of the right side and outer right sleeve of a motorcycle jacket",
        "a photo of the right side and outer thigh of motorcycle riding pants",
    ],
    "inside": [
        "a photo of a motorcycle garment turned inside out showing the interior lining and pockets",
        "a close-up of the inside lining and inner protective layer panels of a motorcycle jacket or pants",
    ],
    "labels": [
        "a close-up photo of a printed clothing care tag, size label, or brand tag with text",
        "a macro photo of sewn garment labels showing brand logo, washing symbols, or fabric percentages",
    ],
    "defect": [
        "a close-up photo of fabric abrasion, scuff, tear, or zipper damage on motorcycle gear",
        "a macro close-up photo showing surface wear or stitching defect on a garment",
    ],
}

_MIN_SIM_REFS = 0.45
_MACRO_MARGIN_REFS = 0.025
_MIN_SIM_ZEROSHOT = 0.17
_MACRO_MARGIN_ZEROSHOT = 0.015


# REFERENCES (no training):
# - Model is pretrained and frozen for inference only (model.eval(), torch.no_grad(),
#   no optimizer, no backward pass, no fine-tuning).
#   Source: OpenCLIP repo (https://github.com/mlfoundations/open_clip) & model card (https://huggingface.co/laion/CLIP-ViT-B-32-laion2B-s34B-b79K)
# - Embeddings are only stored and compared with cosine similarity (lookup, not training).
#   Source: OpenCLIP repo (https://github.com/mlfoundations/open_clip) & Participant Agreement v2.0 ("Don't train or fine-tune a model on the photo set")
# - Photos sent to the scoring API go to Azure OpenAI, which does not train on inputs.
#   Source: Azure OpenAI Data, Privacy, and Security (https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy)
# - Challenge photos are never saved as training data.
#   Source: Participant Agreement v2.0 ("Don't train or fine-tune a model on the photo set")
class _ClipMatcherSingleton:
    """Lazy thread-safe singleton holding frozen OpenCLIP + reference embeddings."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded = False
        self._device: str = "cpu"
        self._model: Any = None
        self._preprocess: Any = None
        self._tokenizer: Any = None
        self._refs: np.ndarray | None = None
        self._records: list[dict[str, Any]] = []
        self._text_prototypes: dict[str, np.ndarray] | None = None
        self._mode: str = "zero_shot_text"

    def _resolve_ref_paths(self) -> tuple[Path, Path]:
        npy_env = os.getenv("INTAKE_REFS_PATH")
        meta_env = os.getenv("INTAKE_REFS_META_PATH")
        npy_path = Path(npy_env) if npy_env else DEFAULT_REFS_NPY
        meta_path = Path(meta_env) if meta_env else DEFAULT_REFS_META
        return npy_path, meta_path

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return

            import open_clip
            import torch

            self._device = "mps" if torch.backends.mps.is_available() else "cpu"
            model, _, preprocess = open_clip.create_model_and_transforms(
                CLIP_MODEL_NAME,
                pretrained=CLIP_PRETRAINED,
            )
            model = model.to(self._device)
            model.eval()
            for param in model.parameters():
                param.requires_grad_(False)

            self._model = model
            self._preprocess = preprocess
            self._tokenizer = open_clip.get_tokenizer(CLIP_MODEL_NAME)

            self._load_references()
            self._loaded = True

    def _load_references(self) -> None:
        npy_path, meta_path = self._resolve_ref_paths()
        if npy_path.exists() and meta_path.exists():
            refs = np.load(npy_path).astype(np.float32)
            raw_meta = json.loads(meta_path.read_text(encoding="utf-8"))
            records = raw_meta["records"] if isinstance(raw_meta, dict) else raw_meta
            if refs.ndim == 2 and len(records) == refs.shape[0] and refs.shape[0] > 0:
                norms = np.linalg.norm(refs, axis=1, keepdims=True)
                norms = np.where(norms == 0, 1.0, norms)
                self._refs = (refs / norms).astype(np.float32)
                self._records = list(records)
                self._mode = "refs_npy"
                return

        self._refs = None
        self._records = []
        self._mode = "zero_shot_text"
        self._build_zero_shot_text_prototypes()

    def _build_zero_shot_text_prototypes(self) -> None:
        import torch

        prototypes: dict[str, np.ndarray] = {}
        with torch.no_grad():
            for angle, prompts in _ZERO_SHOT_PROMPTS.items():
                tokens = self._tokenizer(prompts).to(self._device)
                text_features = self._model.encode_text(tokens)
                text_features = text_features / text_features.norm(dim=-1, keepdim=True)
                mean_vec = text_features.mean(dim=0)
                mean_vec = mean_vec / mean_vec.norm()
                prototypes[angle] = mean_vec.detach().cpu().numpy().astype(np.float32)
        self._text_prototypes = prototypes

    def encode_image(self, image_path: str) -> np.ndarray:
        import torch

        self._ensure_loaded()
        with Image.open(image_path) as img:
            img_rgb = ImageOps.exif_transpose(img).convert("RGB")
            tensor = self._preprocess(img_rgb).unsqueeze(0).to(self._device)

        with torch.no_grad():
            features = self._model.encode_image(tensor)
            features = features / features.norm(dim=-1, keepdim=True)
            vec = features[0].detach().cpu().numpy().astype(np.float32)

        norm = float(np.linalg.norm(vec))
        return vec / norm if norm > 0 else vec

    def verify_angle(
        self,
        image_path: str,
        expected_angle: str,
        *,
        warn_threshold: float | None = None,
    ) -> dict[str, Any]:
        expected = expected_angle.strip().lower()
        if expected not in VALID_ANGLES:
            raise ValueError(f"Unsupported angle '{expected_angle}'. Expected one of {VALID_ANGLES}.")

        vec = self.encode_image(image_path)

        if self._mode == "refs_npy" and self._refs is not None:
            return self._match_against_refs(vec, expected, warn_threshold=warn_threshold)
        return self._match_zero_shot_text(vec, expected, warn_threshold=warn_threshold)

    def _match_against_refs(
        self,
        vec: np.ndarray,
        expected: str,
        *,
        warn_threshold: float | None = None,
    ) -> dict[str, Any]:
        assert self._refs is not None
        sims = self._refs @ vec  # cosine similarity via L2-normalized dot product

        # Top-5 individual closest reference photos for vision rubric context
        top_indices = np.argsort(sims)[::-1][:5]
        matched_references = [
            {
                "item_id": str(self._records[int(idx)].get("item_id", "")),
                "angle": str(self._records[int(idx)].get("angle", "")),
                "detail_tag": str(self._records[int(idx)].get("detail_tag", "")),
                "similarity": round(float(sims[int(idx)]), 4),
            }
            for idx in top_indices
        ]

        # Compute per-angle top-k mean similarity across the 6 guided slots
        angle_scores: dict[str, float] = {}
        for slot in REQUIRED_ANGLES:
            slot_sims = [
                float(sims[i])
                for i, rec in enumerate(self._records)
                if rec.get("angle") == slot
            ]
            if slot_sims:
                slot_sims.sort(reverse=True)
                k = min(3, len(slot_sims))
                angle_scores[slot] = sum(slot_sims[:k]) / k
            else:
                angle_scores[slot] = 0.0

        predicted_angle = max(REQUIRED_ANGLES, key=lambda a: angle_scores[a])
        top_similarity = angle_scores[predicted_angle]
        effective_min_sim = float(warn_threshold) if warn_threshold is not None else _MIN_SIM_REFS

        if expected == "defect":
            defect_sims = [
                float(sims[i])
                for i, rec in enumerate(self._records)
                if rec.get("angle") in {"defect", "z1"}
            ]
            if defect_sims:
                defect_sims.sort(reverse=True)
                k = min(3, len(defect_sims))
                expected_similarity = sum(defect_sims[:k]) / k
            else:
                expected_similarity = float(sims[int(top_indices[0])]) if len(top_indices) else 0.0
            angle_status = "matched"
            angle_ok = True
        else:
            expected_similarity = angle_scores.get(expected, 0.0)
            angle_ok = self._evaluate_soft_match(
                expected=expected,
                predicted=predicted_angle,
                expected_sim=expected_similarity,
                top_sim=top_similarity,
                min_sim=effective_min_sim,
                macro_margin=_MACRO_MARGIN_REFS,
            )
            angle_status = "matched" if angle_ok else "warn_mismatch"

        return {
            "expected_angle": expected,
            "predicted_angle": predicted_angle if expected != "defect" else "defect",
            "expected_similarity": round(float(expected_similarity), 4),
            "top_similarity": round(float(top_similarity), 4),
            "angle_status": angle_status,
            "angle_ok": angle_ok,
            "matched_references": matched_references,
            "mode": "refs_npy",
        }

    def _match_zero_shot_text(
        self,
        vec: np.ndarray,
        expected: str,
        *,
        warn_threshold: float | None = None,
    ) -> dict[str, Any]:
        if self._text_prototypes is None:
            self._build_zero_shot_text_prototypes()
        assert self._text_prototypes is not None

        all_scores = {
            angle: float(np.dot(proto, vec))
            for angle, proto in self._text_prototypes.items()
        }
        core_scores = {a: all_scores[a] for a in REQUIRED_ANGLES}
        predicted_angle = max(REQUIRED_ANGLES, key=lambda a: core_scores[a])
        top_similarity = core_scores[predicted_angle]
        effective_min_sim = float(warn_threshold) if warn_threshold is not None else _MIN_SIM_ZEROSHOT

        sorted_refs = sorted(all_scores.items(), key=lambda kv: kv[1], reverse=True)[:5]
        matched_references = [
            {
                "item_id": "zero-shot",
                "angle": angle,
                "detail_tag": f"text-prompt-{angle}",
                "similarity": round(float(score), 4),
            }
            for angle, score in sorted_refs
        ]

        if expected == "defect":
            expected_similarity = all_scores.get("defect", top_similarity)
            angle_ok = True
            angle_status = "matched"
        else:
            expected_similarity = core_scores.get(expected, 0.0)
            angle_ok = self._evaluate_soft_match(
                expected=expected,
                predicted=predicted_angle,
                expected_sim=expected_similarity,
                top_sim=top_similarity,
                min_sim=effective_min_sim,
                macro_margin=_MACRO_MARGIN_ZEROSHOT,
            )
            angle_status = "matched" if angle_ok else "warn_mismatch"

        return {
            "expected_angle": expected,
            "predicted_angle": predicted_angle if expected != "defect" else "defect",
            "expected_similarity": round(float(expected_similarity), 4),
            "top_similarity": round(float(top_similarity), 4),
            "angle_status": angle_status,
            "angle_ok": angle_ok,
            "matched_references": matched_references,
            "mode": "zero_shot_text",
        }

    def get_diagnostics(self) -> dict[str, Any]:
        """Return OpenCLIP runtime & reference index diagnostics without forcing heavy model load."""
        if self._loaded:
            angle_counts = dict(
                sorted(Counter(str(r.get("angle", "unknown")) for r in self._records).items())
            )
            refs_loaded = self._refs is not None and len(self._records) > 0
            return {
                "checkpoint": CLIP_MODEL_NAME,
                "pretrained": CLIP_PRETRAINED,
                "device": self._device,
                "model_loaded": True,
                "refs_loaded": refs_loaded,
                "refs_count": len(self._records),
                "angle_counts": angle_counts,
            }

        device = "cpu"
        try:
            import torch

            device = "mps" if torch.backends.mps.is_available() else "cpu"
        except Exception:
            device = "cpu"

        npy_path, meta_path = self._resolve_ref_paths()
        refs_loaded = False
        refs_count = 0
        angle_counts: dict[str, int] = {}

        if meta_path.exists():
            try:
                raw_meta = json.loads(meta_path.read_text(encoding="utf-8"))
                records = raw_meta["records"] if isinstance(raw_meta, dict) else raw_meta
                if isinstance(records, list) and records:
                    refs_count = len(records)
                    if isinstance(raw_meta, dict) and isinstance(raw_meta.get("angle_counts"), dict):
                        angle_counts = {
                            str(k): int(v) for k, v in sorted(raw_meta["angle_counts"].items())
                        }
                    else:
                        angle_counts = dict(
                            sorted(Counter(str(r.get("angle", "unknown")) for r in records).items())
                        )
                    refs_loaded = npy_path.exists()
            except (OSError, ValueError, KeyError, TypeError):
                refs_loaded = False
                refs_count = 0
                angle_counts = {}

        return {
            "checkpoint": CLIP_MODEL_NAME,
            "pretrained": CLIP_PRETRAINED,
            "device": device,
            "model_loaded": False,
            "refs_loaded": refs_loaded,
            "refs_count": refs_count,
            "angle_counts": angle_counts,
        }

    @staticmethod
    def _evaluate_soft_match(
        expected: str,
        predicted: str,
        expected_sim: float,
        top_sim: float,
        min_sim: float,
        macro_margin: float,
    ) -> bool:
        """Soft matching: tolerate exterior mirror/near-ties, warn on macro-group mismatch or very low similarity."""
        if expected == "defect":
            return True
        if expected_sim < min_sim:
            return False
        if _MACRO_GROUP.get(expected) != _MACRO_GROUP.get(predicted):
            if (top_sim - expected_sim) >= macro_margin:
                return False
        return True


_MATCHER = _ClipMatcherSingleton()


# REFERENCES (no training):
# - Model is pretrained and frozen for inference only (model.eval(), torch.no_grad(),
#   no optimizer, no backward pass, no fine-tuning).
#   Source: OpenCLIP repo (https://github.com/mlfoundations/open_clip) & model card (https://huggingface.co/laion/CLIP-ViT-B-32-laion2B-s34B-b79K)
# - Embeddings are only stored and compared with cosine similarity (lookup, not training).
#   Source: OpenCLIP repo (https://github.com/mlfoundations/open_clip) & Participant Agreement v2.0 ("Don't train or fine-tune a model on the photo set")
# - Photos sent to the scoring API go to Azure OpenAI, which does not train on inputs.
#   Source: Azure OpenAI Data, Privacy, and Security (https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy)
# - Challenge photos are never saved as training data.
#   Source: Participant Agreement v2.0 ("Don't train or fine-tune a model on the photo set")
def verify_angle(
    image_path: str,
    expected_angle: str,
    *,
    warn_threshold: float | None = None,
) -> dict[str, Any]:
    """Verify whether `image_path` matches `expected_angle` using frozen OpenCLIP lookup."""
    return _MATCHER.verify_angle(
        image_path=image_path,
        expected_angle=expected_angle,
        warn_threshold=warn_threshold,
    )


def get_clip_diagnostics() -> dict[str, Any]:
    """Return frozen OpenCLIP checkpoint, device, and reference index diagnostics."""
    return _MATCHER.get_diagnostics()
