#!/usr/bin/env bash
# Download Unsloth Qwen3.6-27B MTP GGUF (UD-Q4_K_XL) for local eval.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
MODEL_DIR="${LOCAL_LLAMA_MODEL_DIR:-$ROOT/models/unsloth/Qwen3.6-27B-MTP-GGUF}"
REPO="${LOCAL_LLAMA_GGUF_REPO:-unsloth/Qwen3.6-27B-MTP-GGUF}"
QUANT="${LOCAL_LLAMA_GGUF_QUANT:-UD-Q4_K_XL}"
LOG_DIR="$ROOT/models"
LOG_FILE="$LOG_DIR/qwen36-27b-mtp-download.log"

mkdir -p "$MODEL_DIR" "$LOG_DIR"

PIPELINE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HF="${HF_BIN:-}"
if [[ -z "$HF" ]]; then
  if [[ -x "$PIPELINE_DIR/.venv/bin/hf" ]]; then
    HF="$PIPELINE_DIR/.venv/bin/hf"
  else
    HF="hf"
  fi
fi

{
  echo "repo=$REPO"
  echo "path=$MODEL_DIR"
  echo "quant=$QUANT"
  echo "started=$(date -Iseconds)"
  "$HF" download "$REPO" \
    --local-dir "$MODEL_DIR" \
    --include "*${QUANT}*"
  echo "finished=$(date -Iseconds)"
} 2>&1 | tee "$LOG_FILE"
