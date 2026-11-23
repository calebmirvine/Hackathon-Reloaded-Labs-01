# Created by Caleb M. Irvine for use by Moto Reloaded
"""Build-time utility to pre-download frozen OpenCLIP weights into the container cache.

Runs strictly during `docker build` to avoid downloading ~600 MB from Hugging Face
Hub on every Azure Container Apps scale-to-zero cold start. Never touches challenge
photos (`data/`) or reference vectors (`refs.npy`) and performs zero training.
"""

from __future__ import annotations

import os
import sys

CLIP_MODEL_NAME = "ViT-B-32"
CLIP_PRETRAINED = "laion2b_s34b_b79k"


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
def prefetch_frozen_openclip() -> None:
    """Download and verify frozen pretrained OpenCLIP ViT-B-32 weights into HF_HOME."""
    import open_clip
    import torch

    cache_dir = os.environ.get("HF_HOME", "(default)")
    print(f"Pre-fetching frozen OpenCLIP {CLIP_MODEL_NAME} ({CLIP_PRETRAINED}) into {cache_dir}...")

    model, _, _ = open_clip.create_model_and_transforms(
        CLIP_MODEL_NAME,
        pretrained=CLIP_PRETRAINED,
    )
    model.eval()
    for param in model.parameters():
        param.requires_grad_(False)

    tokenizer = open_clip.get_tokenizer(CLIP_MODEL_NAME)
    with torch.no_grad():
        tokens = tokenizer(["a photo of a motorcycle jacket"])
        vec = model.encode_text(tokens)
        assert vec.shape[-1] == 512, f"Unexpected OpenCLIP embedding dim: {vec.shape}"

    print("Frozen OpenCLIP weights cached and verified (inference-only, 512-d).")


if __name__ == "__main__":
    try:
        prefetch_frozen_openclip()
    except Exception as exc:  # pragma: no cover
        print(f"ERROR: Failed to pre-fetch OpenCLIP weights: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
