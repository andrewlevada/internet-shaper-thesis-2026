import type { ButtonHTMLAttributes } from "react"

type ButtonVariant = "primary" | "secondary"

export default function Button({
	children,
	variant = "primary",
	className = "",
	...props
}: Readonly<
	ButtonHTMLAttributes<HTMLButtonElement> & {
		variant?: ButtonVariant
	}
>) {
	const variantClass =
		variant === "primary"
			? "bg-accent text-white hover:bg-[color-mix(in_srgb,var(--color-accent),white_10%)]"
			: "bg-white text-accent border border-accent hover:bg-[color-mix(in_srgb,white,var(--color-accent)_10%)]"

	return (
		<button
			type="button"
			className={`w-fit flex flex-row gap-1 px-5 py-2 rounded-[12px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${variantClass} ${className}`}
			{...props}
		>
			{children}
		</button>
	)
}
