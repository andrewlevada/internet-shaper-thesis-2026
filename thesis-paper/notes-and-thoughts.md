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

- A prototype (that is shown to help in user trial or bench) (first of it's kind proof of concept of a generative UI adaptation)
- DOM compression algorithm
- Rule-based approach for LLM-to-webpage interactions

## Related work

We explore similar solutions that demonstrate UI generation adaptation (from which we see a gap: very little interface adaptations methods exist, which is arguably as useful as generation them))

### Generative Adaptation of UI

(are there any?)

### Generation of UI

(quite a few methods)

### Adaptation of UI

(is this section really needed? – yep. it explains why the 'generative' part is critical to the problem+solution)

What makes almost all curently existing UI adaptation solutions unapplicable to the Problem at hand is that they must be implemented by the app itself or from the developer. The problem however is all about the conflict between the app's and user's interests. Becuase of this, in this section we only include end-user-controled methods of interface adaptation, of which there are only a few

(lit review in here)

## Method 🧽

(how the research was done in phases)

### System Design

(how I got from (a browser extension that uses LLMs to adapt existing web UIs to a user-defined goal) to (dom compaction + agentic system + presistent rules) – in other words, this is a map from a design space into a singular point that is the system with justification)

startign questions are smth like:

- quick prerequesite: why a browser extension
- how to represent a web page to an llm
- how can the llm effect on the web page

### Bench / User trial

???

## Implementation 🧽

(this section maps onto the System Design parts, exploring each in detail)

### DOM Compression

(key challange: How to compact the DOM in a way that retains the maximum useful information and reduces the maximum noise)

### Agentic System

(How to optimize an agentic system to morph the DOM to user requests)

(iterations of tool configurations – what worked and what did not)

### Browser Extension Wrapper

(why browser extensions are challanging)

(the RPC solution – Fiber)

(how rules get applied)

## Results

(capabilities)

(bench or research)

## Discussion

?

## Conclusion

?

And limitations and proposals for future work:

1. the LLM is provided a single screen in an app and is not aware of the multi-screen context. the risk here is that it might produce adaptations incompatible with the overall flow on more complex tasks, but we did not en
2. the system can only influence a single screen, making construction of multi-step flows and app-wide modifications difficult
3. the rules are applied to all pages that match the domain, no actual url path matching happens. as a result, rules sometimes unintentinally apply to the pages that they were not supposed to apply. this was an architectural descision that halps handle dynamically constrcuted pages (e.g. `domain.com/user/<id>`). future works can investigate feasibility of requiring a url mask for each rule that is created or a similar approach that can limit unexpected rule applications
4. the LLM has acces only yo the data that is visible to the user and is in the DOM. for a subset of interactions, specifically with dynamicly loaded data items, having acces to the actua underlying data structures in the JS could be helpful. the same applies to API actions, of which the model has no context at all