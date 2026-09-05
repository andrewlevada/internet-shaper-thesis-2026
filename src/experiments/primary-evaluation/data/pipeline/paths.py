from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True)
class AgentVariantPaths:
    variant_dir: Path
    work_dir: Path
    raw_html: Path
    visible_html: Path
    page_html: Path
    index_html: Path
    agent_log: Path
    rules_json: Path
    screenshot: Path


def agent_variant_paths(variant_dir: Path) -> AgentVariantPaths:
    work = variant_dir / "work"
    return AgentVariantPaths(
        variant_dir=variant_dir,
        work_dir=work,
        raw_html=work / "raw.html",
        visible_html=work / "visible.html",
        page_html=work / "page.html",
        index_html=variant_dir / "index.html",
        agent_log=variant_dir / "agent.log",
        rules_json=variant_dir / "rules.json",
        screenshot=variant_dir / "screenshot.png",
    )

