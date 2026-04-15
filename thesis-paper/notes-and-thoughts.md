# User‑Aligned Web Interfaces: Just‑in‑Time Generative Adaptation of Existing UIs

## Introduction

we know that gray / dark patterns systematically misalign system and user goals (citation needed here – not a full lit review, becuase this is not an actual point we study, but instead a motivation for the research to be done, the reason why it matters)

**Problem** — User Interfaces have systematically misaligned business and user goals. Note that understanding how widespread the problem is or how significant it is is out of scope.

(in what way are they usualy missaligned? categorization here, or is it too much out of focus? – bench requires categorization)

and we know UIs can be made adaptive, generative, and even end‑user malleable (citation needed here for geenral overview of adaptive or customizable interfaces; the generative once will be thoroghly explored in the ralated works section)

However, we lack a conceptual and empirical account of how user‑controlled adaptations of existing interfaces can function as a response to gray patterns — what forms of control, constraints, and interaction metaphors are needed (tbh, my research does not really answer this question, it's more of a proof-of-concept showcase) so that such adaptations actually increase agency, maintain usability, and don’t introduce new gray patterns.

This motivates the **Research Question** — How can adaptive generative interfaces counteract this problem by re‑aligning the interface with a user’s articulated goal? (shaky RQ, a couple of notes on it: what i do show is that such solution can help some cases of misaligned interfaces. what i son't show is how well it work, because there is no bench; or how it compares to other solutions, because the solutions are sparce and not directly comparable. MAYBE the actual RQ is closer to investigating the feasebility of morphing existing UIs)

I propose a **Solution** — A browser extension that uses LLMs to adapt existing web UIs to a user-defined goal

(design goals of a solution – what solution would count as feasible and succesfull)

Key contributions:

- Rule-based approach for LLM-to-webpage interactions
- A prototype (that is shown to help in user trial or bench) (first of it's kind proof of concept of a generative UI adaptation)
- DOM lossy and lossless compression algorithm
- Fiber, a browser extension framework

## Related work

We explore similar solutions that demonstrate UI generation adaptation (from which we see a gap: very little interface adaptations methods exist, which is arguably as useful as generation them))

### Generative Adaptation of UI

### Generation of UI

### Adaptation of UI

What makes almost all curently existing UI adaptation solutions unapplicable to the Problem at hand is that they must be implemented by the app itself or from the developer. The problem however is all about the conflict between the app's and user's interests. Becuase of this, in this section we only include end-user-controled methods of interface adaptation, of which there are only a few

## Methods

We designed the system from initial design constraints, and then conducted a proof-of-concept user study. It's protocol is in this section

### Design Goals

(intro: constraints for this system are pretty unique, cuz it democratizes reshaping of web to user's needs. normally adaptive ui methods are made for developers, but here actions are performed on an already built software)

- The system must have a way to change and override existing app's UI – Key constraint that motivated the browser extension as a host for the solution. It can uniquly modify any opened website, making it perfect as a way to text if user-initiated adaptation of uis is feasibe, and useful. 
- The underlying LLM must have acces to all the information that is visible to the user, when the user edits a page so it can process requsts at all
- The changes must be presistent – not reset after each session
- Ideal, the system should be multi-turn to enable recovery of faled requests and tuning of results

These goals motivate the usage of a browser extension env, mainly becuse of the direct acces to DOM with unlimited manipulations

### Key Challanges

(from the goals and constraints we get the challanges)

1. Interaction model: How can LLM change the web page to re-align it?
2. Representation model: How do we represent the web page data to the llm?

Bothe being havily connected

#### Interaction model

The browser extension environment gives us unique acces to the page's DOM and runtime context, from it, it is possible to chnage the DOM, modify existing elements structure, style and even events. Acrually that seems to be the only feasible way to re-shaper the environtent: give the llm a way to modify DOM

To achive the presistance design goal, we can make the LLM generate indepotent changes that have to be done to the page, so that we can apply them on every page reload. For the exact format of how these changes can be generated, we see a couple:

1. Pseudo-language transformation instructions
2. Generation of CSS styles
3. Generation of JS code to be run

We notice that the second option only covers a partial set of problems: this way the agent will be able to hide elements, change the way the look or even transform existing layouts. But this approach also make possible applications limited because the agent will have no way of creating new elements and flows, moving existing elements around, or modifing the logic. A couple of examples that motivated our choise:

> "Show only videos that are longer that 40min" (playlist page on youtube.com)
>
> To succefully process this request, the presistent change has to be able to instruct the system to get length data for each video, ether from the page's runtive variables, or from displayed text in the DOM, and then do a conditional check.

Frontier models excel at code generation, especially on tech stack that are extensivly present in the traing data set. This way instead of creating a pseudo-language to handle these presistent changes, we expect better performance from use JS to model these changes.

#### Representation model

There is a relevant agesent area of research from which I am getting a lot of valuable insigts. It's Web Agents – systems that can comprehand web pages and take actions on behalf of users. Our aproach diverges from them in that we don't interact with the environment to help the user, but instead re-shape the environment to make it more fitting for this particular user's task. But the comprehansion challange is shared.

Following the [10.48550/arXiv.2503.23350]'s classification of comprehension techniques into text-based (which is not text, but actually code), screenshot-based and multimodal. All aproaches have shown promissing results, however as our interaction model relies on the DOM structure to query and chnage components, the LLM has to have textual info, making screenshot-based approach infeafeable. In this proof-of-concept paper we focus on text-based perception, multimodal perception is a great addition for future works.

The next problem that arises however, is the sizes of DOMs. To demonstarate the problem, we have collected 3 unprocessed DOM example snapshots from logged-in websites — Instagram, Substack, and YouTube. These DOMs differ in file size, complexity, and underlying technologies:


| instagram | 1,025,897 tokens, 1,964,595 chars |
| --------- | --------------------------------- |
| substack  | 192,875 tokens, 453,795 chars     |
| youtube   | 1,629,793 tokens, 4,040,550 chars |


I measured each DOM’s size in tokens using Anthropic’s token measurement API. The context windows of the most advanced LLMs are mostly under 1 million tokens, with the more budget models typically at around a 200k context window. Passing the full DOM to the model as-is is not a good baseline solution. It is not even feasible for some of the DOMs.

This makes DOM compression nescessary to both fit some DOMs inside the context window, and to reduce clutter with no semantic meaning

### System Design Summary

So what we have so far:

- The system must be able to precive DOM via snapshoots, and that in a compressed way
- The system must be able to generate presistent chnage rules as code
- The system must be able to execute that code on the DOM
- The system must preserve or re-apply changes on page reload

As the architectural base will use an agentic prompting approach, because it shows significant boosts in performance across a range of tasks. "[On benchmarks like LAB-Bench FigQA (scientific figure interpretation) and SWE-bench (real-world software engineering), adding even simple tools produces outsized capability gains, often surpassing human expert baselines." (convert to citation)](https://arc.net/l/quote/nifbpcze)

To avoid context contamination with unnecessary info, as this has shown to decrese the performance of LLMs (citation needed), the agent has to have a drastically limited snapshot of the DOM initially. This however will lead lost info that may be critical to the user's tasks. So, the agent must also have a way to query a portion of the DOM snapshot in a less limited way. 

And finally, the agent must be able to record new rules, which are basically JS applied to the page's elements

This structure maps nicely onto 3 tools we ended up designing the system around, which are discussed in depth in the Implementation section – `get_map_of_dom` , `show_in_dom` and `set_update_rule`

### User Testing Protocol

The goal for the trial is to get an idea of weather the work is deviating or not from the originally set problem:

> How can adaptive generative interfaces counteract systematically misaligned business and user goals in UIs by re‑aligning the interface with a user’s articulated goal?

More precisely — Can the solution adequately solve the problem in at least a single case of a misaligned UI?

The setup is a Dia (Chromium) browser on the researcher’s laptop with an extension built from the current version of code (commit f1ae9bbfbc02c663c336e78c4772b2378ea9e77d)

Next, the questioner follows (experiment language — Russian):

1. Встречались ли вы со случаями, когда интерфейс какого-либо сайта затрудняет его использование для ваших личных целей и задач, то есть не подходил вам на сто процентов?
  1. No — End of test
2. Что это был за сайт и как именно интерфейс вам мешал? Вспомните один любой случай

The respondent proceeds to open the website, the researcher then opens the browser extension and instructs the user on how to use it. The respondent is invited to use the extension to customize the website. After the customization is done, a second questioner:

1. Did the transformation occur (set by the researcher)
2. Соответствует ли новая версия сайта вашим задачам больше, чем оригинальная?
3. Насколько вы оцените новую версию сайта по шкале от -3 до +3, где -3 — новая версия сайта сильно менее полезна, чем оригинальная, 0 — новая версия сайта не отличается от оригинальной в контексте решения личных задач, +3 — новая версия сайта сильно более полезна, чем оригинальная

The testing was conducted in an unformal uncontroled setting and can not be used to compare diffrent methods, models, approaches, or in any comparason at all. What is does show is the feasibility of the approach and that it can be useful for curtain tasks

### AI Usage Disclosure

AI agents via Cursor Editor and Claude Code CLI were used extensivly in writing the code for the prototype. All generated code was fully manually reviewed and verified, and all the architectural descisions were explicitly made by authors of the paper.

## Implementation

This section describes how the final interation of the system works in detail. The code repository is avaliable in the appendix.

### Overview

[image will be here]

The browser extansion can be seen as connected systems: there is an agent, it has acces to tools which in tern use browser apis and processing to get the data from the page. Separately there is a rule storage module and an engene for allying rules to web pages on load and on content change.

Nothe that the LLM agent does not affect the DOM directly, instead only populating the rules store, which then can be managed by user and used by the extension.

To make sure difrent layers of the system can communicate without hastle, we have created a helper framework that provides unified contexts for code execution, handiling the browser extension constaraints under the hood with RPC implementation of most useful APIs. We go in depth at a later section

### Agentic System

We use Anthropic's model harnes with thir best practices to implement tool use. Generally, the loop is: send system prompt + conversation history + tool definitions → receive content blocks → execute any `tool_use` blocks → push `tool_result` → repeat until no tool calls or `stop_reason === "end_turn"`.

#### Tools

The agent is given three tools:

`**get_map_of_dom()` – returns a compact page DOM structure. It agressivly algorithmivally excludes elements that are suspect to have little semantic meaning by using lossy DOM sompration: it collapses single child wrappers, repeating sibling elements , and non-semantic attributes with t

Prompt caching is applied to the system prompt and the `get_map_of_dom` result (the largest context item), reducing cost on multi-turn conversations.

`show_in_dom(query_selector, include_children)` — Returns the full, unprocessed HTML of a specific element from the DOM. Used after get_map_of_dom() to examine elements in detail. The element is returned exactly as it appears in the original DOM, with all attributes and children intact.

`set_update_rule(label, query_selector, logic)` — Sets a persistent update rule that will be applied to all elements matching the CSS selector every time the page loads. The `logic` parameter is JavaScript code that executes with `element` bound to each matching DOM element. The logic has no access to window, document, or any global APIs — only the `element` variable is available. The logic must be idempotent: running it on the same element multiple times must produce the same result as running it once.

The system prompt instructs the agent to prefer stable selectors (class names, `data-`* attributes, semantic tags) over brittle structural paths, to cover all meaningful variations by emitting multiple rules when necessary, and to write idempotent logic that sets absolute state rather than toggling or accumulating effects. 

Both `get_map_of_dom` and `show_in_dom` operate on a captured snapshot of the DOM (`document.documentElement.outerHTML`) taken at the time the user submits a request. `set_update_rule` does not immediately apply — it appends to a list of rules that are applied to the live page after the agent finishes.

#### Workflow

The agent is instructed to follow a fixed exploration-then-action workflow. It must always begin by calling `get_map_of_dom` to form a structural understanding of the page before taking any other action. From this map it identifies candidate elements relevant to the user's request. When it needs full attribute and children detail for a specific element — for example, to construct a precise selector or inspect dynamic content markers — it calls `show_in_dom`.

Only after this exploration phase does it emit one or more `set_update_rule` calls. Logic that depends on child content that may not yet be in the DOM is expected to return early and re-run once the relevant subtree has populated, as the apply layer re-invokes rules on newly added nodes via `MutationObserver`.

The conversation loop continues until the agent produces a reply with no tool calls, or the stop reason is `end_turn`, at which point the collected rules are applied to the live page.

#### Proproitary model aside

The model of choice for the prototype is Anthropic’s Claude Opus 4.6, one of the SOTA models at the time of writing. On the other hand:

> [we ask that scientists explicitly justify their use of proprietary models when they employ them in research.](https://www.nature.com/articles/s43588-023-00585-1)

We plead the technical state of the art and downstream use only. It is reasonable to expect that future models will surpass the capabilities of today’s closed-source SOTA models, which would also improve the prototype’s performance.

Thus, because we are not testing the models themselves, there is little risk of non-reproducibility, and we feel confident that the use of the SOTA model outweighs these concerns.

Because of these considerations, however, we will not compare the performance of the prototype across different models. That would amount to testing the models themselves, which is out of scope.

### DOM Compression

Following the system design scheme, we use 2 DOM compression algorithms: lossless and lossy. Lossless is used as a pre-processing step for any DOM that is given to the LLM, while lossy compression is used for the initial context given at each request (actually the model calls a tool to get it, but ). Lossy compression discards parts of the dom to make it extra compact, so that the model does not run out of context

#### Lossless

Removes elements guaranteed to contain no semantically useful information:

1. Remove head, script, link, and style tags
2. Remove invisible elements and their children (display: none) – the heuristic here is that user will not request changing what they cannot see
3. Strip inlined SVG data from svg tags, keeping the tag itself. SVG is almost always used for icons, which appear inside buttons or labeled. The actual path content of the icon does not matter to our task, so we can rely on accesability description values.
4. Remove code comments usually left by build tools. These could have contained useful information if we were in the developments setting, but the browser extension is seing already minified DOM from the production

#### Lossy

Produces a compacted structural map of the DOM, used as the agent's initial view. Each agressive compression rules follows a certain heuristic.

1. Collapse single-child wrapper chains — non-root elements with no siblings and exactly 1 child are removed and replaced with `<!-- Collapsed n wrappers -->`. DOMs are full of wrappers – structural single-child div tags that are not semantically relevant and instead appear as an artefct of build process from custom components.
2. Deduplicate repeated siblings — if 3+ sibling nodes share the same tag and class list (and have no id), only the first is kept, rest replaced with `<!-- Truncated n similar siblings -->`. This handles lists of content with similar structure
3. Strip most attributes — only class, id, role, aria-label, label, alt, type, and data- attributes are kept; inline styles, src, href etc. are removed. The heuristic here is that these common elements are sufficent to identify components meaning and identify them for rules or further inspection.
4. Remove high-frequency classes — classes appearing on more than 20% of all elements are dropped; these are likely design-system/framework classes that carry no semantic meaning (threshold picked empirically, needs more rigorous calibration)

### Browser Extension Wrapper (Fiber)

We have already mentioned that the browser extension is the natural fit for this system: it gets unique read/write access to any page's DOM and JS runtime without requiring any cooperation from the page's authors.

The challenge is that browser extensions operate across multiple execution contexts that cannot directly call each other: content scripts (isolated world), the page's JS runtime (main world), and the background service worker. A single user-visible action — like applying a rule — requires jumping across all three. In practice this means constantly threading execution between contexts within a single logical flow.

To manage this, we built **Fiber** — a small, reusable extension framework that abstracts the context-switching problem. Fiber wraps Chrome APIs in an `ext` proxy: calling `ext.scripting.executeScript()` from a content script feels like a direct call, but under the hood Fiber serializes it as a typed RPC message (`{ id, method, args }`) over `chrome.runtime.sendMessage` to the background service worker, which then executes the actual Chrome API and returns `{ id, result | error }`. The most important case is `ext.scripting.executeInMainWorld(fn, args)`, which serializes the function to a string before sending, then reconstructs and evaluates it in the page's main world using Trusted Types to satisfy the page's Content Security Policy.

Rules are saved to `localStorage` keyed by `internet-shaper-rules:${hostname}` as an array of `{ label, query_selector, logic, enabled }` objects. On every page load, `app.ts` reads the stored rules and calls `applyRules`, which runs via `executeInMainWorld` so rule logic has access to the real `document`. Inside the main world, rules are merged into `window.__internetShaperRules`, and a MutationObserver on `document.body` re-applies rules to any newly added nodes. This handles SPAs like YouTube and Instagram that load content dynamically without full page reloads. Individual rules that read child content to make a decision return early when content is absent and are re-run once the subtree populates.

### Security Concerns

The prototype in it's current state has a lot of holes and must not be used in a public setting:

- it stores api keys in the browser's storage in a non-encoded plain way
- it has no protection against prompt enjections that can be present in the page contnent. this can enable extermly harmful behavour up to remote code execution, as the rule application sandbox can fetch data from any irls

## Results

### Browser Extension

### User Testing

### DOM Compression

#### Lossless

#### Lossy

## Discussion

### Emergent Behaviours

Even more complex queries produced unexpectedly nice results, with the agent showcasing emergent behaviour that was not planned for:

- When asked to ‘add a cat to the page’, it pulled out an external API dedicated to showing a random cat image, and injected a new image component into the page.
  > 🐱 Cat image added — A random cat image (fetched from [cataas.com](http://cataas.com)) has been inserted into the center of the page, with rounded corners and a soft shadow.
- For requests more complex than ‘remove element A’, it immediately started using variables, conditionals, and accessing properties of the child nodes from the parent.
- When asked to turn a list of articles on Substack into a grid, it came up with a complex set of ~7 rules, adapting not only the layout, but the cards themselves — their headers, thumbnails, action menus — all to better fit the new grid context. This particular example shows promise in the agent’s high-level understanding of tasks instead of mechanical rule application. You could say the agent approached the task creatively.
- When asked to restructure the page in a major way, moving sections around, instead of creating many individual rules, it made a rule for the ‘main’ element with all the logic inside that rule.

## Conclusion

### Limitations

1. the LLM is provided a single screen in an app and is not aware of the multi-screen context. the risk here is that it might produce adaptations incompatible with the overall flow on more complex tasks, but we did not en
2. the system can only influence a single screen, making construction of multi-step flows and app-wide modifications difficult
3. the rules are applied to all pages that match the domain, no actual url path matching happens. as a result, rules sometimes unintentinally apply to the pages that they were not supposed to apply. this was an architectural descision that halps handle dynamically constrcuted pages (e.g. `domain.com/user/<id>`). future works can investigate feasibility of requiring a url mask for each rule that is created or a similar approach that can limit unexpected rule applications
4. the LLM has acces only yo the data that is visible to the user and is in the DOM. for a subset of interactions, specifically with dynamicly loaded data items, having acces to the actua underlying data structures in the JS could be helpful. the same applies to API actions, of which the model has no context at all

