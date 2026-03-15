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

function getClassName(element: Element): string {
  const cn = element.className;
  if (typeof cn === "string") return cn;
  if (cn && typeof cn === "object" && "baseVal" in cn) {
    return (cn as SVGAnimatedString).baseVal;
  }
  return "";
}

function setClassName(element: Element, value: string): void {
  const cn = element.className;
  if (typeof cn === "string") {
    element.className = value;
  } else if (cn && typeof cn === "object" && "baseVal" in cn) {
    (cn as SVGAnimatedString).baseVal = value;
  }
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
  const classes = getClassName(element).split(/\s+/).filter(Boolean).sort().join(" ");
  return `${tag}:${id}:${classes}`;
}

function countAllClasses(element: Element): Map<string, number> {
  const counts = new Map<string, number>();

  function walk(el: Element) {
    const cn = getClassName(el);
    if (cn) {
      for (const cls of cn.split(/\s+/).filter(Boolean)) {
        counts.set(cls, (counts.get(cls) || 0) + 1);
      }
    }
    for (const child of el.children) {
      walk(child);
    }
  }

  walk(element);
  return counts;
}

function countElements(element: Element): number {
  let count = 1;
  for (const child of element.children) {
    count += countElements(child);
  }
  return count;
}

function removeHighFrequencyClasses(
  element: Element,
  threshold: number,
): Set<string> {
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
    const cn = getClassName(el);
    if (cn) {
      const remaining = cn
        .split(/\s+/)
        .filter((cls) => cls && !toRemove.has(cls))
        .join(" ");
      setClassName(el, remaining);
    }
    for (const child of el.children) {
      walk(child);
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

function collapseChain(element: Element, doc: Document): number {
  const chain: Element[] = [];
  let current = element;

  while (current.children.length === 1) {
    const child = current.children[0];
    if (child.children.length === 0) break;
    if (hasSignificantText(current)) break;
    chain.push(child);
    current = child;
  }

  if (chain.length === 0) return 0;

  const deepest = chain[chain.length - 1];
  const finalContent = [...deepest.childNodes];

  for (const wrapper of chain) {
    for (const attr of wrapper.attributes) {
      if (attr.name === "class") {
        const parentClasses = getClassName(element).split(/\s+/).filter(Boolean);
        const wrapperClasses = getClassName(wrapper).split(/\s+/).filter(Boolean);
        const merged = [...new Set([...parentClasses, ...wrapperClasses])];
        setClassName(element, merged.join(" "));
      } else if (!element.hasAttribute(attr.name)) {
        element.setAttribute(attr.name, attr.value);
      }
    }
  }

  chain[0].remove();

  for (const node of finalContent) {
    element.appendChild(node);
  }

  const comment = doc.createComment(` Collapsed ${chain.length} wrappers `);
  element.insertBefore(comment, element.firstChild);

  return chain.length;
}

function collapseSingleChildChains(element: Element, doc: Document): number {
  let collapsedCount = 0;

  collapsedCount += collapseChain(element, doc);

  for (const child of [...element.children]) {
    collapsedCount += collapseSingleChildChains(child, doc);
  }

  return collapsedCount;
}

function truncateSiblingLists(element: Element, doc: Document): number {
  let truncatedItems = 0;

  const children = [...element.children];
  let i = 0;

  while (i < children.length) {
    const child = children[i];
    const signature = getElementSignature(child);
    let groupEnd = i + 1;

    while (groupEnd < children.length) {
      const sibling = children[groupEnd];
      if (getElementSignature(sibling) !== signature) break;
      groupEnd++;
    }

    const groupSize = groupEnd - i;
    if (groupSize >= 3) {
      for (let j = i + 1; j < groupEnd; j++) {
        children[j].remove();
        truncatedItems++;
      }

      const comment = doc.createComment(
        ` Truncated ${groupSize - 1} similar siblings `,
      );
      if (child.nextSibling) {
        element.insertBefore(comment, child.nextSibling);
      } else {
        element.appendChild(comment);
      }
    }

    i = groupEnd;
  }

  for (const child of [...element.children]) {
    truncatedItems += truncateSiblingLists(child, doc);
  }

  return truncatedItems;
}

function filterAllAttributes(element: Element): void {
  filterAttributes(element);
  for (const child of element.children) {
    filterAllAttributes(child);
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
    removeEmptyAttributes(child);
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
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  if (!doc?.body) {
    throw new Error("Failed to parse HTML");
  }

  const body = doc.body;

  filterAllAttributes(body);
  const removedClasses = removeHighFrequencyClasses(body, 0.2);
  const collapsedWrappers = collapseSingleChildChains(body, doc);
  const truncatedListItems = truncateSiblingLists(body, doc);
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
  includeChildren: boolean,
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  if (!doc) {
    throw new Error("Failed to parse HTML");
  }

  const element = doc.querySelector(selector);
  if (!element) {
    return `No element found matching selector: ${selector}`;
  }

  if (includeChildren) {
    return element.outerHTML;
  }

  const tagName = element.tagName.toLowerCase();
  const attrs = [...element.attributes]
    .map((a) => `${a.name}="${a.value}"`)
    .join(" ");
  const openTag = attrs ? `<${tagName} ${attrs}>` : `<${tagName}>`;

  const directText = [...element.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent?.trim())
    .filter(Boolean)
    .join(" ");

  const childSummary = element.children.length > 0
    ? `<!-- ${element.children.length} child elements -->`
    : "";

  return `${openTag}${directText}${childSummary}</${tagName}>`;
}

export function capturePageDom(): string {
  const html = document.documentElement.outerHTML;
  console.log("[DOM] Captured page DOM, length:", html.length);
  return html;
}
