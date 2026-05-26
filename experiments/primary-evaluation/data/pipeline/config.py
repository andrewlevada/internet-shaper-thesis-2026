from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

# 6 different pipelines for each sample
PipelineId = Literal[
    "original",
    "baseline",
    "engine-only",
    "map-only",
    "full",
    "full-sonnet",
]

AgentProvider = Literal["vercel", "anthropic", "local"]

ExploreTool = Literal["get_dom", "get_map_of_dom"]
ActionTool = Literal["edit", "set_update_rule"]

# gateway for testing, local for actual eval run
LOCAL_MODEL_ID = "moonshotai/Kimi-K2.6"
GATEWAY_MODEL_ID = "moonshotai/kimi-k2.6"
ANTHROPIC_MODEL_ID = "claude-sonnet-4-6"

KIMI_MODEL_CONTEXT = 262144

MAX_TOOL_ROUNDS = 32
MAX_NEW_TOKENS = 2**12
MAX_TOOL_OUTPUT_CHARS = int(KIMI_MODEL_CONTEXT * 0.5 * 2.4)  # half of model context size
SHOW_IN_DOM_DEFAULT_DEPTH = 3

TRUNCATION_SUFFIX = "\n\n<!-- truncated: tool output capped. there is no way to see more -->"


def role() -> str:
    return (
        "You are a browser extension agent that modifies web pages based on user requests."
    )


def read_tools_snapshot_note(explore: ExploreTool, action: ActionTool) -> str:
    if explore == "get_dom":
        tools = "get_dom"
    elif explore == "get_map_of_dom":
        tools = "get_map_of_dom, show_in_dom"

    if action == "edit":
        action_tool = "edit"
    elif action == "set_update_rule":
        action_tool = "set_update_rule"

    return (
        f"Read tools ({tools}) always return the original page "
        f"snapshot. Changes from {action_tool} do not update what read tools "
        "show on later calls."
    )


def workflow(explore: ExploreTool, action: ActionTool) -> str:
    workflow: list[str] = list()

    if explore == "get_dom":
        workflow.append(
            "Call get_dom() to get the HTML of the page",
        )
    elif explore == "get_map_of_dom":
        workflow.append(
            "Call get_map_of_dom() to get an overview of the page structure",
        )

    workflow.append(
        "Identify candidate elements for the user's request",
    )
    
    if explore == "get_map_of_dom":
        workflow.append(
            "Use show_in_dom() to examine specific elements if you need more detail",
        )

    if explore == "get_map_of_dom" and action == "edit":
        workflow.extend(
            [
                "Before each edit(), call show_in_dom() on the target element with enough depth to include all HTML you will change, that is, without `<!-- -n children -->` comments",
                "Use that show_in_dom output for edits[].oldText verbatim. If the edits[].oldText has comments, the tool call will fail.",
            ]
        )

    if action == "edit":
        workflow.append(
            "Use edit() to change the page based on the user's request",
        )
    elif action == "set_update_rule":
        workflow.append(
            "Create update rules with specific selectors (prefer class names, data attributes, or tag names over structural paths)",
        )

    numbered_workflow = []

    for i in range(len(workflow)):
        numbered_workflow.append(f"{i + 1}. {workflow[i]}")

    return "Workflow:\n" + "\n".join(numbered_workflow)


def advice(action: ActionTool) -> str:
    advice: list[str] = []

    if action == "set_update_rule":
        advice.append("""Rules must be idempotent and deterministic:
- Running the same logic on the same element multiple times must produce the same result as running it once.
- If the rule reads child content (e.g. text, badge values) to decide whether to hide the element, it will be re-run after child content loads. This is expected — write logic that handles an empty/missing value gracefully by doing nothing (early return), so once the content is present the rule applies correctly.
- Avoid accumulating side effects: do not append to textContent, do not toggle classes — always set to an absolute value.
- Never use element.remove() when a condition check is involved; prefer element.style.display = 'none' so the rule can still run again if needed.""")

    be_thorough_on = "create rules" if action == "set_update_rule" else "apply edits"
    advice.append(
        "Be thorough - if there are multiple variations of elements matching the user's "
        f"request, {be_thorough_on} for each variation."
    )

    return "\n\n".join(advice)


@dataclass(frozen=True)
class PipelineConfigBase:
    id: PipelineId
    folder: str


@dataclass(frozen=True)
class PipelineConfig(PipelineConfigBase):
    tools: tuple[str, ...]
    system_prompt: str
    uses_rules: bool
    uses_edit: bool
    run_agent: bool
    model: str | None = None
    provider: AgentProvider | None = None


def build_pipeline_from_params(
    base: PipelineConfigBase,
    explore: ExploreTool,
    action: ActionTool,
    *,
    model: str | None = None,
    provider: AgentProvider | None = None,
) -> PipelineConfig:
    tools = ()

    if explore == "get_dom":
        tools += ("get_dom",)
    elif explore == "get_map_of_dom":
        tools += ("get_map_of_dom", "show_in_dom")

    if action == "edit":
        tools += ("edit",)
    elif action == "set_update_rule":
        tools += ("set_update_rule",)

    return PipelineConfig(
        id=base.id,
        folder=base.folder,
        tools=tools,
        system_prompt="\n\n".join(
            (
                role(),
                read_tools_snapshot_note(explore, action),
                workflow(explore, action),
                advice(action),
            )
        ),
        uses_rules=(action == "set_update_rule"),
        uses_edit=(action == "edit"),
        run_agent=True,
        model=model,
        provider=provider,
    )


PIPELINES: dict[PipelineId, PipelineConfig] = {
    "original": PipelineConfig(
        id="original",
        folder="1-original",
        tools=(),
        system_prompt="",
        uses_rules=False,
        uses_edit=False,
        run_agent=False,
    ),
    "baseline": build_pipeline_from_params(
        PipelineConfigBase(id="baseline", folder="2-baseline"),
        "get_dom",
        "edit",
    ),
    "engine-only": build_pipeline_from_params(
        PipelineConfigBase(id="engine-only", folder="3-engine-only"),
        "get_dom",
        "set_update_rule",
    ),
    "map-only": build_pipeline_from_params(
        PipelineConfigBase(id="map-only", folder="4-map-only"),
        "get_map_of_dom",
        "edit",
    ),
    "full": build_pipeline_from_params(
        PipelineConfigBase(id="full", folder="5-full"),
        "get_map_of_dom",
        "set_update_rule",
    ),
    "full-sonnet": build_pipeline_from_params(
        PipelineConfigBase(id="full-sonnet", folder="6-full-sonnet"),
        "get_map_of_dom",
        "set_update_rule",
        model=ANTHROPIC_MODEL_ID,
        provider="anthropic",
    ),
}


AGENT_PIPELINE_IDS: tuple[PipelineId, ...] = tuple(
    pid for pid, cfg in PIPELINES.items() if cfg.run_agent
)

PIPELINE_BY_FOLDER: dict[str, PipelineConfig] = {
    cfg.folder: cfg for cfg in PIPELINES.values()
}


def build_user_message(task: dict[str, str]) -> str:
    request_prompt = task.get("request-prompt", "").strip()

    if not request_prompt:
        raise ValueError("task.json must include request-prompt")

    return request_prompt
