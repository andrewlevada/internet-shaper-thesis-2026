import { convert } from "mhtml-to-html/browser"
import { createBlobUrl } from "./zip"

const CSP_META_PATTERN =
	/<meta\b[^>]*?\bhttp-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi
const CSP_META_ESCAPED_PATTERN =
	/&lt;meta\b[^&]*?\bcontent-security-policy\b[^&]*?&gt;/gi

export function stripContentSecurityPolicy(html: string): string {
	return html
		.replace(CSP_META_ESCAPED_PATTERN, "")
		.replace(CSP_META_PATTERN, "")
}

export async function mhtmlBytesToPreviewUrl(
	bytes: Uint8Array,
): Promise<string> {
	const { data: html } = await convert(bytes, {
		fetchMissingResources: true,
	})
	const sanitized = stripContentSecurityPolicy(html)
	return createBlobUrl(new TextEncoder().encode(sanitized), "text/html")
}
