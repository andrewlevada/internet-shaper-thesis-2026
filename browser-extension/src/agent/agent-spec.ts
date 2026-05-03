/**
 * Single source of truth for agent prompts and tool definitions.
 *
 * Both the cloud (Anthropic) and local (Chrome Prompt API) runners derive
 * everything from this file. Provider-specific shapes are produced by thin
 * adapters elsewhere — never by re-stating prose here.
 */

export interface AgentToolParameter {
  name: string;
  type: "string" | "boolean" | "number" | "integer";
  description: string;
  required?: boolean;
  default?: unknown;
}

export interface AgentToolSpec {
  name: string;
  description: string;
  parameters: AgentToolParameter[];
}

export const AGENT_TOOLS: AgentToolSpec[] = [
  {
    name: "get_map_of_dom",
    description:
      `Returns a compact, truncated map of the page DOM structure.
Single-child wrapper chains are collapsed (nested divs with one child become flat).
Repeating sibling elements (3+ with same tag/classes) show only the first with a count comment.
Only semantic attributes are kept: class, id, role, aria-label, label, alt, type, and data-* attributes.
Use this first to understand the page structure, then use show_in_dom() to examine specific elements in detail.`,
    parameters: [],
  },
  {
    name: "show_in_dom",
    description:
      `Returns the full, unprocessed HTML of a specific element from the DOM.
Use this after get_map_of_dom() to examine an element in detail. The element is returned exactly as it appears, with all attributes and children intact.`,
    parameters: [
      {
        name: "query_selector",
        type: "string",
        required: true,
        description:
          `CSS selector for the element to show (e.g. '#main', '.post-container', '[data-testid="feed"]').`,
      },
      {
        name: "include_children",
        type: "boolean",
        required: false,
        default: true,
        description:
          `If true (default), returns the full element with all children. If false, returns just the element's opening/closing tags and a summary of children.`,
      },
    ],
  },
  {
    name: "set_update_rule",
    description:
      `Registers a persistent update rule that runs JavaScript on every element matching the CSS selector, every time the page loads.
Prefer specific selectors (class names, data attributes, semantic tag names) over structural paths for robustness.
Create one rule per distinct element variation — be thorough.`,
    parameters: [
      {
        name: "label",
        type: "string",
        required: true,
        description:
          `A short ~3-word description for the rule management UI (e.g. 'Hide video ads', 'Remove sidebar', 'Dim suggestions').`,
      },
      {
        name: "query_selector",
        type: "string",
        required: true,
        description:
          `CSS selector matching elements to modify (e.g. '.ad-container', '[data-ad]', 'ytd-ad-slot-renderer').`,
      },
      {
        name: "logic",
        type: "string",
        required: true,
        description:
          `JavaScript code with 'element' bound to each matching DOM element.
The logic has NO access to window, document, or any global APIs — ONLY the 'element' variable.
Common operations:
  - element.style.display = 'none'  (preferred for conditional hiding)
  - element.remove()                 (only when no condition is involved)
  - element.style.opacity = '0.3'
  - element.classList.add('hidden')
  - element.textContent = ''
The logic MUST be idempotent and deterministic:
  - Running it on the same element multiple times must produce the same result as running it once.
  - If the logic reads child content (text, badge values) to decide whether to hide the element, return early when the content is absent — the rule is automatically re-run once child content populates.
  - Do not accumulate side effects: do not append to textContent, do not toggle classes — always set absolute values.
  - Never use element.remove() inside a conditional branch; prefer element.style.display = 'none' so the rule can still re-run if needed.`,
      },
    ],
  },
];

export const AGENT_SHARED_INSTRUCTIONS =
  `You are a browser extension agent that modifies web pages based on user requests.

You have access to three tools (their full specifications, including parameters and constraints, are provided separately):
  1. get_map_of_dom — overview of page structure
  2. show_in_dom    — full HTML of a specific element
  3. set_update_rule — register a persistent CSS-selector + JS rule

Workflow:
  1. Call get_map_of_dom() to understand the page structure.
  2. Identify candidate elements for the user's request.
  3. Use show_in_dom() to examine specific elements when more detail is needed.
  4. Register one or more update rules with set_update_rule(). Be thorough — if there are multiple variations of elements that match the user's request, create a rule for each.

Follow every constraint listed in each tool's parameter descriptions, especially the idempotency rules for set_update_rule's 'logic'.`;
