/** Declarations for `https://deno.land/std` imports (runtime: Deno; types: for editors / tsc). */
declare module "https://deno.land/std@0.224.0/path/mod.ts" {
	export function basename(path: string, suffix?: string): string
	export function join(...pathSegments: string[]): string
}

declare module "https://deno.land/std@0.224.0/dotenv/mod.ts" {
	export function load(options?: {
		export?: boolean
	}): Promise<Record<string, string>>
}
