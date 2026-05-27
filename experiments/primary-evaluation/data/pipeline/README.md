```bash
python3 prep-samples.py
python3 prep-samples.py --sample our
python3 prep-samples.py --sample our/001
python3 prep-samples.py --sample our/001 --pipeline 5-full
python3 prep-samples.py --sample our/001 --skip-existing
python3 prep-samples.py --sample our/001 --screenshots-only
python3 prep-samples.py --sample our/001 --backend local

Local backend: start `bash scripts/start-local-llama.sh` (MTP + Unsloth Qwen3.6 settings).
Download model first: `bash scripts/download-local-mtp.sh`
Ensure `deno` is on `PATH` (e.g. `export PATH="$HOME/.deno/bin:$PATH"`).
python3 prep-samples.py --sample our-2/001 --pipeline 5-full --backend openrouter
```

OpenRouter caching: check `cached_tokens` / `cache_creation_tokens` in `agent.log` API response lines (round 2+ should show cache hits). Compare with OpenRouter Activity.

scripts/finialize-seed-samples.py must be run before processing