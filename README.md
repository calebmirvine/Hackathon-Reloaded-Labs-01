<!-- # Created by Caleb M. Irvine for use by Moto Reloaded -->

# Hackathon-Reloaded-Labs-01

Store intake and buy-in **Gear Intake Checker** for Moto Reloaded (motorcycle jackets and pants), producing a 0–100 **`"photo coverage + damage disclosure"`** score and routing compromised or retired gear toward circular upcycling and responsible retirement.

## Live Deployment & Portfolio Showcase

- **Portfolio Showcase (GitHub Pages):** [https://calebmirvine.github.io/Hackathon-Reloaded-Labs-01/](https://calebmirvine.github.io/Hackathon-Reloaded-Labs-01/)
- **Live Web App (Azure Container Apps · HTTPS):** [https://ca-motoreloaded-intake.ashysmoke-22729be1.eastus2.azurecontainerapps.io](https://ca-motoreloaded-intake.ashysmoke-22729be1.eastus2.azurecontainerapps.io) *(scales to zero when idle — first request takes ~10–15s to wake; QR → mobile camera capture works natively over HTTPS)*

> **Credit-Protected Portfolio Mode:** In Azure, `SCORE_MODE=demo_with_passcode` lets any visitor run real Stage-1 frozen OpenCLIP verification, mobile QR capture, deterministic 0–100 scoring, Hard Compliance Gate enforcement, and `.xlsx` export at **$0 Azure OpenAI spend**. Entering the private `LIVE_SCORE_PASSCODE` unlocks live Azure OpenAI **`gpt-4.1-mini`** vision scoring (guarded by per-IP hourly + global daily rate caps) and Admin Settings writes (`ALLOW_PUBLIC_ADMIN_WRITE=false`). Local development (`SCORE_MODE` unset) remains unchanged.

## Quick Start

```bash
# 1. Install dependencies into .venv (Python 3.11+)
uv sync

# 2. Build local frozen-inference OpenCLIP reference embeddings (refs.npy + refs_meta.json, gitignored)
uv run python scripts/build_refs.py

# 3. Start the FastAPI server (Laptop Counter UI at /, Phone Capture at /capture/<id>)
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

# 4. Expose over HTTPS for mobile phone camera access (in a second terminal)
# (--protocol http2 avoids UDP/QUIC blocks on restricted/campus networks)
cloudflared tunnel --protocol http2 --url http://localhost:8000
# or: ngrok http 8000

# 5. Run the offline test suite (unit + FastAPI integration tests)
uv run pytest
```

> Copy your Azure OpenAI credentials (`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_API_VERSION`, `AZURE_OPENAI_VISION_DEPLOYMENT=gpt-4.1`) into `.env` (gitignored) before live scoring. When running a Cloudflare Quick Tunnel, copy the printed `https://*.trycloudflare.com` URL into `PUBLIC_BASE_URL` in `.env` (or in the app's **Admin Settings**) so generated QR codes point to your live HTTPS tunnel.

## No model training

No model is trained or fine-tuned on any challenge or intake photographs (**Participant Agreement v2.0**: *"Don't train or fine-tune a model on the photo set"*).

Every module or function in this repository that touches models, embeddings, reference data (`refs.npy`), or challenge photographs (`data/`) includes a `# REFERENCES (no training):` comment block directly above it (searchable via `git grep "REFERENCES (no training)"`). Those comments document in plain language that:

- **Pretrained & frozen inference only:** OpenCLIP runs strictly with `model.eval()` and `torch.no_grad()`, with no optimizer, no backward pass, and no fine-tuning — [OpenCLIP repository](https://github.com/mlfoundations/open_clip) & [CLIP-ViT-B-32-laion2B-s34B-b79K model card](https://huggingface.co/laion/CLIP-ViT-B-32-laion2B-s34B-b79K).
- **Lookup, not training:** Embeddings are only stored and compared with cosine similarity (`numpy` lookup against `refs.npy`), not trained or updated — [OpenCLIP repository](https://github.com/mlfoundations/open_clip) & **Participant Agreement v2.0** (*"Don't train or fine-tune a model on the photo set"*).
- **Zero-training scoring API:** Photos sent to the scoring API go exclusively to **Azure OpenAI**, whose API does not use customer inputs or uploads to train foundation models — [Azure OpenAI Data, Privacy, and Security](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy).
- **No training data capture:** Challenge photos are never saved or exported as training data — **Participant Agreement v2.0** (*"Don't train or fine-tune a model on the photo set"*).

See [`TOOLS.md`](TOOLS.md) for the complete tools/models disclosure and [`AGENTS.md`](AGENTS.md) for project rules and architecture.
