import Button from "../components/button"

export default function Home() {
	return (
		<div className="w-full h-full pt-10">
			<div className="flex flex-col gap-10 items-center">
				<h1>~ Internet Shaper Evaluator ~</h1>

				<div className="flex flex-col gap-4 items-center">
					<input
						type="file"
						accept=".zip"
						className="w-[280px] h-[120px] rounded-[12px] border border-accent text-center p-4"
					></input>

					<Button>Start</Button>
				</div>
			</div>
		</div>
	)
}
