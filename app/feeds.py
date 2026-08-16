"""iCalendar (.ics) feed generation — RFC 5545.

Why this file exists
--------------------
Subscribing to a URL is the one calendar-sync path that needs no account, no
password and no SSL prompt on the device: iOS/macOS "Add Subscribed Calendar",
Google Calendar "From URL", Thunderbird, etc.  It is read-only, which is
exactly the trade we want — writing happens in this app's own UI.

Deliberate choices:

* **Floating time.**  DTSTART is written without a Z suffix and without TZID,
  so clients interpret it in the viewer's local timezone.  For a personal
  calendar this is what people expect ("09:00 stays 09:00") and it avoids
  shipping a VTIMEZONE block that clients disagree about.
* **Tasks are exported as VEVENT, not VTODO.**  Subscribed calendars in Apple
  Calendar silently drop VTODO — the tasks would simply never appear.  Dated
  tasks therefore become all-day events in a separate feed the user subscribes
  to (or not) independently.
* **Exceptions use the standard vocabulary.**  A deleted occurrence becomes an
  EXDATE on the master event; a moved/edited occurrence becomes a second
  VEVENT with the same UID and a RECURRENCE-ID pointing at the original slot.
  Apple/Google render both correctly.
* **Reminders become VALARM.**  Whether a subscribed calendar honours alarms
  is a client setting (iOS asks about "removing alarms" when subscribing),
  but the data is there and it costs nothing.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from recur import to_rrule

PRODID = "-//caltask//EN"


def esc(text: str) -> str:
    """RFC 5545 §3.3.11 text escaping."""
    return (str(text or "")
            .replace("\\", "\\\\")
            .replace(";", "\\;")
            .replace(",", "\\,")
            .replace("\r\n", "\\n")
            .replace("\n", "\\n"))


def fold(line: str) -> str:
    """Fold to 75 octets per RFC 5545 §3.1 (continuations start with a space).

    Folding is measured in BYTES, not characters — a Turkish 'ı' is two bytes,
    and splitting mid-character corrupts the feed.
    """
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    out, chunk = [], bytearray()
    limit = 75
    for ch in line:
        b = ch.encode("utf-8")
        if len(chunk) + len(b) > limit:
            out.append(chunk.decode("utf-8"))
            chunk = bytearray()
            limit = 74            # continuation lines carry a leading space
        chunk += b
    out.append(chunk.decode("utf-8"))
    return "\r\n ".join(out)


def _stamp(value: datetime) -> str:
    return value.strftime("%Y%m%dT%H%M%S")


def _day(value: date) -> str:
    return value.strftime("%Y%m%d")


def _emit_vevent(lines: list[str], it: dict, now: datetime) -> None:
    lines.append("BEGIN:VEVENT")
    lines.append(f"UID:{it['uid']}")
    lines.append(f"DTSTAMP:{_stamp(now)}")
    if it.get("recurrence_id") is not None:
        # This VEVENT replaces one occurrence of the series with the same UID.
        rid = it["recurrence_id"]
        if it.get("recurrence_id_all_day"):
            lines.append(f"RECURRENCE-ID;VALUE=DATE:{_day(rid)}")
        else:
            lines.append(f"RECURRENCE-ID:{_stamp(rid)}")
    if it["all_day"]:
        start: date = it["starts_at"].date() if isinstance(it["starts_at"], datetime) else it["starts_at"]
        end: date = it["ends_at"].date() if isinstance(it["ends_at"], datetime) else it["ends_at"]
        # DTEND is exclusive for all-day events; a one-day event ends the
        # next morning. Getting this wrong shifts everything by a day.
        lines.append(f"DTSTART;VALUE=DATE:{_day(start)}")
        lines.append(f"DTEND;VALUE=DATE:{_day(end + timedelta(days=1))}")
    else:
        lines.append(f"DTSTART:{_stamp(it['starts_at'])}")
        lines.append(f"DTEND:{_stamp(it['ends_at'])}")
    lines.append(f"SUMMARY:{esc(it['title'])}")
    if it.get("notes"):
        lines.append(f"DESCRIPTION:{esc(it['notes'])}")
    if it.get("location"):
        lines.append(f"LOCATION:{esc(it['location'])}")
    rrule = to_rrule(it.get("repeat", ""), it.get("repeat_every", 1),
                     it.get("repeat_until"), it.get("repeat_days"))
    if rrule:
        lines.append(f"RRULE:{rrule}")
    # Cancelled occurrences of the series (floating, mirrors DTSTART's shape).
    for ex in it.get("exdates") or []:
        if it["all_day"]:
            lines.append(f"EXDATE;VALUE=DATE:{_day(ex if isinstance(ex, date) and not isinstance(ex, datetime) else ex.date())}")
        else:
            lines.append(f"EXDATE:{_stamp(ex)}")
    for minutes in it.get("reminders") or []:
        lines.append("BEGIN:VALARM")
        lines.append("ACTION:DISPLAY")
        lines.append(f"DESCRIPTION:{esc(it['title'])}")
        lines.append(f"TRIGGER:-PT{int(minutes)}M")
        lines.append("END:VALARM")
    if it.get("status"):
        lines.append(f"STATUS:{it['status']}")
    lines.append("END:VEVENT")


def build(name: str, items: list[dict], now: datetime | None = None) -> str:
    """Render a VCALENDAR. Each item is a dict produced by the callers below.

    Recognised optional keys per item: exdates (list of datetime/date),
    reminders (list of int minutes), recurrence_id (+ recurrence_id_all_day),
    repeat_days (list of weekday ints), status.
    """
    now = now or datetime.now()
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{esc(name)}",
        # Hint to clients how often to poll; most treat it as advisory.
        "X-PUBLISHED-TTL:PT15M",
        "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    ]
    for it in items:
        _emit_vevent(lines, it, now)
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold(x) for x in lines) + "\r\n"
