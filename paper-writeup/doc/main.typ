= Introduction <sec:introduction>

== Background <sec:background>

Designers and developers build user interfaces to make interactions with tech simpler and easier. Designers generally strive to make the UI as usable as possible for each user @hancock_hedonomics_2005 @yusop_revised_2020; nevertheless, two structural limitations undermine this alignment:
- Intrinsically, designers cannot feasibly plan interfaces for every single user's specific needs and jobs. With constrained resources, even good interfaces are usually not perfect for each user.
- On the other, more bleak side, gray and dark patterns systematically misalign system and user goals. This happens when business and user goals diverge, and the interface ends up being less helpful and more intrusive @timms_all_2025 @baroni_deceptive_2024 @potel-saville_dark_2023.

These two problems make interfaces misaligned with users' needs — undermining the core of design practice. This is the problem we begin to tackle with this thesis.

User interfaces can be made adaptive and customizable to cater to specific users' needs. However, customization and especially automatic adaptation of UIs require the developer or designer to implement them. As we see in the industry, these methods are not widely adopted except for select adaptivity dimensions — iOS and Android apps commonly react to dynamic type accessibility settings by changing the layout of the app to better display content with larger text, and websites are almost always made responsive to screen sizes. But as a way of mitigating misaligned interfaces, the adaptive-interface approach is not really used.

Few works take a different approach and try to make interfaces malleable by end users @litt_end-user_2020 @katongo_towards_2021. In this thesis we build upon the ideas they introduce. We want to realize the vision of individually tailored user interfaces, shared by many UX practitioners @nng_generative_nodate @noauthor_introducing_nodate, made possible by recent advances in LLM capabilities.

== Internet Shaper <sec:internet-shaper-intro>

We design, build, and evaluate Internet Shaper — an agentic system wrapped in a browser extension that can change web pages from natural-language requests. It works directly on the page in the user's browser and does not need access to the website's source code. These changes are persistent across sessions and are powerful enough to restyle, hide, or change elements and whole layouts, or even bring new, although limited, functionality to the website.

In our evaluation we show how this system enables user-controlled adaptations of existing web interfaces and can function as a way for users to actively realign UIs they use with their needs and interests.

Our contributions are as follows:

1. Internet Shaper as a whole and its two critical components: a DOM compression algorithm for perceiving web pages, and the Rules Engine for applying changes to the webpage in a persistent way
2. A pipeline that can create datasets with user-sided natural-language edit requests grounded in user personas and jobs
3. An evaluation of Internet Shaper on a dataset gathered from that pipeline

= Related work <sec:related-work>

HCI practitioners have long pursued interfaces that adapt to individual users or give users direct control over customization. @lee_towards_nodate reviews 127 generative-UI publications and argues the field is shifting from designer-only tooling toward interfaces generated or reshaped around individual tasks. @nng_generative_nodate makes a similar case in industry terms, describing generative UI as a move from designing for many users to tailoring outcomes for one.

We distinguish two adaptation regimes along when and who initiates change. In _design-time_ adaptation, developers plan and implement adaptive or customizable behavior while the application is still being built; at use time the shipped product either adapts on its own or offers customization the developers designed into it. In _just-in-time_ adaptation, the user encounters a fixed interface — typically a third-party page that was not built to change — and initiates modification in response to an articulated goal. Internet Shaper targets the second regime.

The clearest example of a design-time adaptation method is ReLay @kim_-situ_2026, a browser probe that infers browsing intent and automatically adjusts information hierarchy, granularity, and session ordering while the user reads. In a two-phase study, participants accepted these in-situ changes when they remained transparent, consistent, and easily reversible. ReLay shows that intent-responsive layout can improve browsing, but it still depends on a researcher-built adaptive shell.

That design-time constraint is the central limitation of existing methods. If developers never implement adaptive or customizable behavior, end users cannot change the interface at all. In practice, such features are rarely prioritized outside a few well-resourced dimensions such as responsive layout or platform accessibility settings @lu_ai_2024. Adaptive interfaces therefore do little to help users realign hostile or misaligned third-party sites they already depend on.

A second line of work lets users reshape interfaces around their tasks, but still inside systems that researchers or product authors control. @min_malleable_2025 introduces malleable overview–detail interfaces: end users can change content, composition, and layout of a common UI pattern, including AI-assisted attribute manipulation between views. The paper demonstrates demand for task-aligned presentation, but the customization machinery is built into author-controlled design probes, not retrofitted onto opaque third-party DOM. @cao_generative_2025 generates interfaces from task-driven data models that users can extend through natural language and direct manipulation. It shares our interest in interfaces that follow the user's task, but requires authors to implement the generative data-model layer up front.

@wang_enabling_2023 shows that a single LLM, with prompting alone, can support diverse conversational interactions with mobile UIs without task-specific training datasets. It establishes NL as a viable UI control channel, but targets mobile applications with developer-provided screen representations rather than arbitrary web pages accessed through a browser extension. @tanner_poirot_2019 gives designers a graphical web inspector that lowers the cost of style edits compared to browser developer tools. It improves professional design workflows during creation, not end-user just-in-time adaptation of live third-party sites at use time. @long_portfoliomentor_2023 presents an IDE-embedded AI companion that helps students build interactive portfolio UIs from natural-language prompts. It shows generative reshaping from articulated intent, but in an authoring environment the user controls rather than on websites they merely visit. @jeong_canvas_2025 benchmarks vision-language models that operate design tools through sequential tool invocations. It evaluates model capacity to manipulate UI design files, which is orthogonal to transforming rendered third-party pages in the user's browser.

A related malleable-web lineage treats live pages as editable data rather than fixed surfaces. @litt_end-user_2020 introduces Wildcard, a browser extension that syncs a spreadsheet-like table to scraped website data so end-user table edits propagate back to the live page. It is foundational evidence that production websites can be customized without source access, but its spreadsheet-and-formula model is narrower than open-ended natural-language goals and does not provide our cross-session rules engine. @katongo_joker_2021 unifies web extraction and augmentation in one spreadsheet formula language with programming-by-demonstration on DOM elements. It reduces the separation between reading and changing a page, yet still asks users to think in formulas rather than goals and lacks persistent selector-bound JavaScript rules. @katongo_towards_2021 lets end users create, extend, and repair site adapters by demonstration instead of relying on pre-built programmer-written adapters. That direction is directly relevant to reducing manual wrapper authorship; Internet Shaper replaces demonstrated adapters with LLM perception over a compressed DOM. @lin_end_user_2009 presents Vegemite, which combines spreadsheet programming and demonstration to let end users build cross-site web mashups. It established early malleable-web programming, but targets mashup composition across sites rather than durable transformation of one page the user returns to repeatedly.

Far fewer systems give end users tools to adapt existing web interfaces they do not own. This end-user web adaptation literature is the closest prior work to Internet Shaper.

@huynh_enabling_2006 presents Sifter, a browser extension that auto-scrapes list data and adds in-page sort and filter controls as if they were native site features. It demonstrates the scrape-then-augment pattern on live DOM, but limits scope to list filtering and does not support open-ended natural-language goals or persistent rules. @diaz_language_2013 defines Sticklet, a declarative JavaScript grammar for end-user web augmentation aimed at both producers and consumers of modifications. It addresses the same browser-side augmentation problem we face, but relies on manually authored augmentation scripts rather than LLM-generated rules.

@diaz_web_2016 describes WebMakeup, a Chrome extension that lets users attach widgets to clicked DOM nodes and rearrange page fragments visually. It shows direct page modding without natural language, but its visual editing model is fragile on changing sites and does not support conditional logic over runtime content. @aldalur_mawa_2021 presents MAWA, a mobile Firefox extension with a visual DSL for removing and moving page content to improve mobile reading. It confirms that extension-based DOM rewriting is practical on real sites, but focuses on layout-oriented mobile augmentation rather than goal-driven NL adaptation with logic rules. @nebeling_crowdadapt_2013 enables crowdsourced web page adaptation through direct manipulation of layout — moving, resizing, hiding blocks, and changing typography — for individual viewing conditions. It supports layout personalization without scripting, but produces shared crowd variants rather than private, hostname-scoped rules the individual user owns. @santana_continuous_2019 personalizes websites continuously using selector–template pairs: regex-like selectors over interaction logs paired with JavaScript template skeletons, validated in a long-term field study. 

@kim_stylette_2022 presents Stylette, a browser extension that maps natural-language styling goals to CSS property palettes using an LLM and a large web-component corpus. It is our closest contemporary peer because it combines extension deployment, live DOM access, natural language, and an LLM; however, it focuses on CSS appearance, does not persist behavioral rules across reloads in the way our engine does, and cannot express conditional logic such as hiding items based on parsed page content. We therefore build upon the limitations this paper acknowledges.

Current end-user adaptation methods remain limited relative to our goals. Changes are often ephemeral, scoped to appearance or layout, or tied to manually authored adapters rather than open-ended user goals @kim_stylette_2022 @nebeling_crowdadapt_2013 @huynh_enabling_2006 @santana_continuous_2019. Like this prior work, Internet Shaper is deployed as a browser extension that reads the live DOM. We extend the paradigm with LLM-driven perception over compressed page structure and a rules engine that persists selector-bound JavaScript, including conditional logic that CSS-only or one-shot edits cannot express.

= Implementation <sec:implementation>

This section describes how we designed and built the agentic system at the core of Internet Shaper. We begin from the user-side adaptation problem, explain why a naive read-and-edit baseline is not sufficient, and present the perception and action components that address those failures. The perception and action components are implemented as LLM tools plus a rules engine; the browser extension provides capture, storage, and execution. Source code, experiment pipelines, evaluation artifacts, and analysis logs are available in the public repository at #link("https://github.com/andrewlevada/internet-shaper-thesis-2026")[github.com/andrewlevada/internet-shaper-thesis-2026] (@sec:data-code).

== Design Goals <sec:design-goals>

As introduced above, interfaces are rarely perfect for every user. Even well-designed products leave gaps between a person's actual tasks and what the UI optimizes for. In the worst cases, gray and dark patterns deliberately misalign business incentives with user goals, making the interface harder to use for the tasks the user actually cares about.

Most adaptive interface research assumes developers build adaptive or customizable behavior into the application itself. Our approach is different: it is _user-sided_. The user adapts software they already use, without any cooperation from the people who built it. The system operates on pages that were not designed to be modified.

To reach those pages, we host the prototype in a browser extension. Extensions are uniquely positioned to read and write the DOM of any open tab. The page's structure and content are available to the system as HTML — the same representation the browser uses to render what the user sees. This gives us freedom that is miles ahead of other platforms.

Any adaptation system that changes the UI performs two sequential steps conceptually. First, it must somehow _read_ the page: capture context, reason about structure, or even decompose the user's request into concrete targets. Second, it must _apply_ changes to transform the page into a desired state. These steps are both minimal and required. Throughout this paper we call these two parts _perception_ and _action_.

== Baseline Limitations <sec:baseline-limitations>

The straightforward design is to read the full page HTML into the model, then apply direct text or DOM edits. Two practical limits make this baseline infeasible for real applications.

DOM snapshots from real websites are far larger than model context windows allow. The compression study in @sec:results-dom-compression measures 73 snapshots from popular domains (corpus protocol in @sec:dom-snapshot-corpus). Even after removing invisible subtrees, median visible DOM size remains above 100k tokens; raw snapshots reach 240k tokens at the median and over one million at the maximum (@tab:dom-snapshot-sizes).

#align(center)[
  #figure(
    caption: [#flex-title(
      [Estimated token count of popular web page DOMs — Approximate token counts over 73 page snapshots from the top 25 traffic domains; counted with tiktoken `o200k_base`.],
      [Estimated token count of popular web page DOMs],
    )],
    table(
      columns: 4,
      inset: 0.5em,
      table.header([Stage], [Mean (tok)], [Median (tok)], [Max (tok)]),
      stroke: (left: none),
      table.vline(stroke: none, start: 0, end: 5),
      [Raw DOM], [339,253], [240,918], [1,338,122],
      [Visible DOM], [162,806], [107,851], [1,028,594],
    ),
    supplement: "TABLE",
  ) <tab:dom-snapshot-sizes>
]

It is widely known that over-saturated contexts produce worse results in general task performance on LLMs @sridhar_hierarchical_2023 @zheng_synapse_2024 @enomoto_read_2026. Passing the full DOM on every request is therefore not viable: many pages would not fit, and those that do consume most of the context budget before any reasoning begins.

Even when a DOM fits, most of its HTML carries no information relevant to a given adaptation request — build-tool comments, framework wrapper elements, repeated list items, and design-system class tokens. A baseline that reads everything forces the model to filter noise on every turn.

On the action side, direct edit instructions do not survive a page reload. Without persistent storage, the system would need to re-run the full read-and-edit pipeline every time the user opens the page, relying on prompt caching or identical model outputs to reproduce the same result. That is slow, costly, and brittle on dynamic single-page applications where content loads after the initial render.

== Internet Shaper <sec:internet-shaper>

#align(center)[
  #figure(
    image("img/system.png"),
    caption: [#flex-title(
      [Internet Shaper architecture overview — Agentic core with browser extension wrapper.],
      [Internet Shaper architecture overview],
    )],
  ) <fig:internet-shaper-architecture>
]

Internet Shaper is an agentic system that makes user-side adaptation of web UIs possible with two specialized components.

_Perception_ is driven by a _DOM compression algorithm_ that gives the model a compact view of the page with the relative structure of elements fully preserved, and a way to retrieve local detail when the overview is not enough.

_Action_ is powered by the _Rules Engine_. Instead of direct edits, it records persistent update rules — selector-bound JavaScript that is re-applied on every load and on DOM mutation.

The LLM interacts with both components through tools in a fixed explore-then-act loop. It never writes to the live page directly; it reads from a snapshot frozen at request time and appends rules to a store.

@fig:internet-shaper-architecture shows the end-to-end workflow inside the browser extension. The numbered steps proceed as follows:

#enum(
  tight: true,
  [The user writes a natural-language adaptation request.],
  [The agent calls `get_map_of_dom()` and receives a compact structural map of a DOM snapshot captured at request time.],
  [When the map is not enough, the agent calls `show_in_dom()` to inspect local detail from the original snapshot.],
  [The agent calls `set_update_rule()` to record persistent, selector-bound JavaScript in the rules store — it does not edit the live page during the loop.],
  [After the loop finishes, the rules engine applies stored rules to the live page on load and on DOM mutation, yielding the updated page.],
)

== Perception <sec:perception>

An ideal perception interface must meet two criteria that the read-all baseline cannot (@sec:baseline-limitations):

- _Scale_. The representation must fit within practical context limits even though median visible DOMs already exceed 100k tokens (@tab:dom-snapshot-sizes).
- _Signal density_. It must shed the request-irrelevant bulk of production HTML — invisible markup, framework boilerplate, wrapper chains, and repetitive siblings — while preserving enough structure to locate and reason about adaptation targets.

Perception is implemented as a single DOM compression pipeline exposed through two complementary tools on the same captured snapshot: `get_map_of_dom` returns a site-wide structural map; `show_in_dom` retrieves local detail from the uncompressed snapshot when the map is not enough.

=== DOM Compression Algorithm <sec:dom-compression-algorithm>

The compression pipeline operates on the visible DOM captured at request time (subtrees with `display: none`, `visibility: hidden`, or `opacity: 0` are already removed during capture, as in the evaluation corpus). `get_map_of_dom` applies the following steps in fixed order:

1. _Remove non-structural markup_ — drop `head`, `script`, `link`, `style`, and `noscript` elements; build-tool HTML comments; and SVG path data (keeping each `svg` tag and its `title` for accessibility context).

2. _Attribute filtering_ — each element keeps only `class`, `id`, `role`, `aria-label`, `label`, `alt`, `type`, `name`, `placeholder`, `value`, and `data-*` attributes; all others (including `href`, `src`, and inline styles) are dropped. Empty attribute values are removed afterward.

3. _High-frequency class removal_ — class tokens appearing on more than 5% of elements are stripped tree-wide. The assumption is that very common classes are design-system scaffolding rather than component identifiers.

4. _Single-child wrapper collapse_ — chains of elements with exactly one element child and no significant direct text are flattened: intermediate nodes are removed and replaced by an HTML comment recording how many wrappers were collapsed and which class or attribute tokens were lost. Chains stop at leaf elements or at nodes that carry inline text.

#align(center)[
  #figure(
    image("img/wrapper-heuristic-example.png"),
    caption: [#flex-title(
      [Single-child wrapper collapse — Before (left) and after (right): three nested `div` wrappers around a button become `<!-- -3 wrappers -->` while the button and unrelated siblings are kept.],
      [Single-child wrapper collapse],
    )],
  ) <fig:wrapper-collapse-example>
]

5. _Repeated-sibling truncation_ — among groups of three or more consecutive siblings deemed structurally similar, only the first is kept; the rest are removed and annotated with a comment giving the truncated count. Similarity requires matching tag name and `id`, approximately matching class tokens (symmetric-difference thresholds scale with class-list length), and approximately matching sequences of immediate child tag names (compared via Levenshtein distance with length-dependent tolerances).

#align(center)[
  #figure(
    image("img/sibling-heuristic-example.png"),
    caption: [#flex-title(
      [Repeated-sibling truncation — Before (left) and after (right): three structurally similar `li` items become one representative plus `<!-- -2 siblings -->`.],
      [Repeated-sibling truncation],
    )],
  ) <fig:sibling-truncation-example>
]
6. _Whitespace normalization_ — insignificant text nodes are removed and remaining text is collapsed to single spaces, except inside `script`, `style`, `pre`, and `textarea` ancestors.

The result is a compact HTML map that preserves relative hierarchy and enough identifying tokens to locate targets, at the cost of omitting repeated list items and decorative wrapper depth. On outlier pages the heuristics may barely shrink the tree (@sec:results-dom-compression), and when a map still exceeds provider limits the production gateway truncates tool output at roughly 96k characters — the model must then rely on `show_in_dom` for the missing detail.

=== Selective Drill-Down <sec:selective-drill-down>

Because compaction is intentionally lossy for scale, the agent can call `show_in_dom(query_selector, depth)` on the _original_ snapshot — not the compressed map. The tool resolves the selector against the full captured HTML, clones the matched subtree, and prunes descendants beyond a configurable depth (default three element levels below the matched node). At the depth boundary, nested elements are replaced by a comment of the form `<!-- -N children -->`, while direct text on retained nodes is kept intact.

This complements the map in two ways. First, it restores attributes and child structure removed or summarized during compaction — for example, `href` values, inline styles, or the second item in a truncated sibling group. Second, it bounds local context: the agent requests only the subtree it needs rather than reverting to a full-DOM read. Increasing `depth` trades token cost for completeness when a rule must inspect deep descendants.

=== Alternatives <sec:perception-alternatives>

We also considered alternative comprehension strategies from the web-agent literature. Following @ning_survey_2025's classification into text-based, screenshot-based, and multimodal approaches, screenshot-only input is incompatible with our action model, which targets elements via CSS selectors and JavaScript. The accessibility tree preserves semantics for assistive technologies but strips layout detail users often want to change @enomoto_read_2026. Task-specific DOM pruning — as in Prune4Web @zhang_prune4web_2026 and related DOM-aware summarization methods @huang_lightweight_2025 — suits localized edits, but many adaptation requests are global: restyling a feed, suppressing a class of distractions, or restructuring layout. Hierarchical observation summarization @sridhar_hierarchical_2023 and trajectory-based prompting @zheng_synapse_2024 similarly optimize for navigation episodes rather than durable UI transformation. We therefore compress the full visible page structurally rather than pruning to a task-specific subset. We believe a combined approach of DOM compression together with pruning might work best, but this is out of scope for this thesis.

== Action <sec:action>

An ideal action interface must meet two criteria that one-shot DOM edits cannot (@sec:baseline-limitations):
- _Persistence_. Changes must survive reload and re-apply on dynamic pages without re-running the full perception pipeline or depending on identical model outputs each visit.
- _Expressiveness_. The mechanism must cover the same edit space direct manipulation allows — styling, interaction changes, and conditional logic over runtime content — not merely the subset CSS can hide or restyle.

#example[
"Show only videos that are longer than 40 min" on a YouTube playlist page. A persistent rule must read duration text from each item and conditionally hide non-matching entries — logic that CSS and one-shot text replacements cannot express.
]

We considered a custom transformation language and generated CSS before settling on JavaScript. Frontier models already generate JS reliably for DOM manipulation @zan_large_2023, and JS covers the conditional logic CSS cannot. A custom language would add parsing cost without clear benefit.

=== Rules Engine <sec:rules-engine>

Internet Shaper uses update rules. An _update rule_ is a persistent, selector-bound transformation stored as a small record: a human-readable `label` (shown in the rule manager UI), a CSS `query_selector`, and a `logic` string of JavaScript. Rules are scoped to the page hostname and persisted in extension storage; on each visit the extension loads the stored set and applies it before the user interacts with the page.

#example[
  For the YouTube playlist request in the expressiveness example above, the agent might emit a rule like the following:

  + *label:* `Hide videos under 40 min`
  + *query\_selector:* `ytd-playlist-video-renderer`
  + *logic:*
    #raw(block: true, lang: "js", "
const duration = element.querySelector('span.ytd-thumbnail-overlay-time-status-renderer')?.textContent?.trim();
if (!duration) return;
const parts = duration.split(':').map(Number);
const minutes = parts.length === 3 ? parts[0] * 60 + parts[1] : parts[0];
if (minutes < 40) element.style.display = 'none';
")
]

The LLM never executes rule logic during the agent loop. Instead, the `set_update_rule` tool appends a rule to an in-memory list. The tool schema exposes exactly the three fields above and documents the execution contract: the logic runs once per matched element with only an `element` parameter in scope — no `window`, `document`, or other globals. The system prompt further requires idempotent logic (repeated application must converge to the same state), deterministic side effects (set absolute values rather than toggle or append), and graceful handling of not-yet-loaded child content (early return when a value is missing, relying on re-application once content appears). Conditional hiding should prefer `element.style.display = 'none'` over `element.remove()` so the rule can still run when descendants populate.

After the agent loop completes, the new rules are merged into storage and passed to `applyRules`, which injects an applier function into the page's main JavaScript world via the extension's RPC layer. For each enabled rule, the engine queries `document.querySelectorAll`, wraps the logic as `(function(element) { ... })`, and compiles it through a Trusted Types policy where the host page requires one (needed on strict Content Security Policy sites such as YouTube). Each matching element is processed at most once per rule via a per-selector weak set; a `MutationObserver` on `document.body` re-applies rules to newly inserted nodes, and a child observer debounces re-runs when descendants of a matched element change — but disconnects after five seconds, so very late-loading content may never be transformed. Sites with strict CSP or Trusted Types allowlists that block our policy name may still reject dynamic rule compilation (@sec:limitations). 

From the model's perspective, a rule is therefore a declarative target (`query_selector`) plus imperative body (`logic`); from the runtime's perspective, it is a recurring DOM transformation that survives reloads and dynamic updates without re-invoking the LLM.

== Agent Workflow <sec:agent-workflow>

The system prompt enforces a strict perception-before-action sequence on every user request, following the tool-use agent pattern now common in LLM systems @noauthor_tool_nodate. When the agent loop starts, the extension captures a DOM snapshot (`document.documentElement.outerHTML`) and passes it to the tool executor; all perception tools read from this frozen copy rather than the live page. The model then follows this sequence:

+ Call `get_map_of_dom()` before any other tool.
+ Identify candidate elements relevant to the user's request from the returned map.
+ Call `show_in_dom(query_selector, depth)` when selector construction or local structure requires detail absent from the map — for example, distinguishing two elements that collapsed to the same outline, or reading `data-*` values needed for a conditional rule.
+ Emit one or more `set_update_rule(label, query_selector, logic)` calls.
+ Reply to the user when no further tools are needed; the loop continues until the model produces a message without tool calls or the stop reason is `end_turn`, at which point the collected rules are persisted and applied to the live page.

This ordering prevents the model from committing to selectors before it has a structural overview, while still allowing targeted inspection where the compressed map is insufficient. Because all perception tools read from the frozen snapshot, the agent cannot observe live DOM updates or the effect of rules during the loop — only the pre-request page state. `get_map_of_dom` and `get_dom` may each be called at most once per request; repeat calls return the cached result rather than a fresh capture. Prompt caching is applied to the system prompt and the `get_map_of_dom` result — typically the largest context item — so multi-turn exploration stays economical.

== The Browser Extension <sec:browser-extension>

The agentic core is hosted in a Chromium browser extension — the prototype targets Chrome-compatible browsers only and is not ported to Firefox or Safari. It captures snapshots, hosts the LLM loop, stores rules in `localStorage`, and applies them in the page's main JavaScript world. Extensions can read and write any tab's DOM without site cooperation, which satisfies the deployment constraint from @sec:design-goals, but they add no algorithmic behavior beyond capture, RPC, and rule injection.

Browser extensions run code in isolated worlds that cannot call each other directly: content scripts, a background service worker, and the page's main JavaScript context. Fiber, a small framework built for this project, wraps Chrome APIs in an RPC proxy so calling `executeInMainWorld` from a content script behaves like a local function while messages cross process boundaries. Trusted Types policies registered in the main world allow dynamic compilation of rule logic on strict Content Security Policy sites such as YouTube.

The overlay UI — prompt input, rule manager, status — is implemented with Lit signals in the content script. These concerns are orthogonal to the perception–action design and exist to make the prototype usable.

== Security Concerns <sec:security-concerns>

The prototype in its current state has several vulnerabilities and must not be used in a public setting:

- The agentic system has no protection against prompt injections that can be present in page content. This can enable severely harmful behavior up to remote code execution, as the rule application sandbox can fetch data from any URL.
- The browser extension stores API keys in the browser's storage in plaintext.

= Methods <sec:methods>

This section covers the data collection, processing pipelines, evaluation task synthesis, and the evaluation process itself.

== DOM Compression Evaluation <sec:dom-snapshot-corpus>

To move from anecdotal DOM sizes to measurable compression, we assembled a corpus of real page snapshots and ran the perception pipeline on each one.

=== Source and filtering <sec:corpus-source>

We started from the top-domain list in the web-unpacked study @xavier_web_2024, which annotates 116 high-traffic sites. We filtered out login- or payment-gated services and adult-industry domains, because manual evaluation might later involve inspecting page screenshots. We kept the top 25 remaining domains by rank. Commercial top-site lists can miss frequently visited pages and bias language-specific research @alby_analyzing_2022, but the web-unpacked corpus offers richer metadata than rank-only lists for our sampling goals.

Several homepages needed manual URL adjustment before crawling: search engines and YouTube were pointed at result pages rather than landing pages, Wikipedia at the English homepage, and Pinterest at a browsable feed. We then crawled same-domain links from each seed URL using a headed browser, semi-automatically accepting cookie banners and manually passing captchas where required.

Further manual filtering removed dead or region-locked services, pages blocked by bot detection, legal pages (terms of service, privacy policy), regional duplicates, and sitemaps. From each surviving domain we sampled the homepage plus three randomly chosen internal pages.

=== Capture and quality control <sec:corpus-capture>

Each selected URL was snapshotted with Playwright. For every page we stored:

+ `raw.html` — the full serialized DOM.
+ `visible.html` — the DOM after removing subtrees that are invisible by computed style (`display: none`, `visibility: hidden`, `opacity: 0`), matching the capture step used in the perception component.
+ A screenshot for optional human review.

Captchas and empty bot-rejection pages were handled in a semi-manual patch pass; snapshots that remained empty or unusable were dropped. The final corpus contains 73 pages across 25 domains.

=== Compression measurements <sec:compression-measurements>

After capture, we ran the reproducible batch script in `experiments/dom-compression-analysis/` (see @sec:data-code): for each snapshot it applies the production `get_map_of_dom` tool to `visible.html`, then counts characters and tokens (tiktoken `o200k_base`, matching @tab:dom-snapshot-sizes). Aggregates and interpretation are reported in @sec:results-dom-compression; those figures motivate the perception design in @sec:perception and the context budget argument in @sec:baseline-limitations.

== Task Synthesis <sec:evaluation-task-synthesis>

Compression metrics alone do not define adaptation tasks. To evaluate the full agent, we synthesized user requests from the snapshot corpus using a Jobs-to-be-Done (JTBD) pipeline. This mirrors recent work on synthesizing NL edit datasets for web pages @dang_envisioning_2025, but targets user-side adaptation prompts grounded in personas and jobs rather than developer-time HTML source edits.

We selected 10 snapshots from the corpus with a fixed random seed, excluding pages that failed quality checks. For each snapshot, a separate LLM session (Gemini 3.5 Flash) inspected the page DOM and produced, in three turns:

+ A list of user jobs on the page ("I want to…").
+ Three pairs of opposing user preferences — persistent traits rather than one-off edits.
+ Six concrete edit requests — one per preference side, labeled `1a` through `3b`.

Each request became a _seed sample_: a `task.json` describing the prompt and JTBD context, plus copies of the snapshot's `raw.html` and `visible.html`. This yields 60 seed tasks grounded in real pages and varied user intents. Downstream ablation pipelines (@sec:ablation-pipelines) run different perception–action combinations on these seeds for controlled comparison.

== Ablation Pipelines <sec:ablation-pipelines>

To isolate the perception and action components, we run six agent configurations on the synthesized seed tasks:

#align(center)[
  #figure(
    caption: [#flex-title(
      [Agent ablation conditions — Perception and action combinations compared in the evaluation study.],
      [Agent ablation conditions],
    )],
    table(
      columns: 3,
      inset: 0.5em,
      table.header([Pipeline], [Perception], [Action]),
      stroke: (left: none),
      table.vline(stroke: none, start: 0, end: 7),
      [Baseline], [full DOM], [immediate patch],
      [Engine only], [full DOM], [Rules Engine],
      [Map only], [DOM Compression], [immediate patch],
      [Full], [DOM Compression], [Rules Engine],
      [Full (Sonnet)], [DOM Compression], [Rules Engine, Claude Sonnet 4.6],
    ),
    supplement: "TABLE",
  )
]

Baseline and map-only swap perception strategy while keeping a one-shot edit action. Engine-only and full swap persistence while keeping full-DOM or compact perception respectively. The full pipeline matches the production prototype; results are reported in the Results section.

=== Local inference hardware <sec:local-inference-hardware>

Automated ablations were run on an NVIDIA H100 PCIe GPU (81\,GiB VRAM), 16 server threads, and a 262\,144-token context window with an 8\,GiB prompt cache. We loaded Unsloth's `Qwen3.6-27B-UD-Q4_K_XL` GGUF weights.

We chose local inference for three practical reasons. First, the baseline condition reads the full visible DOM and routinely exceeds 100k tokens (@tab:dom-snapshot-sizes); running every pipeline on the same long-context model avoids confounding API provider limits with architecture. Second, batch evaluation over dozens of samples is cheaper and more reproducible when inference stays on fixed hardware. Third, the production extension can call the same model family through a gateway, but the ablation study needed a stable backend for paired timing comparisons.

=== Human evaluation test stand <sec:human-evaluation-test-stand>

Subjective quality was collected with a small Next.js web application. The test stand is not part of the browser extension; it only replays archived evaluation artifacts.

For each trial the participant first sees the original-page screenshot and the adaptation prompt, then nine blinded pairwise screenshot comparisons per sample. Screenshots capture a fixed 1440×800 viewport and are not interactive — raters cannot scroll, reload, or verify that rules persist after navigation (@sec:limitations). Pipelines are compared in a fixed set of pairs (original vs each treatment, baseline vs full, and the component ablations listed in @sec:ablation-pipelines); left and right positions are randomized per trial. We originally planned a five-point Likert scale, but piloting showed that raters rarely used the intermediate anchors. The deployed interface therefore asks for a simple preference: left better, right better, or similar (neutral).

=== Sample filtering and scope <sec:sample-filtering>

The JTBD pipeline produced 60 seed tasks (@sec:evaluation-task-synthesis). After automated runs and quality checks, 42 samples retained complete agent logs and screenshots for all ablation pipelines. Many candidates were dropped because archived HTML did not render faithfully in headless replay — broken asset URLs, bot walls, or empty post-capture pages — which made side-by-side screenshots unusable for human review.

Before the preference study we filtered again: only samples whose screenshots for every pipeline variant displayed the page content clearly entered the zip archive. That left 15 samples and 135 judgments (15 × 9 pairs). Statistical tests in @sec:pairwise-preference-evaluation therefore have low power; we treat them as a preliminary human readout. Future work will improve snapshot renewal and rendering patches so more of the corpus becomes ratable.

== AI Usage Disclosure <sec:ai-usage-disclosure>

AI agents via Cursor Editor and Claude Code CLI were used in writing the prototype code. All generated code was fully reviewed and verified manually, and all architectural decisions were made explicitly by the authors. We used proprietary frontier models in the prototype evaluation; following @palmer_using_2024, we treat this as justified because the contribution is the adaptation system rather than a model benchmark.

= Results <sec:results>

== DOM compression <sec:results-dom-compression>

This section reports the DOM compression study in full. The corpus and capture protocol are defined in @sec:dom-snapshot-corpus; @sec:compression-measurements states only that we batch-ran the production compressor. The numbers below are what @sec:baseline-limitations and @sec:perception cite when arguing that full-DOM reads are too large and that a compact map plus drill-down is required.

=== Corpus and procedure

We evaluated 73 page snapshots stored under `experiments/dom-compression-analysis/data/snapshots/` in the project repository (@sec:data-code) — the same 25-domain sample as in @sec:corpus-source (homepage plus three internal URLs per domain, after manual quality filtering). For each snapshot id `NNN` we measured three HTML stages:

+ _Raw DOM_ — serialized `raw.html` as captured by Playwright.
+ _Visible DOM_ — `visible.html` after stripping subtrees hidden by computed style (`display: none`, `visibility: hidden`, `opacity: 0`), matching extension capture.
+ _Compressed DOM_ — output of `get_map_of_dom` on that visible snapshot (all heuristics in @sec:dom-compression-algorithm).

Counts use tiktoken encoding `o200k_base` for tokens and UTF-8 byte length for characters. HTML comments introduced by the compressor (wrapper collapse, sibling truncation) are tracked separately as _comment overhead_ inside the compressed file. The script writes per-page rows to `samples.csv` and corpus-level means/medians to `total.csv`.

=== Token counts

#align(center)[
  #figure(
    caption: [#flex-title(
      [Token counts after DOM compression — Token counts over 73 snapshots (`o200k_base`).],
      [Token counts after DOM compression],
    )],
    table(
      columns: 5,
      inset: 0.5em,
      table.header([Stage], [Mean], [Median], [Min], [Max]),
      stroke: (left: none),
      table.vline(stroke: none, start: 0, end: 5),
      [Raw DOM], [339,253], [240,918], [18,490], [1,338,122],
      [Visible DOM], [162,806], [107,851], [7,188], [1,028,594],
      [Compressed DOM], [11,135], [6,613], [522], [107,851],
    ),
    supplement: "TABLE",
  ) <tab:compression-tokens>
]

_Visible capture_ removes boilerplate that never renders: median size drops from 240,918 to 107,851 tokens (factor 2.2×). That step alone does not bring typical pages under a practical reasoning budget.

_Compression_ removes non-structural markup, high-frequency classes, wrapper chains, and repeated siblings (@sec:dom-compression-algorithm). Median compressed DOM size is 6,613 tokens — *16.3×* smaller than the median visible DOM and 36.4× smaller than median raw. Mean compressed DOM size is 11,135 tokens versus 162,806 visible (14.6×). The distribution is skewed: the smallest compressed DOM is 522 tokens; the largest is 107,851 tokens, equal to the median _visible_ page. On that outlier, heuristics barely shrink the tree, so the compressed DOM still occupies essentially a full visible DOM worth of context. Compression is therefore necessary for typical pages but not a universal fit guarantee.

@tab:dom-snapshot-sizes in @sec:baseline-limitations reproduces the raw and visible columns from this table; the compressed column appears only here.

=== Character counts and comment overhead

#align(center)[
  #figure(
    caption: [#flex-title(
      [Character counts after DOM compression — Character counts over 73 snapshots.],
      [Character counts after DOM compression],
    )],
    table(
      columns: 5,
      inset: 0.5em,
      table.header([Stage], [Mean], [Median], [Min], [Max]),
      stroke: (left: none),
      table.vline(stroke: none, start: 0, end: 5),
      [Raw DOM], [948,621], [708,458], [50,097], [4,411,456],
      [Visible DOM], [421,952], [295,185], [21,212], [2,353,194],
      [Compressed DOM], [35,730], [21,424], [1,854], [332,518],
      [Compressed DOM comments only], [8,780], [5,789], [311], [50,983],
    ),
    supplement: "TABLE",
  ) <tab:compression-chars>
]

Character counts follow the same ordering as tokens. Median visible HTML is 295,185 characters; median compressed DOM is 21,424 (13.8× reduction). Annotation comments account for a median of 5,789 characters inside the compressed DOM — about 27% of median compressed file size — so a non-trivial share of the compact representation documents what was removed rather than live structure.

=== Implications for the prototype

Together, @tab:compression-tokens and @tab:compression-chars show two separable wins: halving input by hiding invisible subtrees at capture time, then another order-of-magnitude reduction by structural compression before the first model call. That gap is what makes `get_map_of_dom` plus `show_in_dom` viable on median production pages while the read-all baseline in @sec:baseline-limitations still faces six-figure token medians. Selective drill-down remains necessary because the lossy map omits repeated list items and pared attributes; the agent recovers detail from the frozen snapshot only where needed (@sec:selective-drill-down).

== Automated ablation corpus <sec:automated-ablation-corpus>

Across the 42 pipeline-complete samples:

- The baseline agent executed without context overflow on all 42 samples; visible DOM fit a 202,144-token budget on 33/42 (78.6%).
- Every baseline run produced an edited `index.html`; the full pipeline (`5-full`) also completed on 42/42 samples.

Processing time is summed `elapsed_s` per sample from `agent.log` (model inference only). Friedman test across all five timed pipelines: $n = 42$, $chi^2 = 116.3$, $p = 3.3 times 10^(-24)$.

#align(center)[
  #figure(
    caption: [#flex-title(
      [Median inference time by ablation pipeline — Median API inference time per sample over 42 tasks (seconds).],
      [Median inference time by ablation pipeline],
    )],
    table(
      columns: 5,
      inset: 0.5em,
      table.header([Pipeline], [Median], [Mean], [Min], [Max]),
      stroke: (left: none),
      table.vline(stroke: none, start: 0, end: 6),
      [Baseline], [162.8 s], [202.5 s], [14.2 s], [513.6 s],
      [Engine only], [63.4 s], [74.4 s], [6.7 s], [155.1 s],
      [Map only], [82.3 s], [116.8 s], [13.9 s], [361.2 s],
      [Full], [34.4 s], [37.6 s], [9.4 s], [119.8 s],
      [Full (Sonnet)], [28.2 s], [33.1 s], [14.1 s], [78.5 s],
    ),
    supplement: "TABLE",
  ) <tab:pipeline-times>
]

Paired Wilcoxon tests (same 42 samples): baseline vs full — median 162.8 s vs 34.4 s, speedup ×4.74, $p = 4.5 times 10^(-13)$, full faster on 42/42; baseline vs engine-only — ×2.57, $p = 1.4 times 10^(-12)$; baseline vs map-only — ×1.98, $p = 6.0 times 10^(-6)$; map-only vs full — ×2.40, $p = 6.4 times 10^(-12)$; engine-only vs full — ×1.85, $p = 1.1 times 10^(-8)$; baseline vs full-sonnet — ×5.77, $p = 4.5 times 10^(-12)$; full vs full-sonnet — ×1.22, $p = 0.080$ (not significant at $alpha = 0.05$).

== Pairwise preference evaluation <sec:pairwise-preference-evaluation>

Human judgments cover 15 samples (135 comparisons) — a small set with limited statistical power (@sec:limitations). Task completion vs original counts only decisive outcomes (excluding ties) from static screenshots; it does not verify reload persistence or interactive behavior:

#align(center)[
  #figure(
    caption: [#flex-title(
      [Screenshot task completion vs. original page — Decisive win / loss / tie counts ($n = 15$ samples per row).],
      [Screenshot task completion vs. original page],
    )],
    table(
      columns: 5,
      inset: 0.5em,
      table.header([Treatment], [Wins], [Losses], [Ties], [Decisive win rate]),
      stroke: (left: none),
      table.vline(stroke: none, start: 0, end: 5),
      [Baseline], [12], [0], [3], [100% (12/12)],
      [Full], [11], [0], [4], [100% (11/11)],
      [Full (Sonnet)], [11], [0], [4], [100% (11/11)],
    ),
    supplement: "TABLE",
  ) <tab:task-completion>
]

Exact binomial sign tests for baseline and full vs original are significant at $alpha = 0.05$ ($p < 0.001$ for both). McNemar tests on discordant baseline-vs-full outcomes when both are compared to original report zero discordant pairs.

Head-to-head quality (full vs baseline on the same samples): 4 wins, 6 losses, 5 ties; decisive win rate for full = 40% (4/10); exact binomial $p = 0.754$; Wilcoxon on signed preference scores $p = 0.625$. Quality parity between full and baseline is therefore inconclusive — the speed gains in @sec:automated-ablation-corpus are not matched by a significant human preference for either pipeline.

Component ablation (decisive win rate for the named pipeline):

#align(center)[
  #figure(
    caption: [#flex-title(
      [Human preference scores for component ablation — Decisive preferences on 15 rated samples.],
      [Human preference scores for component ablation],
    )],
    table(
      columns: 4,
      inset: 0.5em,
      table.header([Comparison], [Wins], [Losses], [Ties]),
      stroke: (left: none),
      table.vline(stroke: none, start: 0, end: 6),
      [Engine only vs baseline], [2], [7], [6],
      [Map only vs baseline], [5], [1], [9],
      [Full vs engine only], [4], [1], [10],
      [Full vs map only], [2], [5], [8],
      [Full vs baseline], [4], [6], [5],
    ),
    supplement: "TABLE",
  ) <tab:component-contribution>
]

None of the component sign tests reach $p < 0.05$ at $n = 15$.

== Extension cases outside the corpus <sec:extension-cases>

The evaluation protocol is necessary for comparison, but it does not show what using Internet Shaper on a live tab feels like. We therefore include three informal examples from real browser-extension sessions on production sites — the same tool a user would run day to day.

Each figure pairs the page before the user submits a prompt with the state after stored rules re-apply. They are illustrative, not part of the 15-sample preference study in @sec:pairwise-preference-evaluation.

#align(center)[
  #figure(
    grid(
      columns: 2,
      gutter: 1em,
      image("img/cases/google-images-before.png", width: 100%),
      image("img/cases/google-images-after.png", width: 100%),
    ),
    caption: [System in action, example 1. Google Images — Prompt: «remove the text under images».],
  ) <fig:case-google-images>
]

#align(center)[
  #figure(
    grid(
      columns: 2,
      gutter: 1em,
      image("img/cases/gmail-before.png", width: 100%),
      image("img/cases/gmail-after.png", width: 100%),
    ),
    caption: [System in action, example 2. Gmail — Prompt: «style the page in Minecraft theme».],
  ) <fig:case-gmail>
]

#align(center)[
  #figure(
    grid(
      columns: 2,
      gutter: 1em,
      image("img/cases/substack-before.png", width: 100%),
      image("img/cases/substack-after.png", width: 100%),
    ),
    caption: [System in action, example 3. Substack — Prompt: «replace the Up next block with an audio player from Spotify».],
  ) <fig:case-substack>
]

= Discussion <sec:discussion>

The evaluation corpus ended up much smaller than we planned: 60 synthesized seeds, 42 machine-runnable samples, and only 15 that survived screenshot quality filtering for human review. Power for pairwise tests is therefore limited, and non-significant component contrasts should be read as inconclusive rather than as evidence of parity.

Within that constraint, both baseline and full beat the original on decisive screenshot judgments (@tab:task-completion), but many comparisons were ties and the raters could not interact with the pages — so task-completion claims should be read as weak evidence of visual improvement, not verified functional success. When baseline and full are compared directly, full wins 40% of decisive pairs and loses 60% — quality parity remains inconclusive ($p = 0.754$). The compact perception plus rules engine therefore delivers large inference-time savings (@tab:pipeline-times) without a demonstrated human quality advantage over the read-all baseline.

Processing times show a clearer pattern (@tab:pipeline-times). The full pipeline mediates 4.7× faster inference than baseline on the same 42 tasks, with map-only and engine-only ablations in between. Because rules persist in extension storage, those minutes of model time are spent once per adaptation goal rather than on every revisit.

The live extension cases (@sec:extension-cases) illustrate behaviors we did not encode explicitly. In informal trials the agent has called third-party HTTP APIs when asked to add decorative content, composed multi-rule layout refactors (for example a Substack article grid with roughly seven coordinated rules), and collapsed large restructuring tasks into a single `main`-scoped rule with internal control flow. We did not run the same prompts through the baseline pipeline or score how often comparable patterns appear without DOM compression and persistent rules; attributing them uniquely to Internet Shaper would require a follow-up controlled study.

== Emergent behaviors <sec:emergent-behaviors>

Reported informally during extension use (not part of the 15-sample preference study):

- When asked to «add a cat to the page», the agent fetched a random image from #link("http://cataas.com")[cataas.com] and injected it into the DOM.
- Beyond trivial hide/show requests, generated rule logic often uses variables, conditionals, and child-node properties.
- Grid-style layout requests (Substack article list) triggered coordinated changes to cards, thumbnails, and menus, not a single CSS tweak.
- Large structural moves sometimes become one rule on `main` rather than many element-specific rules.

= Conclusion <sec:conclusion>

This thesis presented Internet Shaper, a browser-extension-hosted agent that adapts third-party web pages from natural language without site cooperation. The technical contributions are (1) DOM compression with selective drill-down for scalable perception, (2) a persistent rules engine for expressive, reload-safe action, and (3) a JTBD-based pipeline for synthesizing grounded adaptation tasks on real page snapshots.

Empirically, compression reduces median visible DOM size by roughly 16× on a 73-page corpus. On 42 automated samples the full pipeline runs about five times faster than a full-DOM baseline. In a preliminary human study ($n = 15$) both pipelines visually outperformed the original on decisive screenshot judgments, but quality parity between baseline and full was inconclusive and many comparisons were ties. Three live-site case screenshots demonstrate non-trivial adaptations outside the formal dataset.

The human evaluation is preliminary because rendering failures forced heavy sample filtering. Future work will harden snapshot replay, expand the ratable set toward statistically powered inference, and measure whether emergent behaviors such as API calls and multi-rule layout refactors appear in baseline conditions as well.

== Limitations <sec:limitations>

+ Internet Shaper operates on a single screen at a time: the agent has no multi-screen context and cannot construct multi-step or app-wide flows.
+ Rules are scoped to the hostname with no URL path matching, so adaptations intended for one page may apply across the whole domain (@sec:rules-engine).
+ The human evaluation is preliminary: only 15 samples survived screenshot filtering, judgments are static viewport PNGs with no reload or interaction, many comparisons were ties, and baseline-vs-full quality parity is inconclusive ($p = 0.754$; @sec:pairwise-preference-evaluation).
+ Adaptation prompts were LLM-synthesized rather than collected from real users, and automated ablations replay archived HTML in batch scripts — approximating but not identical to live extension use (@sec:evaluation-task-synthesis, @sec:ablation-pipelines).
+ The prototype is not production-ready: it is vulnerable to prompt injection via page content and stores API keys in plaintext (@sec:security-concerns).

= Data and Code Availability <sec:data-code>

All source code, experiment pipelines, evaluation datasets, agent logs, analysis scripts, and supplementary materials for this thesis are available in the public repository #link("https://github.com/andrewlevada/internet-shaper-thesis-2026")[github.com/andrewlevada/internet-shaper-thesis-2026].

#bibliography(title: "Bibliography cited", "refs.bib", style: "ieee")
