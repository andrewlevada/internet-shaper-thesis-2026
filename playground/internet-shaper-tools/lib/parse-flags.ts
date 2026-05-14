export function parseFlags(argv: string[]): Map<string, string> {
	const m = new Map<string, string>()
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (!arg.startsWith("--")) continue
		const key = arg.slice(2)
		const next = argv[i + 1]
		if (next && !next.startsWith("--")) {
			m.set(key, next)
			i++
		} else {
			m.set(key, "true")
		}
	}
	return m
}
