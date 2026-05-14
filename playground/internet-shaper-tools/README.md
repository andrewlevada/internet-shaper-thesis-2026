How to run:

```
deno run -A get_map_of_dom.ts --snapshot path/to/dom.html
deno run -A show_in_dom.ts --snapshot path/to/dom.html --query-selector '.class'
deno run -A set_update_rules.ts --snapshot path/to/dom.html --rules path/to/rules.json --output /tmp/out.html
```

Rules format:

```
[
  {
    "label": "Hide ad",
    "query_selector": ".ad",
    "logic": "element.style.display = 'none'"
  },
  {
    "label": "Rename main",
    "query_selector": "#x",
    "logic": "element.textContent = 'world'"
  }
]
```