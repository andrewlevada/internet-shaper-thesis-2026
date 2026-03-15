#!/usr/bin/env python3
"""
Extract Claude Code conversation history for this project.

Usage:
    python3 supplementary/extract-claude-history.py > claude-code-history.md

Or to just preview:
    python3 supplementary/extract-claude-history.py

The script reads from Claude Code's history storage at:
    ~/.claude/projects/-Users-andrewlevada-Projects-my-internet-shaper/*.jsonl

Output format:
    - Messages grouped by session
    - Session timestamp shown as header
    - System commands filtered out
    - Declined tool uses marked with *[Declined tool use]*
    - Very long pasted content (like docs) truncated with note
"""

import glob
import json
from collections import defaultdict
from datetime import datetime

# Path to Claude Code history for this project
# Adjust if your username or project path differs
HISTORY_PATH = "/Users/andrewlevada/.claude/projects/-Users-andrewlevada-Projects-my-internet-shaper/*.jsonl"


def extract_history():
    sessions = defaultdict(list)

    for filepath in glob.glob(HISTORY_PATH):
        with open(filepath, "r") as f:
            for line in f:
                try:
                    data = json.loads(line)
                    if data.get("type") == "user":
                        content = data.get("message", {}).get("content", "")
                        session_id = data.get("sessionId", "unknown")
                        timestamp = data.get("timestamp", "")

                        # Handle string content (regular messages)
                        if isinstance(content, str) and content:
                            # Filter out system commands
                            if content.startswith("<local-command"):
                                continue
                            if content.startswith("<command-name"):
                                continue
                            if "<local-command-stdout>" in content:
                                continue
                            if "<local-command-stderr>" in content:
                                continue

                            sessions[session_id].append(
                                {
                                    "timestamp": timestamp,
                                    "content": content,
                                    "type": "message",
                                }
                            )

                        # Handle array content (tool results with user responses)
                        elif isinstance(content, list):
                            for item in content:
                                if isinstance(item, dict):
                                    # Check for declined tool use
                                    if (
                                        item.get("is_error")
                                        and "rejected"
                                        in str(item.get("content", "")).lower()
                                    ):
                                        sessions[session_id].append(
                                            {
                                                "timestamp": timestamp,
                                                "content": "[Declined tool use]",
                                                "type": "declined",
                                            }
                                        )
                                    # Check for user text response
                                    elif item.get("type") == "text":
                                        text = item.get("text", "")
                                        if text and not text.startswith(
                                            "[Request interrupted"
                                        ):
                                            sessions[session_id].append(
                                                {
                                                    "timestamp": timestamp,
                                                    "content": text,
                                                    "type": "response",
                                                }
                                            )
                except json.JSONDecodeError:
                    continue

    # Sort sessions by their first message timestamp
    sorted_sessions = sorted(
        sessions.items(), key=lambda x: x[1][0]["timestamp"] if x[1] else ""
    )

    # Output
    output = []
    output.append("# Claude Code History - Full User Messages\n")
    output.append("Extracted from Claude Code conversation history for this project.")
    output.append("Grouped by session.\n")

    for session_id, messages in sorted_sessions:
        messages.sort(key=lambda x: x["timestamp"])

        if messages:
            first_ts = messages[0]["timestamp"]
            try:
                dt = datetime.fromisoformat(first_ts.replace("Z", "+00:00"))
                session_date = dt.strftime("%Y-%m-%d %H:%M")
            except:
                session_date = first_ts[:16] if first_ts else "Unknown"

            output.append(f"## Session: {session_date}\n")

            for msg in messages:
                content = msg["content"].strip()
                msg_type = msg.get("type", "message")

                # Truncate very long pasted content (like docs)
                if len(content) > 2000 and "```" in content:
                    first_line = content.split("\n")[0][:200]
                    output.append(f"- {first_line}... *(pasted documentation)*\n")
                elif msg_type == "declined":
                    output.append(f"- *{content}*\n")
                elif msg_type == "response":
                    output.append(f"- **[Response]** {content}\n")
                else:
                    output.append(f"- {content}\n")

            output.append("---\n")

    return "\n".join(output)


if __name__ == "__main__":
    print(extract_history())
