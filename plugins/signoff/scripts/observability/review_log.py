"""
Parses docs/review-log.md - the checkpoint-review skill's append-only log of
completed interviews - into structured entries.

Expected format (see checkpoint-review/SKILL.md), one entry per stage:

    ## <stage> — <YYYY-MM-DD>
    <the honest assessment paragraph the interview ended with>

Tolerant of "—" or "-" between stage and date, and of "##"/"###" headers,
since the skill instruction doesn't hard-enforce the exact character. Falls
back to treating the whole file as one unparsed entry if no header matches
at all, so a differently-formatted file still shows up as something rather
than silently vanishing.
"""
import re
from pathlib import Path

HEADER_RE = re.compile(r"^#{1,3}\s*([A-Za-z0-9\-_]+)\s*[—\-]\s*(.+?)\s*$", re.MULTILINE)


def parse_review_log(path: Path):
    path = Path(path)
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    matches = list(HEADER_RE.finditer(text))
    if not matches:
        stripped = text.strip()
        return [{"stage": "unparsed", "date": "", "assessment": stripped}] if stripped else []

    entries = []
    for i, m in enumerate(matches):
        stage, date = m.group(1), m.group(2).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        entries.append({"stage": stage, "date": date, "assessment": body})
    return entries
