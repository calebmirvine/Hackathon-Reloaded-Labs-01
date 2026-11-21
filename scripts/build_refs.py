# Created by Caleb M. Irvine for use by Moto Reloaded
"""Build local reference embeddings (refs.npy + refs_meta.json) via frozen pretrained OpenCLIP.

Inference-only utility: scans local `data/RL01-*/*.jpg` garment photos (excluding
folder separator ID cards `RL01-XXX.jpg`), maps each photo to its canonical angle
slot, computes L2-normalized float32 embeddings with frozen pretrained OpenCLIP
`ViT-B-32` (`laion2b_s34b_b79k`), and writes `refs.npy` and `refs_meta.json` in
the repository root.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import numpy as np
import open_clip
import torch
from PIL import Image, ImageOps

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
REFS_NPY_PATH = REPO_ROOT / "refs.npy"
REFS_META_PATH = REPO_ROOT / "refs_meta.json"

CLIP_MODEL_NAME = "ViT-B-32"
CLIP_PRETRAINED = "laion2b_s34b_b79k"
BATCH_SIZE = 32


def is_separator_card(item_id: str, image_path: Path) -> bool:
    """Return True if the image is a folder ID separator card (e.g. RL01-001.jpg)."""
    stem = image_path.stem.strip().upper()
    return stem == item_id.strip().upper() or bool(re.fullmatch(r"RL\d+-\d+", stem))


def map_filename_to_angle(filename: str) -> tuple[str, str]:
    """Map messy real-world photo filenames to canonical angles and detail tags.

    Canonical angles:
    - front, back, left, right (exterior)
    - inside (lining* / pockets*)
    - labels (label* / brand/ce/comp tag close-ups)
    - z1 (Zone 1 close-ups)
    - defect (defect close-ups)
    """
    stem = Path(filename).stem.strip()
    # Strip leading sequence numbers like "1-", "5.1-", "10- ", "1 "
    cleaned = re.sub(r"^\d+(?:\.\d+)?[\s\-_]+", "", stem).strip()
    lower = cleaned.lower()

    detail_tag = re.sub(r"\s+", "-", lower)
    detail_tag = re.sub(r"-+", "-", detail_tag).strip("-") or "unknown"

    if "defect" in lower:
        return "defect", detail_tag
    if "label" in lower:
        return "labels", detail_tag
    if "lining" in lower or "pocket" in lower or "inside" in lower:
        return "inside", detail_tag
    if "z1" in lower:
        return "z1", detail_tag
    if "front" in lower:
        return "front", detail_tag
    if "back" in lower:
        return "back", detail_tag
    if "left" in lower:
        return "left", detail_tag
    if "right" in lower:
        return "right", detail_tag

    return "other", detail_tag


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
def scan_garment_photos(data_dir: Path = DATA_DIR) -> tuple[list[dict], int]:
    """Scan local `data/RL01-*/*.jpg` folders and exclude separator ID cards."""
    if not data_dir.exists():
        raise FileNotFoundError(f"Data directory not found: {data_dir}")

    records: list[dict] = []
    skipped_cards = 0

    item_dirs = sorted(
        p for p in data_dir.iterdir() if p.is_dir() and p.name.upper().startswith("RL01-")
    )

    for item_dir in item_dirs:
        item_id = item_dir.name
        image_files = sorted(
            p for p in item_dir.iterdir()
            if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png"}
        )
        for img_path in image_files:
            if is_separator_card(item_id, img_path):
                skipped_cards += 1
                continue

            angle, detail_tag = map_filename_to_angle(img_path.name)
            records.append(
                {
                    "item_id": item_id,
                    "filename": img_path.name,
                    "path": str(img_path),
                    "angle": angle,
                    "detail_tag": detail_tag,
                }
            )

    return records, skipped_cards


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
def build_reference_embeddings(
    data_dir: Path = DATA_DIR,
    refs_npy_path: Path = REFS_NPY_PATH,
    refs_meta_path: Path = REFS_META_PATH,
) -> dict:
    """Compute frozen pretrained OpenCLIP embeddings and save refs.npy + refs_meta.json."""
    records, skipped_cards = scan_garment_photos(data_dir)
    if not records:
        raise RuntimeError(f"No garment photos found under {data_dir}")

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"[build_refs] Using device={device}, model={CLIP_MODEL_NAME} ({CLIP_PRETRAINED})")
    print(f"[build_refs] Found {len(records)} garment photos (skipped {skipped_cards} separator cards)")

    model, _, preprocess = open_clip.create_model_and_transforms(
        CLIP_MODEL_NAME,
        pretrained=CLIP_PRETRAINED,
    )
    model = model.to(device)
    model.eval()
    for param in model.parameters():
        param.requires_grad_(False)

    all_embeddings: list[np.ndarray] = []

    with torch.no_grad():
        for start in range(0, len(records), BATCH_SIZE):
            batch_records = records[start : start + BATCH_SIZE]
            tensors = []
            for rec in batch_records:
                with Image.open(rec["path"]) as img:
                    img_rgb = ImageOps.exif_transpose(img).convert("RGB")
                    tensors.append(preprocess(img_rgb))

            batch_tensor = torch.stack(tensors).to(device)
            image_features = model.encode_image(batch_tensor)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            all_embeddings.append(image_features.detach().cpu().numpy().astype(np.float32))

    embeddings = np.concatenate(all_embeddings, axis=0).astype(np.float32)
    # Re-normalize in float32 numpy to guard against numerical drift
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    embeddings = (embeddings / norms).astype(np.float32)

    np.save(refs_npy_path, embeddings)

    angle_counts = dict(sorted(Counter(r["angle"] for r in records).items()))
    meta_records = [
        {
            "item_id": r["item_id"],
            "filename": r["filename"],
            "angle": r["angle"],
            "detail_tag": r["detail_tag"],
        }
        for r in records
    ]
    meta = {
        "model": CLIP_MODEL_NAME,
        "pretrained": CLIP_PRETRAINED,
        "embedding_dim": int(embeddings.shape[1]),
        "total_garment_photos": int(embeddings.shape[0]),
        "skipped_separator_cards": int(skipped_cards),
        "angle_counts": angle_counts,
        "records": meta_records,
    }
    refs_meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    print(f"[build_refs] Saved {refs_npy_path.name} shape={embeddings.shape} dtype={embeddings.dtype}")
    print(f"[build_refs] Saved {refs_meta_path.name} angle_counts={angle_counts}")
    return meta


if __name__ == "__main__":
    build_reference_embeddings()
