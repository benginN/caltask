"""Recurrence expansion.

Deliberately small: daily / weekly / monthly / yearly with an interval, an
optional end date, and (weekly only) an optional set of weekdays — "every
week on Mon and Thu".  That is what a personal calendar actually uses, and it
can be expressed in an RFC-5545 RRULE so the .ics feeds stay
standards-compliant (FREQ / INTERVAL / UNTIL / BYDAY / WKST).

The window-based API (`expand`) is what the grid calls: give it a date range,
get back concrete occurrences.  Nothing is ever materialised in the database.
Per-occurrence exceptions are NOT this module's job — the caller filters and
patches occurrences with `event_overrides` rows (see main.py), keyed by the
original occurrence date that this module generates.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

VALID = ("", "daily", "weekly", "monthly", "yearly")

# Guard against a pathological series (e.g. daily forever) painting a huge
# window: no single expansion may produce more than this many occurrences.
MAX_OCCURRENCES = 750

_BYDAY_NAMES = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")  # index = Python weekday()


def parse_days(value: str | None) -> list[int]:
    """'0,2,4' -> [0, 2, 4]; garbage and out-of-range values are dropped."""
    out: list[int] = []
    for part in (value or "").split(","):
        part = part.strip()
        if part.isdigit() and 0 <= int(part) <= 6 and int(part) not in out:
            out.append(int(part))
    return sorted(out)


def _add_months(d: datetime, months: int) -> datetime:
    """Month arithmetic that clamps to the end of shorter months.

    31 Jan + 1 month -> 28/29 Feb (not 3 March).  Clamping is what calendar
    apps do and it keeps 'monthly on the 31st' from silently skipping months.
    """
    year = d.year + (d.month - 1 + months) // 12
    month = (d.month - 1 + months) % 12 + 1
    day = d.day
    while day > 0:
        try:
            return d.replace(year=year, month=month, day=day)
        except ValueError:
            day -= 1
    return d


def _step(start: datetime, rule: str, every: int, n: int) -> datetime:
    every = max(1, every)
    if rule == "daily":
        return start + timedelta(days=every * n)
    if rule == "weekly":
        return start + timedelta(weeks=every * n)
    if rule == "monthly":
        return _add_months(start, every * n)
    if rule == "yearly":
        return _add_months(start, every * n * 12)
    return start


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _expand_weekly_days(starts_at: datetime, duration: timedelta, every: int,
                        days: list[int], until: date | None,
                        window_from: date, window_to: date):
    """Weekly rule with an explicit weekday set (RRULE ...;BYDAY=...;WKST=MO).

    Weeks are counted from the week containing the series start (Monday
    weeks), occurrences before the series start are skipped — the same
    interpretation every RFC-5545 client uses with WKST=MO.
    """
    base_week = _monday(starts_at.date())
    wk = 0
    gap_weeks = (window_from - base_week).days // 7
    if gap_weeks > 0:
        wk = max(0, gap_weeks // every - 1)

    produced = 0
    while produced < MAX_OCCURRENCES:
        monday = base_week + timedelta(weeks=wk * every)
        if monday > window_to:
            return
        for dow in days:
            d = monday + timedelta(days=dow)
            if d < starts_at.date() or d > window_to:
                continue
            if until and d > until:
                return          # days are sorted, weeks ascend — safe to stop
            s = datetime.combine(d, starts_at.time())
            e = s + duration
            if e.date() >= window_from:
                produced += 1
                yield s, e
        wk += 1


def expand(starts_at: datetime, ends_at: datetime, rule: str, every: int,
           until: date | None, window_from: date, window_to: date,
           days: list[int] | None = None):
    """Yield (start, end) pairs overlapping [window_from, window_to].

    `window_to` is inclusive. Non-repeating items yield at most one pair.
    `days` applies to weekly rules only (weekday numbers, 0=Monday).
    """
    duration = ends_at - starts_at
    if duration.total_seconds() < 0:
        duration = timedelta(0)

    if rule not in VALID or not rule:
        if starts_at.date() <= window_to and ends_at.date() >= window_from:
            yield starts_at, ends_at
        return

    every = max(1, every)

    if rule == "weekly" and days:
        yield from _expand_weekly_days(starts_at, duration, every, sorted(days),
                                       until, window_from, window_to)
        return

    # Jump close to the window instead of walking from the series start —
    # a daily event created years ago must not cost thousands of iterations.
    n = 0
    if rule == "daily":
        gap = (window_from - starts_at.date()).days
        if gap > 0:
            n = max(0, gap // every - 1)
    elif rule == "weekly":
        gap = (window_from - starts_at.date()).days
        if gap > 0:
            n = max(0, gap // (7 * every) - 1)
    elif rule in ("monthly", "yearly"):
        months = (window_from.year - starts_at.year) * 12 + (window_from.month - starts_at.month)
        per = every * (1 if rule == "monthly" else 12)
        if months > 0:
            n = max(0, months // per - 1)

    produced = 0
    while produced < MAX_OCCURRENCES:
        s = _step(starts_at, rule, every, n)
        n += 1
        if s.date() > window_to:
            return
        if until and s.date() > until:
            return
        e = s + duration
        if e.date() >= window_from:
            produced += 1
            yield s, e


def to_rrule(rule: str, every: int, until: date | None,
             days: list[int] | None = None) -> str:
    """RFC-5545 RRULE line body, or '' when the item does not repeat."""
    if rule not in VALID or not rule:
        return ""
    freq = {"daily": "DAILY", "weekly": "WEEKLY",
            "monthly": "MONTHLY", "yearly": "YEARLY"}[rule]
    parts = [f"FREQ={freq}"]
    if every and every > 1:
        parts.append(f"INTERVAL={int(every)}")
    if rule == "weekly" and days:
        parts.append("BYDAY=" + ",".join(_BYDAY_NAMES[d] for d in sorted(days)))
        parts.append("WKST=MO")   # our weeks are Monday-based; say so explicitly
    if until:
        parts.append(f"UNTIL={until.strftime('%Y%m%d')}T235959")
    return ";".join(parts)


def next_due(current: date, rule: str, every: int,
             days: list[int] | None = None) -> date | None:
    """Next due date for a repeating task that was just completed.

    Weekly with a weekday set: the next selected weekday AFTER `current`,
    week intervals counted Monday-based from current's week — so a
    Mon+Tue+Fri task completed on Tuesday lands on Friday, not next week.
    """
    if rule not in VALID or not rule:
        return None
    if rule == "weekly" and days:
        base_monday = _monday(current)
        d = current + timedelta(days=1)
        for _ in range(7 * max(1, every) + 8):
            week_idx = (_monday(d) - base_monday).days // 7
            if week_idx % max(1, every) == 0 and d.weekday() in days:
                return d
            d += timedelta(days=1)
        return None
    nxt = _step(datetime(current.year, current.month, current.day), rule, every, 1)
    return nxt.date()
