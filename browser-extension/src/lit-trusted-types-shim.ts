/**
 * Host pages may set `Content-Security-Policy: trusted-types` with an allowlist
 * that excludes `lit-html`. Lit registers that policy at module load; without a
 * shim the content script throws before any UI runs.
 *
 * This module must be imported before any `lit` import. If policy creation fails,
 * we return a stand-in matching Lit's no-Trusted-Types path (plain strings).
 */

type TrustedPolicyRules = Record<string, (input: string) => string>

type TrustedPolicyFactory = {
	createPolicy: (
		name: string,
		rules: TrustedPolicyRules,
	) => { createHTML?: (s: string) => string }
}

const g = globalThis as typeof globalThis & {
	trustedTypes?: TrustedPolicyFactory
	__internetShaperLitTTPatched?: boolean
}

if (
	typeof g.trustedTypes?.createPolicy === "function" &&
	!g.__internetShaperLitTTPatched
) {
	const tt = g.trustedTypes!
	const createPolicy = tt.createPolicy.bind(tt)

	const wrapped = (name: string, rules: TrustedPolicyRules) => {
		if (name === "lit-html") {
			try {
				return createPolicy(name, rules)
			} catch {
				return { createHTML: (s: string) => s }
			}
		}
		return createPolicy(name, rules)
	}

	;(tt as { createPolicy: typeof wrapped }).createPolicy = wrapped
	g.__internetShaperLitTTPatched = true
}
