# Primary evaluation pipeline

## Sample layout

**Original** (`1-original/`) — copied from seed as-is:

- `raw.html`, `visible.html`, `screenshot.png`

**Agent variants** (`2-baseline/` … `5-full/`) — after a completed run:

```
<variant>/
  work/
    raw.html      # edits and update rules are applied here
    visible.html  # get_dom / get_map_of_dom / show_in_dom read this file
  index.html      # copy of work/raw.html after post-processing (rules injected as a script; HTML is not re-serialized)
  rules.json      # when the pipeline uses set_update_rule
  agent.log
  screenshot.png  # rendered from index.html
```

## Commands

```bash
python3 prep-samples.py
python3 prep-samples.py --sample 001
python3 prep-samples.py --sample 001 --pipeline 5-full
python3 prep-samples.py --sample 001 --skip-existing
python3 prep-samples.py --sample 001 --screenshots-only
python3 prep-samples.py --sample 001 --backend local
```
