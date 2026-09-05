from __future__ import annotations

import email
import quopri
from pathlib import Path


def extract_page_html(mhtml_path: Path) -> str:
    """Return the QP-decoded HTML of the first text/html part in an MHTML file."""
    raw = mhtml_path.read_bytes()
    msg = email.message_from_bytes(raw)

    for part in msg.walk():
        if part.get_content_type() == "text/html":
            payload = part.get_payload(decode=False)
            if isinstance(payload, bytes):
                return payload.decode(part.get_content_charset() or "utf-8", errors="replace")
            if isinstance(payload, str):
                encoding = part.get("Content-Transfer-Encoding", "").lower()
                if encoding == "quoted-printable":
                    decoded = quopri.decodestring(payload.encode("ascii", errors="replace"))
                    return decoded.decode(part.get_content_charset() or "utf-8", errors="replace")
                return payload

    raise ValueError(f"No text/html part found in {mhtml_path}")
