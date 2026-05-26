```bash
python3 prep-samples.py
python3 prep-samples.py --sample our
python3 prep-samples.py --sample our/001
python3 prep-samples.py --sample our/001 --pipeline 5-full
python3 prep-samples.py --sample our/001 --skip-existing
python3 prep-samples.py --sample our/001 --screenshots-only
python3 prep-samples.py --sample our/001 --backend local
python3 prep-samples.py --sample our-2/001 --pipeline 5-full --backend openrouter
```

OpenRouter caching: check `cached_tokens` / `cache_creation_tokens` in `agent.log` API response lines (round 2+ should show cache hits). Compare with OpenRouter Activity.

scripts/finialize-seed-samples.py must be run before processing