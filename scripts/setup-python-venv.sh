#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi

.venv/bin/pip install -U pip

# Install CUDA-enabled torch first when on Linux with NVIDIA; fall back to default wheel.
if command -v nvidia-smi >/dev/null 2>&1; then
  .venv/bin/pip install "torch>=2.7.1"
else
  .venv/bin/pip install "torch>=2.7.1"
fi

.venv/bin/pip install -r requirements.txt
.venv/bin/playwright install chromium

if ! command -v deno >/dev/null 2>&1; then
  echo "Note: Deno is required for evaluation pipeline tool CLIs."
  echo "Install from https://deno.land or: curl -fsSL https://deno.land/install.sh | sh"
fi

echo "Python venv ready at $ROOT/.venv"
echo "Activate with: source .venv/bin/activate"
