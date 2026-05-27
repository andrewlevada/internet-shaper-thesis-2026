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
(*Section status: WIP, Outdated*)

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
4. A unified DOM compression algorithm with selective drill-down for agent perception.

We also conduct a proof-of-concept user testing with N=?, showing feasibility of the interface adaptation in re-aligning user interfaces.

= Related work <sec:related-work>

We explore similar solutions that demonstrate UI generation and adaptation, from which a gap becomes apparent: very few interface adaptation methods exist.

== Generative Adaptation of UI <sec:generative-adaptation-of-ui>

== Generation of UI <sec:generation-of-ui>

== Adaptation of UI <sec:adaptation-of-ui>

Nearly all existing UI adaptation solutions require implementation by the application itself or its developers, with renders them unapplicable for our user-initiated setting. This section covers only adaptation methods that are controlled by the end user, of which few exist.

= Implementation <sec:implementation>
(*Section status: Very nice and accurate!*)

This section describes how we designed and built the agentic system at the core of Internet Shaper. We begin from the user-side adaptation problem, explain why a naive read-and-edit baseline is not sufficient, and present the perception and action components that address those failures. The perception and action components are implemented as LLM tools plus a rules engine; the browser extension provides capture, storage, and execution. Source code is listed in the appendix.

== Design Goals <sec:design-goals>

As introduced above, interfaces are rarely perfect for every user. Even well-designed products leave gaps between a person's actual tasks and what the UI optimizes for. In the worst cases, gray and dark patterns deliberately misalign business incentives with user goals, making the interface harder to use for the tasks the user actually cares about.

Most adaptive interface research assumes the application or its developers implement customization hooks. Our approach is different: it is _user-sided_. The user adapts software they already use, without any cooperation from the people who built it. The system operates on pages that were not designed to be modified.

To reach those pages, we host the prototype in a browser extension. Extensions are uniqly positioned to read and write the DOM of any open tab. The page's structure and content are available to the system as HTML — the same representation the browser uses to render what the user sees. This gives us freedom that is miles ahead of other platforms.

Any adaptation system that chnages the UI does 2 sequential steps conceptually. First, it must somehow _read_ the page: capture context, reason about structure, or even decompose the user's request into concrete targets. Second, it must _apply_ changes to transform the paged into a desired state. These steps are both minimal and required. Throughout this paper we call these two parts _perception_ and _action_.

== Baseline Limitations <sec:baseline-limitations>

The straightforward design is to read the full page HTML into the model, then apply direct text or DOM edits. Two practical limits make this baseline infeasible for real applications.

DOM snapshots from real websites are far larger than model context windows allow. We measured token counts on 73 page snapshots from popular domains (corpus collection is described in @sec:dom-snapshot-corpus). Even after removing invisible subtrees, median visible DOM size remains above 100k tokens; raw snapshots reach 240k tokens at the median and over one million at the maximum.

#align(center)[
  #figure(
    caption: [#flex-title([DOM snapshot sizes], [Token counts across pages from top traffic websites])],
    table(
      columns: 4,
      inset: 0.5em,
      table.header([Stage], [Mean], [Median], [Max]),
      stroke: (left: none),
      table.vline(stroke: none, start: 0, end: 5),
      [Raw DOM], [339,253], [240,918], [1,338,122],
      [Visible DOM], [162,806], [107,851], [1,028,594],
    ),
    supplement: "TABLE",
  ) <tab:dom-snapshot-sizes>
]

It is widly knows that over-saturated contexts produce worse results in general task performance on LLMs (*WIP*: citation needed). Passing the full DOM on every request is therefore not viable: many pages would not fit, and those that do consume most of the context budget before any reasoning begins.

Even when a DOM fits, most of its HTML carries no information relevant to a given adaptation request — build-tool comments, framework wrapper elements, repeated list items, and design-system class tokens. A baseline that reads everything forces the model to filter noise on every turn.

On the action side, direct edit instructions do not survive a page reload. Without persistent storage, the system would need to re-run the full read-and-edit pipeline every time the user opens the page, relying on prompt caching or identical model outputs to reproduce the same result. That is slow, costly, and brittle on dynamic single-page applications where content loads after the initial render.

== Internet Shaper <sec:internet-shaper>

#align(center)[
  #figure(
    image("img/system.png"),
    caption: [Internet Shaper architecture: agentic core with extension wrapper],
  )
]

Internet Shaper is an agentic system that makes user-side adaptation of web UIs possible with two specialized components.

_Perception_ is driven by a _DOM Compaction algorithm_ gives the model a compact view of the page with the relative structure of elements fully preserved, with a way to retrieve local detail when the overview is not enough.

_Action_ is powered by _Rules Engine_. Instead of direct edits, it records persistent update rules — selector-bound JavaScript that is re-applied on every load and on DOM mutation.

The LLM interacts with both components through tools in a fixed explore-then-act loop. It never writes to the live page directly; it reads from a snapshot frozen at request time and appends rules to a store.

== Perception <sec:perception>

An ideal perception interface must meet two criteria that the read-all baseline cannot (@sec:baseline-limitations). _Scale_: the representation must fit within practical context limits even though median visible DOMs already exceed 100k tokens (@tab:dom-snapshot-sizes). _Signal density_: it must shed the request-irrelevant bulk of production HTML — invisible markup, framework boilerplate, wrapper chains, and repetitive siblings — while preserving enough structure to locate and reason about adaptation targets.

Perception is implemented as a single DOM compression pipeline exposed through two complementary tools on the same captured snapshot: `get_map_of_dom` returns a site-wide structural map; `show_in_dom` retrieves local detail from the uncompressed snapshot when the map is not enough.

=== DOM Compression Algorithm <sec:dom-compression-algorithm>

The compression pipeline runs in two stages: deterministic pre-cleaning, then structural compaction with a mix of straightforward filters and similarity heuristics. Both stages operate on the visible DOM captured at request time (subtrees with `display: none`, `visibility: hidden`, or `opacity: 0` are already removed during capture, as in the evaluation corpus).

_Stage 1 — pre-cleaning_ (deterministic). Before any structural transformation, the pipeline removes markup that carries no adaptation-relevant semantics: `head`, `script`, `link`, `style`, and `noscript` elements; build-tool HTML comments; and SVG path data (keeping each `svg` tag and its `title` for accessibility context). This step is rule-based and does not depend on page-specific thresholds.

_Stage 2 — structural compaction_ (mixed). The cleaned tree is parsed and transformed in a fixed order:

+ _Attribute filtering_ (deterministic) — each element keeps only `class`, `id`, `role`, `aria-label`, `label`, `alt`, `type`, `name`, `placeholder`, `value`, and `data-*` attributes; all others (including `href`, `src`, and inline styles) are dropped. Empty attribute values are removed afterward.
+ _High-frequency class removal_ (heuristic) — class tokens appearing on more than 5% of elements are stripped tree-wide. The assumption is that very common classes are design-system scaffolding rather than component identifiers.
+ _Single-child wrapper collapse_ (heuristic) — chains of elements with exactly one element child and no significant direct text are flattened: intermediate nodes are removed and replaced by an HTML comment recording how many wrappers were collapsed and which class or attribute tokens were lost. Chains stop at leaf elements or at nodes that carry inline text.
+ _Repeated-sibling truncation_ (heuristic) — among groups of three or more consecutive siblings deemed structurally similar, only the first is kept; the rest are removed and annotated with a comment giving the truncated count. Similarity requires matching tag name and `id`, approximately matching class tokens (symmetric-difference thresholds scale with class-list length), and approximately matching sequences of immediate child tag names (compared via Levenshtein distance with length-dependent tolerances).
+ _Whitespace normalization_ (deterministic) — insignificant text nodes are removed and remaining text is collapsed to single spaces, except inside `script`, `style`, `pre`, and `textarea` ancestors.

The result is a compact HTML map that preserves relative hierarchy and enough identifying tokens to locate targets, at the cost of omitting repeated list items and decorative wrapper depth. Corpus measurements (@sec:compression-measurements) show median token count falling from 107,851 (visible DOM) to 6,613 (compressed map), showing a 16x reduction in token count.

=== Selective Drill-Down <sec:selective-drill-down>

Because compaction is intentionally lossy for scale, the agent can call `show_in_dom(query_selector, depth)` on the _original_ snapshot — not the compressed map. The tool resolves the selector against the full captured HTML, clones the matched subtree, and prunes descendants beyond a configurable depth (default three element levels below the matched node). At the depth boundary, nested elements are replaced by a comment of the form `<!-- -N children -->`, while direct text on retained nodes is kept intact.

This complements the map in two ways. First, it restores attributes and child structure removed or summarized during compaction — for example, `href` values, inline styles, or the second item in a truncated sibling group. Second, it bounds local context: the agent requests only the subtree it needs rather than reverting to a full-DOM read. Increasing `depth` trades token cost for completeness when a rule must inspect deep descendants (as in the YouTube duration example in @sec:action).

=== Alternative

We also considered alternative comprehension strategies from the web-agent literature. Following @ning_survey_2025's classification into text-based, screenshot-based, and multimodal approaches, screenshot-only input is incompatible with our action model, which targets elements via CSS selectors and JavaScript. The accessibility tree preserves semantics for assistive technologies but strips layout detail users often want to change. Task-specific DOM pruning — as in Prune4Web @zhang_prune4web_2025 — suits localized edits, but many adaptation requests are global: restyling a feed, suppressing a class of distractions, or restructuring layout. We therefore compress the full visible page structurally rather than pruning to a task-specific subset.

== Action <sec:action>

An ideal action interface must meet two criteria that one-shot DOM edits cannot (@sec:baseline-limitations). _Persistence_: changes must survive reload and re-apply on dynamic pages without re-running the full perception pipeline or depending on identical model outputs each visit. _Expressiveness_: the mechanism must cover the same edit space direct manipulation allows — styling, interaction changes, and conditional logic over runtime content — not merely the subset CSS can hide or restyle.

#example[
"Show only videos that are longer than 40 min" on a YouTube playlist page. A persistent rule must read duration text from each item and conditionally hide non-matching entries — logic that CSS and one-shot text replacements cannot express.
]

We considered a custom transformation language and generated CSS before settling on JavaScript. Frontier models already generate JS reliably for DOM manipulation, and JS covers the conditional logic CSS cannot. A custom language would add parsing cost without clear benefit.

=== Rules Engine <sec:rules-engine>

An _update rule_ is a persistent, selector-bound transformation stored as a small record: a human-readable `label` (shown in the rule manager UI), a CSS `query_selector`, and a `logic` string of JavaScript. An optional `enabled` flag allows the user to toggle rules without deleting them. Rules are scoped to the page hostname and persisted in extension storage; on each visit the extension loads the stored set and applies it before the user interacts with the page.

The LLM never executes rule logic during the agent loop. Instead, the `set_update_rule` tool appends a rule to an in-memory list. The tool schema exposes exactly the three fields above and documents the execution contract: the logic runs once per matched element with only an `element` parameter in scope — no `window`, `document`, or other globals. The system prompt further requires idempotent logic (repeated application must converge to the same state), deterministic side effects (set absolute values rather than toggle or append), and graceful handling of not-yet-loaded child content (early return when a value is missing, relying on re-application once content appears). Conditional hiding should prefer `element.style.display = 'none'` over `element.remove()` so the rule can still run when descendants populate.

After the agent loop completes, the new rules are merged into storage and passed to `applyRules`, which injects an applier function into the page's main JavaScript world via the extension's RPC layer. For each enabled rule, the engine queries `document.querySelectorAll`, wraps the logic as `(function(element) { ... })`, and compiles it through a Trusted Types policy where the host page requires one (needed on strict Content Security Policy sites such as YouTube). Each matching element is processed at most once per rule via a per-selector weak set; a `MutationObserver` on `document.body` re-applies rules to newly inserted nodes, and a short-lived child observer debounces re-runs when descendants of a matched element change — covering single-page applications that hydrate content after the initial render.

From the model's perspective, a rule is therefore a declarative target (`query_selector`) plus imperative body (`logic`); from the runtime's perspective, it is a recurring DOM transformation that survives reloads and dynamic updates without re-invoking the LLM.

== Agent Workflow <sec:agent-workflow>

The system prompt enforces a strict perception-before-action sequence on every user request. When the agent loop starts, the extension captures a DOM snapshot (`document.documentElement.outerHTML`) and passes it to the tool executor; all perception tools read from this frozen copy rather than the live page. The model then follows this sequence:

+ Call `get_map_of_dom()` before any other tool.
+ Identify candidate elements relevant to the user's request from the returned map.
+ Call `show_in_dom(query_selector, depth)` when selector construction or local structure requires detail absent from the map — for example, distinguishing two elements that collapsed to the same outline, or reading `data-*` values needed for a conditional rule.
+ Emit one or more `set_update_rule(label, query_selector, logic)` calls.
+ Reply to the user when no further tools are needed; the loop continues until the model produces a message without tool calls or the stop reason is `end_turn`, at which point the collected rules are persisted and applied to the live page.

This ordering prevents the model from committing to selectors before it has a structural overview, while still allowing targeted inspection where the compressed map is insufficient. Prompt caching is applied to the system prompt and the `get_map_of_dom` result — typically the largest context item — so multi-turn exploration stays economical. There is also a limit = 1 on the get_map_of_dom calls by the agent to prevent context contamination with duplicate information. We found this is useful during evaluation to prevent agents from trying to get the DOM again to see the review the changes.

== The Browser Extension

The agentic core is hosted in a Chromium browser extension. It captures snapshots, hosts the LLM loop, stores rules in `localStorage`, and applies them in the page's main JavaScript world. Extensions can read and write any tab's DOM without site cooperation, which satisfies the deployment constraint from @sec:design-goals, but they add no algorithmic behavior beyond capture, RPC, and rule injection.

Browser extensions run code in isolated worlds that cannot call each other directly: content scripts, a background service worker, and the page's main JavaScript context. Fiber, a small framework built for this project, wraps Chrome APIs in an RPC proxy so calling `executeInMainWorld` from a content script behaves like a local function while messages cross process boundaries. Trusted Types policies registered in the main world allow dynamic compilation of rule logic on strict Content Security Policy sites such as YouTube.

The overlay UI — prompt input, rule manager, status — is implemented with Lit signals in the content script. These concerns are orthogonal to the perception–action design and exist to make the prototype usable.

== Security Concerns <sec:security-concerns>

The prototype in its current state has several vulnerabilities and must not be used in a public setting:

- It stores API keys in the browser's storage in plain, un-encoded form.
- It has no protection against prompt injections that can be present in page content. This can enable severely harmful behavior up to remote code execution, as the rule application sandbox can fetch data from any URL.

= Methods <sec:methods>
(*Section status: Fully unreviewed, first draft*)

This section covers the data collection and processing piplines, evaluation task synthesis, and the evaluation process itself.

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
    caption: [#flex-title([Corpus compression results], [Token counts over 73 snapshots; compressed = production `get_map_of_dom` output])],
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

Visible capture alone cuts median size by roughly half; the compressed map reduces it by another order of magnitude. This confirmed that a compact initial view plus selective drill-down is necessary rather than optional.

== Evaluation Task Synthesis <sec:evaluation-task-synthesis>

Compression metrics alone do not define adaptation tasks. To evaluate the full agent, we synthesized user requests from the snapshot corpus using a Jobs-to-be-Done (JTBD) pipeline.

We selected 10 snapshots from the corpus with a fixed random seed, excluding pages that failed quality checks. For each snapshot, a separate LLM session (Gemini 3.5 Flash) inspected the page DOM and produced, in three turns:

+ A list of user jobs on the page ("I want to…").
+ Three pairs of opposing user preferences — persistent traits rather than one-off edits.
+ Six concrete edit requests — one per preference side, labeled `1a` through `3b`.

Each request became a _seed sample_: a `task.json` describing the prompt and JTBD context, plus copies of the snapshot's `raw.html` and `visible.html`. This yields 60 seed tasks grounded in real pages and varied user intents. Downstream ablation pipelines (@sec:ablation-pipelines) run different perception–action combinations on these seeds for controlled comparison.

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

= Results <sec:results>

== Browser Extension <sec:browser-extension>

== User Testing <sec:user-testing>

== DOM Compression <sec:dom-compression>

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