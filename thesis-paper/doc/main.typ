#import "@preview/modern-innopolis-thesis:0.1.1": *

#title-page(
  program-code: "09.03.01",
  program-ru: "Информатика и вычислительная техника",
  program-en: "Computer Science",
  work-ru: "ДИПЛОМ",
  work-en: "BATCHLORS GRADUATE THESIS",
  specialty-ru: "Анализ данных и искусственный интеллект",
  specialty-en: "Data Analysis and Artificial Intelligence",
  topic-ru: "Генеративная адаптация веб-интерфейсов под цели пользователя в
режиме реального времени",
  topic-en: "User‑Aligned Web Interfaces: Just‑in‑Time Generative Adaptation of Existing UIs",
  author-ru: "Левада Андрей Романович",
  author-en: "todo",
  supervisor-ru: "todo",
  supervisor-en: "todo",
  year: "2026",
)

#show: thesis.with(
  abstract: lorem(100),
  font-family: "Times New Roman"
)

#set par(
  leading: 1em,
)

= Introduction <sec:introduction>

== Background

We build User Interfaces to make interactions with tech simpler, easier. Designers generally strive to make the ui as usable as possible for each user (*WIP*: citation needed), but here come 2 problems:
- intrinsically, designers can not feasibly plan interfaces for every single user's specific needs and jobs. with constrained resources, even good interfaces are usually not perfect for each user. For example
- on the other more bleak side are the. Gray and dark patterns systematically misalign system and user goals. This happens when business and user goal diverge, and interface ends up being less helpful and more intrusive (*WIP*: citation needed). 
These 2 problems make interfaces misaligned with the users needs — undermining the core of design practice. This is the problem we begin to tackle with this thesis.

This motivates the _Research Question_ — How can adaptive generative interfaces counteract hostile UIs by re‑aligning the interface with a user's articulated goal?

Prior HCI research extensivly shows that user interfaces can be made adaptive and customizable. (*WIP*: A bunch of citations needed) These approaches however are not the focus of our thesis, as they requre the developer/designer to implement them. As we see in the industry, this is understandably hardly ever a priority (*WIP*: citation needed).

Few works take a diffrent approach and try to make interfaces malleable by end users. In this thesis we build upon the ideas they introduce. We want to implement the vision of individually tailored user interfaces, shared by many UX practitioners, made possible my recient advaces in LLM's capabilities. We build and evaluate an agentic system that shows how user-controlled adaptations of existing web interfaces can function as a way for users to activly realign UIs they use with their needs and interests.

A _Solution_ we propose is an agentic system wrapped in a browser extension that uses large language models (LLMs) to adapt existing web user interfaces to a user-defined goal. This prototype takes a user request in a form of prompt as an input. It then generates edits to be applied to the currently opened web page. These edits get applied to the web page every session the user opens it.

== Key contributions

1. *Internet Shaper* prototype — first of it's kind proof of concept of a generative UI adaptation
2. *Fiber*, a browser extension framework, also used by the prototype.
3. Rule-based approach for LLM-to-webpage interactions.
4. Lossy and lossless DOM compression algorithms used by the prototype.

We also conduct a proof-of-concept user testing with N=?, showing feasibility of the interface adaptation in re-aligning user interfaces.

= Related work <sec:related-work>

We explore similar solutions that demonstrate UI generation and adaptation, from which a gap becomes apparent: very few interface adaptation methods exist.

== Generative Adaptation of UI <sec:generative-adaptation-of-ui>

== Generation of UI <sec:generation-of-ui>

== Adaptation of UI <sec:adaptation-of-ui>

Nearly all existing UI adaptation solutions require implementation by the application itself or its developers, with renders them unapplicable for our user-initiated setting. This section covers only adaptation methods that are controlled by the end user, of which few exist.

= Methods <sec:methods>

This section describes how we designed the agentic system at the core of Internet Shaper. We begin from the user-side adaptation problem, show why a naive read-and-edit baseline fails, and then present the perception and action components that address those failures. Later sections cover the snapshot corpus used to measure DOM scale, heuristic development, and evaluation task synthesis.

== Design Goals <sec:design-goals>

As introduced above, interfaces are rarely perfect for every user. Even well-designed products leave gaps between a person's actual tasks and what the UI optimizes for. In the worst cases, gray and dark patterns deliberately misalign business incentives with user goals, making the interface harder to use for the tasks the user actually cares about.

Most adaptive interface research assumes the application or its developers implement customization hooks. Our approach is different: it is _user-sided_. The user adapts software they already use, without any cooperation from the people who built it. The system operates on pages that were not designed to be modified.

To reach those pages, we host the prototype in a browser extension. Extensions can read and write the DOM of any open tab. The page's structure and content are available to the system as HTML — the same representation the browser uses to render what the user sees.

Any adaptation system built on this substrate must do two things. First, it must _read_ the page: capture context, reason about structure, and decompose the user's request into concrete targets. Second, it must _apply_ changes — durable updates that re-align the interface with the user's goal. Throughout this paper we call these two parts _perception_ and _action_.

== Baseline Limitations <sec:baseline-limitations>

The straightforward design is to read the full page HTML into the model, then apply direct text or DOM edits. Two practical limits make this baseline infeasible.

=== Scale <sec:baseline-scale>

DOM snapshots from real websites are far larger than model context windows allow. We measured token counts on 73 page snapshots from popular domains (corpus collection is described in @sec:dom-snapshot-corpus). Even after removing invisible subtrees, median visible DOM size remains above 100k tokens; raw snapshots reach 240k tokens at the median and over one million at the maximum. Budget models typically offer around 200k tokens; frontier models mostly stay under one million.

#align(center)[
  #figure(
    caption: [#flex-title([DOM snapshot sizes], [Token counts across 73 page snapshots; compressed = output of get_map_of_dom])],
    table(
      columns: 4,
      inset: 0.5em,
      table.header([Stage], [Mean], [Median], [Max]),
      stroke: (left: none),
      table.vline(stroke: none, start: 0, end: 5),
      [Raw DOM], [339,253], [240,918], [1,338,122],
      [Visible DOM], [162,806], [107,851], [1,028,594],
      [Compressed map], [11,135], [6,613], [107,851],
    ),
    supplement: "TABLE",
  ) <tab:dom-snapshot-sizes>
]

Token counts use tiktoken's `o200k_base` encoding. Passing the full DOM on every request is therefore not viable: many pages do not fit, and those that do consume most of the context budget before any reasoning begins.

=== Noise and non-persistence <sec:baseline-noise-persistence>

Even when a DOM fits, most of its HTML carries no information relevant to a given adaptation request — build-tool comments, framework wrapper elements, repeated list items, and design-system class tokens. A baseline that reads everything forces the model to filter noise on every turn.

On the action side, direct edit instructions do not survive a page reload. Without persistent storage, the system would need to re-run the full read-and-edit pipeline every time the user opens the page, relying on prompt caching or identical model outputs to reproduce the same result. That is slow, costly, and brittle on dynamic single-page applications where content loads after the initial render.

== Internet Shaper <sec:internet-shaper>

Internet Shaper is an agentic system that replaces the naive baseline with two specialized components.

_Perception_ gives the model a compact but navigable view of the page, with a way to retrieve local detail when the overview is not enough. _Action_ records persistent update rules — selector-bound JavaScript that a separate engine re-applies on every load and on DOM mutations — rather than one-shot patches.

The LLM interacts with both components through tools in a fixed explore-then-act loop. It never writes to the live page directly; it reads from a snapshot frozen at request time and appends rules to a store. A browser extension hosts capture, the agent loop, rule storage, and execution. The extension is the deployment shell; the perception–action design is the research object.

== Perception <sec:perception>

=== Problems <sec:perception-problems>

Perception must solve the scale and noise problems that disqualify the read-all baseline.

DOM size is the hard constraint: @tab:dom-snapshot-sizes shows that visible pages routinely exceed practical context limits, and raw HTML is larger still. The representation must shrink snapshots by one to two orders of magnitude while keeping enough hierarchy and component identity for the model to choose targets and construct selectors.

Noise is the second constraint. Production DOMs contain invisible tags, SVG icon paths, HTML comments, high-frequency framework classes, single-child wrapper chains, and long runs of structurally identical siblings. Most of this material is irrelevant to any single user request but dominates token count if left intact.

We also considered alternative comprehension strategies from the web-agent literature. Following @ning_survey_2025's classification into text-based, screenshot-based, and multimodal approaches, screenshot-only input is incompatible with our action model, which targets elements via CSS selectors and JavaScript. The accessibility tree preserves semantics for assistive technologies but strips layout detail users often want to change. Task-specific DOM pruning — as in Prune4Web @zhang_prune4web_2025 — suits localized edits, but many adaptation requests are global: restyling a feed, suppressing a class of distractions, or restructuring layout. We therefore compress the full visible page structurally rather than pruning to a task-specific subset.

=== Solution <sec:perception-solution>

Perception is implemented as a unified DOM compression algorithm exposed through two tools on the same captured snapshot.

`get_map_of_dom()` runs the full pipeline on the snapshot: remove non-visible tags (`head`, `script`, `link`, `style`, `noscript`), strip SVG internals and HTML comments, drop computed-invisible subtrees, keep only identifying attributes (`class`, `id`, `role`, `aria-label`, `label`, `alt`, `type`, `name`, `placeholder`, `title`, `value`, `data-*`), remove class tokens appearing on more than 5% of elements, collapse single-child wrapper chains, truncate runs of three or more similar siblings, and normalize whitespace. The result is a compact structural map — HTML with comments marking collapsed wrappers and deduplicated siblings. Across our corpus this step brings median size from 107,851 tokens to 6,613.

`show_in_dom(query_selector, depth)` retrieves a subtree from the same unprocessed snapshot by CSS selector. A depth argument (default three element levels) limits how many descendant levels are expanded; deeper children are replaced with count comments. When the map omits attributes such as `href`, `src`, or inline styles, or when local structure was truncated, drill-down recovers them without re-sending the full page.

Both tools read the snapshot taken when the user submits a request, so exploration stays consistent even if the live page continues loading. Similar-sibling detection uses tiered class-token comparison and Levenshtein distance on immediate child tag sequences, so near-duplicate cards in feeds collapse while structurally distinct items remain.

== Action <sec:action>

=== Problems <sec:action-problems>

Action must solve the persistence problem that disqualifies direct edits.

A one-shot DOM patch disappears on reload. Re-running the agent on every visit would repeat the full perception cost shown in @tab:dom-snapshot-sizes and depend on the model producing equivalent edits each time — unreliable on pages whose DOM changes between sessions.

The persistence format also limits what kinds of adaptations are expressible. CSS can hide or restyle elements but cannot inspect child content, branch on runtime values, or create conditional flows.

#example[
"Show only videos that are longer than 40 min" on a YouTube playlist page. A persistent rule must read duration text from each item and conditionally hide non-matching entries — logic that CSS and one-shot text replacements cannot express.
]

=== Solution <sec:action-solution>

Action records _update rules_: a CSS selector paired with idempotent JavaScript executed on each matching element. The agent calls `set_update_rule(label, query_selector, logic)` to append rules to a hostname-keyed store. A separate engine applies them after the agent turn completes and on every subsequent page load.

Each rule's logic runs in a sandbox where only the matched `element` is in scope — no `window` or `document`. The system prompt instructs the model to prefer stable selectors (semantic tags, class names, `data-*` attributes), write logic that sets absolute state rather than toggling or accumulating effects, and prefer `display = 'none'` over `remove()` when child content may load asynchronously.

On single-page applications, a `MutationObserver` on `document.body` re-applies rules when new nodes appear, so dynamically loaded content on sites such as YouTube and Instagram still receives adaptations.

We considered a custom transformation language and generated CSS before settling on JavaScript. Frontier models already generate JS reliably for DOM manipulation, and JS covers the conditional logic CSS cannot. A custom language would add parsing cost without clear benefit.

== DOM Snapshot Corpus <sec:dom-snapshot-corpus>

To move from anecdotal DOM sizes to measurable compression, we assembled a corpus of real page snapshots and ran the perception pipeline on each one.

=== Source and filtering <sec:corpus-source>

We started from the top-domain list in the web-unpacked study, which annotates 116 high-traffic sites. We filtered out login- or payment-gated services and adult-industry domains, because manual evaluation might later involve inspecting page screenshots. We kept the top 25 remaining domains by rank.

Several homepages needed manual URL adjustment before crawling: search engines and YouTube were pointed at result pages rather than landing pages, Wikipedia at the English homepage, and Pinterest at a browsable feed. We then crawled same-domain links from each seed URL using a headed browser, semi-automatically accepting cookie banners and manually passing captchas where required.

Further manual filtering removed dead or region-locked services, pages blocked by bot detection, legal pages (terms of service, privacy policy), regional duplicates, and sitemaps. From each surviving domain we sampled the homepage plus three randomly chosen internal pages.

=== Capture and quality control <sec:corpus-capture>

Each selected URL was snapshotted with Playwright. For every page we stored:

+ `raw.html` — the full serialized DOM.
+ `visible.html` — the DOM after removing subtrees that are invisible by computed style (`display: none`, `visibility: hidden`, `opacity: 0`), matching the capture step used in the perception component.
+ A screenshot for optional human review.

Captchas and empty bot-rejection pages were handled in a semi-manual patch pass; snapshots that remained empty or unusable were dropped. The final corpus contains 73 pages across 25 domains.

=== Compression measurements <sec:compression-measurements>

We ran the production `get_map_of_dom` pipeline on each snapshot's `visible.html` and counted tokens with tiktoken's `o200k_base` encoding. Across the corpus:

#align(center)[
  #figure(
    caption: [#flex-title([Corpus compression results], [Token counts over 73 snapshots; compressed = lossless clean + lossy map])],
    table(
      columns: 3,
      inset: 0.5em,
      table.header([Stage], [Mean tokens], [Median tokens]),
      stroke: (left: none),
      table.vline(stroke: none, start: 0, end: 5),
      [Raw DOM], [339,253], [240,918],
      [Visible DOM], [162,806], [107,851],
      [Compressed map], [11,135], [6,613],
    ),
    supplement: "TABLE",
  )
]

Visible capture alone cuts median size by roughly half; the lossy map reduces it by another order of magnitude. This confirmed that a compact initial view plus selective drill-down is necessary rather than optional.

== Heuristic Development <sec:heuristic-development>

Both perception tiers are rule-based rather than learned. Each rule encodes a hypothesis about what DOM information the model needs to author selectors and adaptation logic.

=== Perception heuristics <sec:perception-heuristics>

_Lossless pre-processing_ runs on every DOM handed to the LLM:

+ Remove `head`, `script`, `link`, `style`, and `noscript` — no user-visible structure.
+ Drop computed-invisible subtrees — users do not request changes to content they cannot see.
+ Strip SVG path data while keeping the tag and any accessible title — icons sit inside labeled controls.
+ Remove HTML comments left by build tools — noise in production pages.

_Lossy structural mapping_ produces the agent's initial overview:

+ Keep only attributes needed to identify components: `class`, `id`, `role`, `aria-label`, `label`, `alt`, `type`, `name`, `placeholder`, `title`, `value`, and `data-*`. Drop `href`, `src`, and inline styles from the map; the agent can retrieve them via drill-down.
+ Remove class tokens that appear on more than 5% of elements — empirically, these are framework or design-system tokens with little semantic value.
+ Collapse chains of single-child wrapper elements into a comment — a common artifact of component frameworks.
+ When three or more consecutive siblings share the same tag, id, and similar class and child structure, keep the first and replace the rest with a truncation comment — this handles repeated list items without losing list presence.

Similar-sibling detection uses tiered class-token comparison and Levenshtein distance on immediate child tag sequences, so near-duplicate cards in feeds collapse while structurally distinct items remain.

_Drill-down_ via `show_in_dom(selector, depth)` returns a lossless subtree from the captured snapshot. Depth defaults to three element levels; deeper descendants are replaced with a count comment. This is the recovery path when the map omits attributes the agent needs for a selector.

=== Action heuristics <sec:action-heuristics>

Each update rule pairs a CSS selector with JavaScript executed in a sandbox where only the matched `element` is in scope — no `window` or `document`. System-prompt constraints reinforce:

+ Prefer stable selectors: semantic tags, class names, and `data-*` attributes over deep structural paths.
+ Write idempotent logic that sets absolute state rather than toggling classes or appending text.
+ Prefer `display = 'none'` over `remove()` when logic depends on child content that may load asynchronously — the engine re-applies rules when new nodes appear.

Rules are keyed by hostname and re-applied on every page load. A `MutationObserver` on `document.body` re-runs matching rules on dynamically inserted nodes, which is required for single-page applications such as YouTube and Instagram.

== Evaluation Task Synthesis <sec:evaluation-task-synthesis>

Compression metrics alone do not define adaptation tasks. To evaluate the full agent, we synthesized user requests from the snapshot corpus using a Jobs-to-be-Done (JTBD) pipeline.

We selected 10 snapshots from the corpus with a fixed random seed, excluding pages that failed quality checks. For each snapshot, a separate LLM session (Gemini 3.5 Flash) inspected the page DOM and produced, in three turns:

+ A list of user jobs on the page ("I want to…").
+ Three pairs of opposing user preferences — persistent traits rather than one-off edits.
+ Six concrete edit requests — one per preference side, labeled `1a` through `3b`.

Each request became a _seed sample_: a `task.json` describing the prompt and JTBD context, plus copies of the snapshot's `raw.html` and `visible.html`. This yields 60 seed tasks grounded in real pages and varied user intents. Downstream ablation pipelines (see Implementation) run different perception–action combinations on these seeds for controlled comparison.

== System Design Summary <sec:system-design-summary>

The resulting architecture is a tool-calling agent @noauthor_tool_nodate with two component groups:

+ _Perception tools_ — `get_map_of_dom()` returns the lossy map; `show_in_dom()` returns a lossless slice. Both read a frozen snapshot.
+ _Action tool_ — `set_update_rule()` records a persistent selector + logic pair without touching the live DOM.

The agent follows a fixed explore-then-act workflow: map first, drill down where needed, then emit rules until the turn ends. Prompt caching is applied to the system prompt and the map result to reduce cost on multi-turn sessions.

A browser extension wraps the agent for deployment: it captures snapshots, hosts the LLM loop, stores rules in `localStorage`, and applies them in the page's main JavaScript world. Fiber, a small RPC framework, handles cross-context calls between the extension's isolated scripts, background worker, and the page runtime. Details appear in the Implementation section.

== User Testing Protocol <sec:user-testing-protocol>

The goal of the trial is to assess whether the work addresses the originally stated problem:

#quote[
How can adaptive generative interfaces counteract systematically misaligned business and user goals in user interfaces by re‑aligning the interface with a user's articulated goal?
]

More precisely — can the solution adequately solve the problem in at least a single case of a misaligned interface?

The setup is a Dia (Chromium) browser on the researcher's laptop with an extension built from the current version of code (commit f1ae9bbfbc02c663c336e78c4772b2378ea9e77d).

The questionnaire follows (experiment language — Russian):

+ Встречались ли вы со случаями, когда интерфейс какого-либо сайта затрудняет его использование для ваших личных целей и задач, то есть не подходил вам на сто процентов?
   + No — end of test.
+ Что это был за сайт и как именно интерфейс вам мешал? Вспомните один любой случай.

The respondent proceeds to open the website. The researcher then opens the browser extension and instructs the user on how to use it. The respondent is invited to use the extension to customize the website. After customization, a questionnaire on the result follows:

+ Did the transformation occur? (set by the researcher)
+ Соответствует ли новая версия сайта вашим задачам больше, чем оригинальная?
+ Насколько вы оцените новую версию сайта по шкале от -3 до +3, где -3 — новая версия сайта сильно менее полезна, чем оригинальная, 0 — новая версия сайта не отличается от оригинальной в контексте решения личных задач, +3 — новая версия сайта сильно более полезна, чем оригинальная.

The testing was conducted in an informal, uncontrolled setting and cannot be used to compare different methods, models, or approaches. What it does show is the feasibility of the approach and that it can be useful for certain tasks.

== AI Usage Disclosure <sec:ai-usage-disclosure>

AI agents via Cursor Editor and Claude Code CLI were used extensively in writing the prototype code. All generated code was fully reviewed and verified manually, and all architectural decisions were made explicitly by the authors.

= Implementation <sec:implementation>

This section describes the final agentic system. The perception and action components are implemented as LLM tools plus a rules engine; the browser extension provides capture, storage, and execution. Source code is listed in the appendix.

== Overview <sec:overview>

#align(center)[
  #figure(
    image("img/system.png"),
    caption: [Internet Shaper architecture: agentic core with extension wrapper],
  )
]

At runtime the system separates three concerns:

+ An _agent loop_ that calls perception and action tools until the model stops.
+ A _perception pipeline_ that captures, cleans, and compresses DOM snapshots on demand.
+ An _action engine_ that stores update rules and applies them to the live page on load and on DOM mutations.

The LLM never writes to the live DOM. Perception tools return text from a snapshot frozen at request time; the action tool appends to a rules store; the engine applies collected rules after the agent finishes. The user can inspect, enable, or disable stored rules through the extension UI.

== Agent Loop <sec:agent-loop>

We implement the loop with Anthropic's tool-use harness: system prompt, conversation history, and tool definitions go to the model; each `tool_use` block is executed locally and returned as a `tool_result`; the loop repeats until the model emits no tool calls or `stop_reason === "end_turn"`.

The model used in the prototype is Claude Sonnet 4.6. Because we evaluate a novel application rather than benchmark models themselves, closed-source choice does not threaten reproducibility of the architectural claims — though it does prevent cross-model comparison, which we treat as out of scope @palmer_using_2024.

=== Workflow <sec:workflow>

The system prompt enforces a fixed exploration-then-action sequence:

+ Call `get_map_of_dom()` before any other tool.
+ Identify candidate elements from the map.
+ Call `show_in_dom(selector, depth)` when selector construction or child structure requires detail not present in the map.
+ Emit one or more `set_update_rule(label, query_selector, logic)` calls.
+ Reply to the user when no further tools are needed.

Prompt caching covers the system prompt and the map result — typically the largest context block — to reduce cost on follow-up turns.

== Perception Component <sec:perception-component>

Perception is exposed as two tools backed by a shared pipeline.

=== Snapshot capture <sec:snapshot-capture>

When the user submits a request, the extension serializes the page DOM and passes it through visibility filtering: subtrees with `display: none`, `visibility: hidden`, or `opacity: 0` are removed using computed styles, not just inline attributes. The result is the working snapshot for all subsequent tool calls in that session.

=== `get_map_of_dom()` <sec:get-map-of-dom>

This tool returns the lossy structural map. Processing stages:

+ _Lossless clean_ — remove non-visible tags (`head`, `script`, `link`, `style`, `noscript`), strip SVG internals, drop HTML comments, and prune invisible subtrees (redundant with capture but applied again for offline replay on stored HTML).
+ _Lossy compact_ — attribute whitelist, high-frequency class removal (threshold: 5% of elements), wrapper-chain collapse, similar-sibling truncation with tiered class matching and child-tag Levenshtein comparison.
+ _Whitespace normalize_ — collapse inter-element whitespace except inside `pre`, `textarea`, `script`, and `style`.

The output is HTML with truncation comments marking collapsed wrappers and deduplicated siblings. It is intended as a navigable overview, not an editable source of truth.

=== `show_in_dom(query_selector, depth)` <sec:show-in-dom>

This tool parses the captured snapshot, selects a node, and returns its subtree after lossless cleaning only — no lossy compaction. The `depth` argument limits how many descendant levels are expanded; omitted depth defaults to three. Deeper children are replaced with `<!-- -N children -->` comments.

Drill-down recovers attributes stripped from the map (`href`, `src`, inline styles) and exposes local structure the map may have truncated. Because both tools read the same frozen snapshot, repeated drill-down calls remain consistent even if the live page continues loading.

== Action Component <sec:action-component>

Action is a single authoring tool plus a runtime engine that the agent does not call directly.

=== `set_update_rule(label, query_selector, logic)` <sec:set-update-rule>

Each call appends a rule object `{ label, query_selector, logic, enabled }` to a hostname-keyed list in `localStorage`. Parameters:

+ `label` — short description for the rule-management UI.
+ `query_selector` — CSS selector matching all elements the logic should touch.
+ `logic` — JavaScript body executed with `element` bound to each match; no globals.

Rules are not applied immediately. They enter the store and run when the agent turn completes, so the user sees a batch of pending changes.

#example[
Rule for www.google.com:
On `.YzCcne` query selector
Apply `element.style.display = 'none'`
]

=== Rules engine <sec:rules-engine>

On page load, `app.ts` reads stored rules and invokes `applyRules` via main-world injection so rule logic sees the real `document`. Each rule's logic is wrapped in a function, compiled through Trusted Types where the host page requires it, and executed on every current and future match for its selector.

For single-page applications, a `MutationObserver` on `document.body` re-applies rules when new nodes appear. Per-element child observers with a short debounce handle cases where content populates after the parent node is inserted — common on YouTube and Instagram feeds.

The sandbox intentionally excludes `window` and `document` from rule logic to limit blast radius, though this also prevents rules from fetching external APIs unless injected logic is relaxed in future work (the Discussion section notes emergent fetch behavior when models circumvent this constraint via other paths).

== Ablation Pipelines <sec:ablation-pipelines>

To isolate the perception and action components, we run six agent configurations on the synthesized seed tasks:

#align(center)[
  #figure(
    caption: [Agent ablation conditions],
    table(
      columns: 3,
      inset: 0.5em,
      table.header([Pipeline], [Perception], [Action]),
      stroke: (left: none),
      table.vline(stroke: none, start: 0, end: 7),
      [Baseline], [full DOM (`get_dom`)], [immediate patch (`edit`)],
      [Engine only], [full DOM], [persistent rules],
      [Map only], [map + drill-down], [immediate patch],
      [Full], [map + drill-down], [persistent rules],
      [Full (Sonnet)], [map + drill-down], [persistent rules, Claude Sonnet 4.6],
    ),
    supplement: "TABLE",
  )
]

Baseline and map-only swap perception strategy while keeping a one-shot edit action. Engine-only and full swap persistence while keeping full-DOM or compact perception respectively. The full pipeline matches the production prototype; results are reported in the Results section.

== Deployment Wrapper <sec:deployment-wrapper>

The agentic core is hosted in a Chromium browser extension. Extensions can read and write any tab's DOM without site cooperation, which satisfies the deployment constraint from §Design Goals, but they add no algorithmic behavior beyond capture, RPC, and rule injection.

Browser extensions run code in isolated worlds that cannot call each other directly: content scripts, a background service worker, and the page's main JavaScript context. Fiber, a small framework built for this project, wraps Chrome APIs in an RPC proxy so calling `executeInMainWorld` from a content script behaves like a local function while messages cross process boundaries. Trusted Types policies registered in the main world allow dynamic compilation of rule logic on strict Content Security Policy sites such as YouTube.

The overlay UI — prompt input, rule manager, status — is implemented with Lit signals in the content script. These concerns are orthogonal to the perception–action design and exist to make the prototype usable.

== Security Concerns <sec:security-concerns>

The prototype in its current state has several vulnerabilities and must not be used in a public setting:

- It stores API keys in the browser's storage in plain, un-encoded form.
- It has no protection against prompt injections that can be present in page content. This can enable severely harmful behavior up to remote code execution, as the rule application sandbox can fetch data from any URL.

= Results <sec:results>

== Browser Extension <sec:browser-extension>

== User Testing <sec:user-testing>

== DOM Compression <sec:dom-compression>

=== Lossless <sec:lossless>

=== Lossy <sec:lossy>

= Discussion <sec:discussion>

== Emergent Behaviors <sec:emergent-behaviors>

Even more complex queries produced unexpectedly positive results, with the agent exhibiting emergent behavior that was not planned for:

- When asked to "add a cat to the page", it called an external API dedicated to serving a random cat image and injected a new image element into the page.
  > Cat image added — a random cat image (fetched from #link("http://cataas.com")[cataas.com]) has been inserted into the center of the page, with rounded corners and a soft shadow.
- For requests more complex than "remove element A", the agent immediately used variables, conditionals, and accessed properties of child nodes from the parent.
- When asked to turn a list of articles on Substack into a grid, it produced a set of approximately seven rules, adapting not only the layout but also the cards themselves — their headers, thumbnails, and action menus — all to better fit the new grid context. This example shows the agent's high-level understanding of tasks rather than mechanical rule application.
- When asked to restructure the page in a major way, moving sections around, the agent created a single rule for the `main` element containing all the logic, rather than many individual rules.

= Conclusion <sec:conclusion>

== Limitations <sec:limitations>

+ The LLM is provided a single screen in an application and is not aware of the multi-screen context. The risk is that it might produce adaptations incompatible with the overall flow on more complex tasks.
+ The system can only influence a single screen, making construction of multi-step flows and app-wide modifications difficult.
+ Rules are applied to all pages that match the domain; no URL path matching occurs. As a result, rules sometimes unintentionally apply to pages they were not intended for. This was an architectural decision that helps handle dynamically constructed pages (e.g. `domain.com/user/<id>`). Future work can investigate the feasibility of requiring a URL mask for each rule, or a similar approach to limit unexpected rule applications.
+ The LLM has access only to data visible to the user and present in the DOM. For a subset of interactions — specifically those involving dynamically loaded data — access to the underlying JavaScript data structures could be helpful. The same applies to API actions, of which the model has no context at all.


#bibliography(title: "Bibliography cited", "refs.bib", style: "ieee")

#show: appendix

= Source Code

*WIP*