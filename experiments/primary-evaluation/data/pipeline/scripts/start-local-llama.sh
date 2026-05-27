#!/usr/bin/env bash
# Start llama-server with Unsloth Qwen3.6-27B MTP (UD-Q4_K_XL) for local eval.
# Settings: https://unsloth.ai/docs/models/qwen3.6 (MTP + non-thinking instruct)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
MODEL_DIR="${LOCAL_LLAMA_MODEL_DIR:-$ROOT/models/unsloth/Qwen3.6-27B-MTP-GGUF}"
LLAMA_SERVER="${LOCAL_LLAMA_SERVER_BIN:-$ROOT/llama.cpp/build/bin/llama-server}"
PORT="${LOCAL_LLAMA_PORT:-8001}"
ALIAS="${LOCAL_LLAMA_MODEL_ALIAS:-unsloth/Qwen3.6-27B}"
CTX_SIZE="${LOCAL_LLAMA_CTX_SIZE:-262144}"
SPEC_TYPE="${LOCAL_LLAMA_SPEC_TYPE:-draft-mtp}"
SPEC_DRAFT_N_MAX="${LOCAL_LLAMA_SPEC_DRAFT_N_MAX:-2}"
N_GPU_LAYERS="${LOCAL_LLAMA_N_GPU_LAYERS:-all}"

if [[ ! -x "$LLAMA_SERVER" ]]; then
  echo "llama-server not found at $LLAMA_SERVER" >&2
  echo "Build with: cmake llama.cpp -B llama.cpp/build -DGGML_CUDA=ON && cmake --build llama.cpp/build --target llama-server" >&2
  exit 1
fi

MODEL_FILE="$(find "$MODEL_DIR" -maxdepth 1 -name '*UD-Q4_K_XL*.gguf' -print -quit)"
if [[ -z "$MODEL_FILE" ]]; then
  echo "GGUF not found under $MODEL_DIR" >&2
  echo "Download with: bash $(dirname "$0")/download-local-mtp.sh" >&2
  exit 1
fi

exec "$LLAMA_SERVER" \
  --model "$MODEL_FILE" \
  --alias "$ALIAS" \
  --host 127.0.0.1 \
  --port "$PORT" \
  --parallel 1 \
  --n-gpu-layers "$N_GPU_LAYERS" \
  --temp 0.7 \
  --top-p 0.8 \
  --top-k 20 \
  --min-p 0.00 \
  --presence-penalty 1.5 \
  --ctx-size "$CTX_SIZE" \
  --spec-type "$SPEC_TYPE" \
  --spec-draft-n-max "$SPEC_DRAFT_N_MAX" \
  --chat-template-kwargs '{"enable_thinking":false}'
