import { ext } from "fiber-extension"

export interface UpdateRule {
	label: string
	query_selector: string
	logic: string
	enabled?: boolean // defaults to true if undefined
}

export async function applyRules(rules: UpdateRule[]): Promise<number[]> {
	console.log("[Apply] Applying rules:", rules.length)

	// Execute in page's main world via fiber's executeInMainWorld
	// The rule functions are inlined as strings and will be eval'd via TrustedTypes policy
	const counts = await ext.scripting.executeInMainWorld(
		(
			rulesToApply: Array<{
				label: string
				query_selector: string
				logic: string
				enabled?: boolean
			}>,
		) => {
			const w = window as Window & {
				__internetShaperRules?: typeof rulesToApply
				__internetShaperCounts?: number[]
				__internetShaperProcessed?: Map<string, WeakSet<Element>>
				__internetShaperObserver?: MutationObserver
				__fiberTTPolicy?: { createScript: (input: string) => unknown }
				trustedTypes?: {
					createPolicy: (
						name: string,
						rules: Record<string, (input: string) => string>,
					) => { createScript: (input: string) => unknown }
				}
			}

			// Ensure Trusted Types policy exists (created by fiber, or create our own)
			if (w.trustedTypes && !w.__fiberTTPolicy) {
				try {
					w.__fiberTTPolicy = w.trustedTypes.createPolicy("fiber-extension", {
						createScript: (input: string) => input,
					})
				} catch {
					// Policy might already exist or be restricted
				}
			}

			// Helper to create a function from string using TrustedTypes if available
			const createFn = (logic: string): ((el: Element) => void) => {
				const code = `(function(element) { ${logic} })`
				if (w.__fiberTTPolicy) {
					const trusted = w.__fiberTTPolicy.createScript(code)
					return (0, eval)(trusted as string) as (el: Element) => void
				}
				return (0, eval)(code) as (el: Element) => void
			}

			// Merge with existing rules and counts
			const existingRules = w.__internetShaperRules ?? []
			const existingCounts = w.__internetShaperCounts ?? []
			w.__internetShaperRules = [...existingRules, ...rulesToApply]
			w.__internetShaperCounts = [
				...existingCounts,
				...new Array(rulesToApply.length).fill(0),
			]
			const countOffset = existingCounts.length

			// Initialize processed elements map
			if (!w.__internetShaperProcessed) {
				w.__internetShaperProcessed = new Map()
			}
			const processedMap = w.__internetShaperProcessed

			const getProcessedSet = (selector: string): WeakSet<Element> => {
				let set = processedMap.get(selector)
				if (!set) {
					set = new WeakSet()
					processedMap.set(selector, set)
				}
				return set
			}

			// Pending debounce timers keyed by element+rule
			const pendingRetries = new Map<
				Element,
				Map<string, ReturnType<typeof setTimeout>>
			>()

			const scheduleRetry = (
				rule: (typeof rulesToApply)[0],
				el: Element,
				fn: (el: Element) => void,
				ruleIndex: number,
			) => {
				let byElement = pendingRetries.get(el)
				if (!byElement) {
					byElement = new Map()
					pendingRetries.set(el, byElement)
				}
				const existing = byElement.get(rule.query_selector)
				if (existing) clearTimeout(existing)
				byElement.set(
					rule.query_selector,
					setTimeout(() => {
						byElement!.delete(rule.query_selector)
						// Re-run the rule unconditionally (rules must be idempotent)
						try {
							fn(el)
							if (ruleIndex >= 0) {
								w.__internetShaperCounts![ruleIndex]++
							}
						} catch (e) {
							console.error(
								`[Apply] Retry rule "${rule.label}" failed on element:`,
								e,
							)
						}
					}, 300),
				)
			}

			const watchElementChildren = (
				rule: (typeof rulesToApply)[0],
				el: Element,
				fn: (el: Element) => void,
				ruleIndex: number,
			) => {
				const childObserver = new MutationObserver(() => {
					scheduleRetry(rule, el, fn, ruleIndex)
				})
				childObserver.observe(el, {
					childList: true,
					subtree: true,
					characterData: true,
				})
				// Stop watching after 5 seconds — by then the content should be settled
				setTimeout(() => childObserver.disconnect(), 5000)
			}

			const applyRuleToElement = (
				rule: (typeof rulesToApply)[0],
				el: Element,
				fn: (el: Element) => void,
				ruleIndex = -1,
			): boolean => {
				const processed = getProcessedSet(rule.query_selector)
				if (processed.has(el)) return false
				try {
					fn(el)
					processed.add(el)
					watchElementChildren(rule, el, fn, ruleIndex)
					return true
				} catch (e) {
					console.error(`[Apply] Rule "${rule.label}" failed on element:`, e)
					return false
				}
			}

			// Apply rules to existing elements
			const elementCounts: number[] = []
			for (let i = 0; i < rulesToApply.length; i++) {
				const rule = rulesToApply[i]
				if (rule.enabled === false) {
					elementCounts.push(0)
					continue
				}
				try {
					console.log(`[Apply] Rule "${rule.label}": ${rule.query_selector}`)
					const elements = document.querySelectorAll(rule.query_selector)
					const fn = createFn(rule.logic)
					let count = 0
					for (const el of elements) {
						if (applyRuleToElement(rule, el, fn, countOffset + i)) {
							count++
						}
					}
					console.log(
						`[Apply] Rule "${rule.label}" applied to ${count} elements`,
					)
					elementCounts.push(count)
					w.__internetShaperCounts![countOffset + i] = count
				} catch (e) {
					console.error(`[Apply] Rule "${rule.label}" failed:`, e)
					elementCounts.push(0)
				}
			}

			// Set up MutationObserver if not already running
			if (!w.__internetShaperObserver) {
				console.log("[Apply] Setting up MutationObserver for dynamic content")

				const observer = new MutationObserver((mutations) => {
					const rules = w.__internetShaperRules ?? []
					if (rules.length === 0) return

					const addedNodes: Node[] = []
					for (const mutation of mutations) {
						for (const node of mutation.addedNodes) {
							if (node.nodeType === Node.ELEMENT_NODE) {
								addedNodes.push(node)
							}
						}
					}
					if (addedNodes.length === 0) return

					for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex++) {
						const rule = rules[ruleIndex]
						if (rule.enabled === false) continue
						try {
							const fn = createFn(rule.logic)
							const processed = getProcessedSet(rule.query_selector)

							for (const node of addedNodes) {
								const el = node as Element
								if (el.matches?.(rule.query_selector) && !processed.has(el)) {
									if (applyRuleToElement(rule, el, fn, ruleIndex)) {
										w.__internetShaperCounts![ruleIndex]++
									}
								}
								const descendants = el.querySelectorAll?.(rule.query_selector)
								if (descendants) {
									for (const desc of descendants) {
										if (!processed.has(desc)) {
											if (applyRuleToElement(rule, desc, fn, ruleIndex)) {
												w.__internetShaperCounts![ruleIndex]++
											}
										}
									}
								}
							}
						} catch (e) {
							console.error(`[Apply] Observer rule "${rule.label}" failed:`, e)
						}
					}
				})

				observer.observe(document.body, {
					childList: true,
					subtree: true,
				})
				w.__internetShaperObserver = observer
			}

			console.log("[Apply] All rules applied")
			return elementCounts
		},
		[rules],
	)

	return counts ?? []
}
