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

### Key Challanges

The goal of the protofype is to re-allign the interface with a user’s articulated goal. The design of the system is geretally defined by answers to the 2 key challanges that arrise from the goal:

1. How can LLM change the web page to re-align it?
2. How do we represent the web page data to the llm?

Examining these questions one bo one limits the design space to the solution we ended up building

#### How LLM acts on a web page

The browser extension environment gives us unique acces to the page's DOM and runtime context, from it, it is possible to chnage the DOM, modify existing elements structure, style and even events. Acrually that seems to be the only feasible way to re-shaper the environtent: give the llm a way to modify DOM

To really adress the problem hover, these changes have to be presistent across page reloads, beucase the alternative of running an llm every time a page is reloaded seems wastfull. To counteract this, we make the LLM generate indepotent changes that have to be done to the page, so that we can apply them on every page reload. 

For the exact format of how these changes can be generated, we see a couple:

1. Pseudo-language transformation instructions
2. Generation of CSS styles
3. Generation of JS code to be run

We notice that the second option only covers a partial set of problems: this way the agent will be able to hide elements, change the way the look or even transform existing layouts. But this approach also make possible applications limited because the agent will have no way of creating new elements and flows, moving existing elements around, or modifing the logic. A couple of examples that motivated our choise:

> "Show only videos that are longer that 40min" (playlist page on youtube.com)
>
> To succefully process this request, the presistent change has to be able to instruct the system to get length data for each video, ether from the page's runtive variables, or from displayed text in the DOM, and then do a conditional check. 

Frontier models excel at code generation, especially on tech stack that are extensivly present in the traing data set. This way instead of creating a pseudo-language to handle these presistent changes, we expect better performance from use JS to model these changes.

#### Web Page Representation

There is a relevant agesent area of research from which I am getting a lot of valuable insigts. It's Web Agents – systems that can comprehand web pages and take actions on behalf of users. Our aproach diverges from them in that we don't interact with the environment to help the user, but instead re-shape the environment to make it more fitting for this particular user's task. But the comprehansion challange is shared.

Following the [10.48550/arXiv.2503.23350]'s classification of comprehension techniques into text-based (which is not text, but actually code), screenshot-based and multimodal. All aproaches have shown promissing results, however in this paper we focus on text-based perception, giving the model access to the DOM of the page, becuase the model's output requires DOM information to perform actions properly

### System Design

(how I got from (a browser extension that uses LLMs to adapt existing web UIs to a user-defined goal) to (dom compaction + agentic system + presistent rules) – in other words, this is a map from a design space into a singular point that is the system with justification)

startign questions are smth like:

- quick prerequesite: why a browser extension
- how to represent a web page to an llm
- how can the llm effect on the web page

### Security Concerns

()

## Implementation 🧽

(intro para)

Here we brake down each system componetn in detail:

### DOM Compression

(key challange: How to compact the DOM in a way that retains the maximum useful information and reduces the maximum noise)

The system uses 2 DOM compression algorithms: lossless and lossy

#### Lossless

Trims out elements that are garanteed to not contain any semantically important infor 

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

