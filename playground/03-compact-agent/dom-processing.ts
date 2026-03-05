import {
  DOMParser,
  Element,
  Node,
} from "https://deno.land/x/deno_dom@v0.1.48/deno-dom-wasm.ts";

const ALLOWED_ATTRIBUTES = new Set([
  "class",
  "id",
  "role",
  "aria-label",
  "label",
  "alt",
  "type",
]);

function isDataAttribute(name: string): boolean {
  return name.startsWith("data-");
}

function filterAttributes(element: Element): void {
  const toRemove: string[] = [];
  for (const attr of element.attributes) {
    if (!ALLOWED_ATTRIBUTES.has(attr.name) && !isDataAttribute(attr.name)) {
      toRemove.push(attr.name);
    }
  }
  for (const name of toRemove) {
    element.removeAttribute(name);
  }
}

function getElementSignature(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id || "";
  const classes = element.className
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
  return `${tag}:${id}:${classes}`;
}

function countAllClasses(element: Element): Map<string, number> {
  const counts = new Map<string, number>();

  function walk(el: Element) {
    for (const cls of el.className.split(/\s+/).filter(Boolean)) {
      counts.set(cls, (counts.get(cls) || 0) + 1);
    }
    for (const child of el.children) {
      walk(child as Element);
    }
  }

  walk(element);
  return counts;
}

function countElements(element: Element): number {
  let count = 1;
  for (const child of element.children) {
    count += countElements(child as Element);
  }
  return count;
}

function removeHighFrequencyClasses(element: Element, threshold: number): Set<string> {
  const classCounts = countAllClasses(element);
  const totalElements = countElements(element);
  const cutoff = totalElements * threshold;

  const toRemove = new Set<string>();
  for (const [cls, count] of classCounts) {
    if (count >= cutoff) {
      toRemove.add(cls);
    }
  }

  function walk(el: Element) {
    if (el.className) {
      const remaining = el.className
        .split(/\s+/)
        .filter((cls) => cls && !toRemove.has(cls))
        .join(" ");
      el.className = remaining;
    }
    for (const child of el.children) {
      walk(child as Element);
    }
  }

  walk(element);
  return toRemove;
}

function hasSignificantText(element: Element): boolean {
  return [...element.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .some((n) => n.textContent?.trim());
}

function collapseChain(element: Element): number {
  // Find the entire collapsible chain starting from this element's single child
  const chain: Element[] = [];
  let current = element;

  while (current.children.length === 1) {
    const child = current.children[0] as Element;
    // Stop if child is a leaf node
    if (child.children.length === 0) break;
    // Stop if there's significant text content
    if (hasSignificantText(current)) break;
    chain.push(child);
    current = child;
  }

  if (chain.length === 0) return 0;

  // Get the final element (deepest in chain)
  const deepest = chain[chain.length - 1];
  const finalContent = [...deepest.childNodes];

  // Merge all attributes from the chain into the parent
  for (const wrapper of chain) {
    for (const attr of wrapper.attributes) {
      if (attr.name === "class") {
        const parentClasses = element.className.split(/\s+/).filter(Boolean);
        const wrapperClasses = wrapper.className.split(/\s+/).filter(Boolean);
        const merged = [...new Set([...parentClasses, ...wrapperClasses])];
        element.className = merged.join(" ");
      } else if (!element.hasAttribute(attr.name)) {
        element.setAttribute(attr.name, attr.value);
      }
    }
  }

  // Remove the first child (which contains the whole chain)
  chain[0].remove();

  // Add the final content to parent
  for (const node of finalContent) {
    element.appendChild(node);
  }

  // Add comment
  const comment = element.ownerDocument?.createComment(
    ` Collapsed ${chain.length} wrappers `
  );
  if (comment) {
    element.insertBefore(comment, element.firstChild);
  }

  return chain.length;
}

function collapseSingleChildChains(element: Element): number {
  let collapsedCount = 0;

  // First, try to collapse chain starting from this element
  collapsedCount += collapseChain(element);

  // Then process all children (which may now be different after collapsing)
  for (const child of [...element.children]) {
    collapsedCount += collapseSingleChildChains(child as Element);
  }

  return collapsedCount;
}

function truncateSiblingLists(element: Element): number {
  let truncatedItems = 0;

  // Group consecutive children by signature
  const children = [...element.children];
  let i = 0;

  while (i < children.length) {
    const child = children[i] as Element;
    const signature = getElementSignature(child);
    let groupEnd = i + 1;

    // Find consecutive siblings with same signature
    while (groupEnd < children.length) {
      const sibling = children[groupEnd] as Element;
      if (getElementSignature(sibling) !== signature) break;
      groupEnd++;
    }

    const groupSize = groupEnd - i;
    if (groupSize >= 3) {
      // Remove all but first, add comment
      for (let j = i + 1; j < groupEnd; j++) {
        children[j].remove();
        truncatedItems++;
      }

      // Add comment after the first element
      const comment = element.ownerDocument?.createComment(
        ` Truncated ${groupSize - 1} similar siblings `
      );
      if (comment && child.nextSibling) {
        element.insertBefore(comment, child.nextSibling);
      } else if (comment) {
        element.appendChild(comment);
      }
    }

    i = groupEnd;
  }

  // Recurse into remaining children
  for (const child of [...element.children]) {
    truncatedItems += truncateSiblingLists(child as Element);
  }

  return truncatedItems;
}

function filterAllAttributes(element: Element): void {
  filterAttributes(element);
  for (const child of element.children) {
    filterAllAttributes(child as Element);
  }
}

function removeEmptyAttributes(element: Element): void {
  const toRemove: string[] = [];
  for (const attr of element.attributes) {
    if (!attr.value.trim()) {
      toRemove.push(attr.name);
    }
  }
  for (const name of toRemove) {
    element.removeAttribute(name);
  }
  for (const child of element.children) {
    removeEmptyAttributes(child as Element);
  }
}

export interface MapResult {
  html: string;
  stats: {
    collapsedWrappers: number;
    truncatedListItems: number;
    removedClasses: number;
  };
}

export function createDomMap(html: string): MapResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc?.body) {
    throw new Error("Failed to parse HTML");
  }

  const body = doc.body as Element;

  // Step 1: Filter attributes
  filterAllAttributes(body);

  // Step 2: Remove high-frequency classes (>20% of elements)
  const removedClasses = removeHighFrequencyClasses(body, 0.2);

  // Step 3: Collapse single-child chains
  const collapsedWrappers = collapseSingleChildChains(body);

  // Step 4: Truncate sibling lists
  const truncatedListItems = truncateSiblingLists(body);

  // Step 5: Remove empty attributes
  removeEmptyAttributes(body);

  return {
    html: body.outerHTML,
    stats: {
      collapsedWrappers,
      truncatedListItems,
      removedClasses: removedClasses.size,
    },
  };
}

export function extractElement(
  html: string,
  selector: string,
  includeChildren: boolean
): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) {
    throw new Error("Failed to parse HTML");
  }

  const element = doc.querySelector(selector);
  if (!element) {
    return `No element found matching selector: ${selector}`;
  }

  if (includeChildren) {
    return (element as Element).outerHTML;
  }

  // Return just the opening tag and direct text content
  const el = element as Element;
  const tagName = el.tagName.toLowerCase();
  const attrs = [...el.attributes]
    .map((a) => `${a.name}="${a.value}"`)
    .join(" ");
  const openTag = attrs ? `<${tagName} ${attrs}>` : `<${tagName}>`;

  const directText = [...el.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent?.trim())
    .filter(Boolean)
    .join(" ");

  const childSummary = el.children.length > 0
    ? `<!-- ${el.children.length} child elements -->`
    : "";

  return `${openTag}${directText}${childSummary}</${tagName}>`;
}
