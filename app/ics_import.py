"""Import: Google Calendar .ics and Google Takeout Tasks.json.

Pragmatic, not a full RFC-5545 parser — it targets what Google actually
exports, which is also the 95% case for any other calendar app:

* VEVENT with DTSTART/DTEND (date or datetime, TZID or Z or floating)
* RRULE FREQ/INTERVAL/UNTIL/COUNT/BYDAY (weekly day lists; monthly ordinal
  BYDAY like "1MO" is beyond our model and gets simplified, reported back)
* EXDATE (cancelled occurrences) and RECURRENCE-ID (moved/edited ones),
  which map 1:1 onto our event_overrides table
* VALARM display triggers -> our reminders (minutes before start)

Times: everything is converted to the SERVER's local wall clock and stored
floating, matching the app's "09:00 stays 09:00" model.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta

try:
    from zoneinfo import ZoneInfo
except ImportError:          # pragma: no cover
    ZoneInfo = None


def _unfold(text: str) -> list[str]:
    """RFC 5545 §3.1: continuation lines start with space/tab."""
    out: list[str] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and out:
            out[-1] += raw[1:]
        elif raw:
            out.append(raw)
    return out


def _unescape(v: str) -> str:
    return (v.replace("\\n", "\n").replace("\\N", "\n")
            .replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\"))


def _prop(line: str):
    """'DTSTART;TZID=Europe/Berlin:20260817T090000' -> (name, params, value)"""
    head, _, value = line.partition(":")
    parts = head.split(";")
    name = parts[0].upper()
    params = {}
    for p in parts[1:]:
        k, _, v = p.partition("=")
        params[k.upper()] = v
    return name, params, value


def _to_local(value: str, params: dict) -> tuple[datetime, bool]:
    """Parse an iCalendar date/date-time into SERVER-local naive dt.

    Returns (dt, is_all_day)."""
    value = value.strip()
    if params.get("VALUE") == "DATE" or (len(value) == 8 and value.isdigit()):
        return datetime.strptime(value, "%Y%m%d"), True
    utc = value.endswith("Z")
    raw = value.rstrip("Z")
    dt = datetime.strptime(raw[:15], "%Y%m%dT%H%M%S")
    tzid = params.get("TZID")
    if ZoneInfo is not None and (utc or tzid):
        try:
            src = ZoneInfo("UTC") if utc else ZoneInfo(tzid)
            local = datetime.now().astimezone().tzinfo
            dt = dt.replace(tzinfo=src).astimezone(local).replace(tzinfo=None)
        except Exception:
            pass                      # bilinmeyen dilim: duvar saati oldugu gibi
    return dt, False


def _trigger_minutes(value: str) -> int | None:
    """'-PT30M' / '-PT1H' / '-P1D' -> minutes before start."""
    m = re.fullmatch(r"-P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?", value.strip())
    if not m:
        return None
    d, h, mi, s = (int(x) if x else 0 for x in m.groups())
    total = d * 1440 + h * 60 + mi + (1 if s and not (d or h or mi) else 0)
    return total if total >= 0 else None


_BYDAY = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


def parse_ics(text: str) -> dict:
    """Return {'events': [...], 'notes': [...]}.

    Each event dict: title, notes, location, starts_at(dt), ends_at(dt),
    all_day, repeat, repeat_every, repeat_days(list), repeat_until(date|None),
    count(int|None), reminders(list[int]), uid, recurrence_id((dt,all_day)|None),
    exdates(list[dt]), cancelled(bool).
    """
    events, notes = [], []
    cur = None
    in_alarm = False
    for line in _unfold(text):
        name, params, value = _prop(line)
        if name == "BEGIN" and value == "VEVENT":
            cur = {"title": "(untitled)", "notes": None, "location": None,
                   "starts_at": None, "ends_at": None, "all_day": False,
                   "repeat": "", "repeat_every": 1, "repeat_days": [],
                   "repeat_until": None, "count": None, "reminders": [],
                   "uid": None, "recurrence_id": None, "exdates": [],
                   "cancelled": False, "duration": None}
            in_alarm = False
            continue
        if cur is None:
            continue
        if name == "BEGIN" and value == "VALARM":
            in_alarm = True
            continue
        if name == "END" and value == "VALARM":
            in_alarm = False
            continue
        if name == "END" and value == "VEVENT":
            if cur["starts_at"] is not None:
                if cur["ends_at"] is None:
                    if cur["duration"] is not None:
                        cur["ends_at"] = cur["starts_at"] + cur["duration"]
                    else:
                        cur["ends_at"] = cur["starts_at"]
                elif cur["all_day"]:
                    # DTEND exclusive -> bizde kapsayici
                    cur["ends_at"] = cur["ends_at"] - timedelta(days=1)
                    if cur["ends_at"] < cur["starts_at"]:
                        cur["ends_at"] = cur["starts_at"]
                events.append(cur)
            cur = None
            continue
        if in_alarm:
            if name == "TRIGGER" and "VALUE" not in params:
                m = _trigger_minutes(value)
                if m is not None and m not in cur["reminders"]:
                    cur["reminders"].append(m)
            continue
        if name == "DTSTART":
            cur["starts_at"], cur["all_day"] = _to_local(value, params)
        elif name == "DTEND":
            cur["ends_at"], _ = _to_local(value, params)
        elif name == "DURATION":
            m = re.fullmatch(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?", value.strip())
            if m:
                d, h, mi, s = (int(x) if x else 0 for x in m.groups())
                cur["duration"] = timedelta(days=d, hours=h, minutes=mi, seconds=s)
        elif name == "SUMMARY":
            cur["title"] = _unescape(value)[:200] or "(untitled)"
        elif name == "DESCRIPTION":
            cur["notes"] = _unescape(value) or None
        elif name == "LOCATION":
            cur["location"] = _unescape(value) or None
        elif name == "UID":
            cur["uid"] = value.strip()
        elif name == "STATUS" and value.strip().upper() == "CANCELLED":
            cur["cancelled"] = True
        elif name == "RECURRENCE-ID":
            cur["recurrence_id"] = _to_local(value, params)
        elif name == "EXDATE":
            for part in value.split(","):
                dt, _ = _to_local(part, params)
                cur["exdates"].append(dt)
        elif name == "RRULE":
            rule = dict(p.partition("=")[::2] for p in value.split(";"))
            freq = rule.get("FREQ", "").upper()
            eslek = {"DAILY": "daily", "WEEKLY": "weekly",
                     "MONTHLY": "monthly", "YEARLY": "yearly"}
            if freq not in eslek:
                notes.append(f"unsupported FREQ={freq}: '{cur['title']}' imported without repeat")
                continue
            cur["repeat"] = eslek[freq]
            try:
                cur["repeat_every"] = max(1, int(rule.get("INTERVAL", "1")))
            except ValueError:
                pass
            if "UNTIL" in rule:
                u, _ = _to_local(rule["UNTIL"], {})
                cur["repeat_until"] = u.date()
            if "COUNT" in rule:
                try:
                    cur["count"] = max(1, int(rule["COUNT"]))
                except ValueError:
                    pass
            if "BYDAY" in rule:
                gunler, sorunlu = [], False
                for tok in rule["BYDAY"].split(","):
                    tok = tok.strip().upper()
                    if tok in _BYDAY:
                        gunler.append(_BYDAY[tok])
                    else:
                        sorunlu = True   # '1MO' gibi sirali gunler modelimizde yok
                if cur["repeat"] == "weekly" and gunler and not sorunlu:
                    cur["repeat_days"] = sorted(gunler)
                elif sorunlu or cur["repeat"] != "weekly":
                    notes.append(f"BYDAY simplified: '{cur['title']}'")
            for k in ("BYMONTHDAY", "BYSETPOS", "BYMONTH"):
                if k in rule:
                    notes.append(f"{k} simplified: '{cur['title']}'")
                    break
    return {"events": events, "notes": notes}


_GUNAD = {"MONDAY": 0, "TUESDAY": 1, "WEDNESDAY": 2, "THURSDAY": 3,
          "FRIDAY": 4, "SATURDAY": 5, "SUNDAY": 6}


def _sched_to_local(raw) -> tuple[str | None, str | None]:
    """Takeout 'scheduled_time' -> (due_date, due_time|None), SERVER-local.

    The field is not JSON but a Python-ish string: "[{'current': True,
    'start': '2026-08-17T05:00:00Z', ...}]".  The 'current' entry's start
    wins; UTC converts to local; local midnight means date-only."""
    metin = str(raw or "")
    m = (re.search(r"'current':\s*True[^}]*?'start':\s*'([^']+)'", metin)
         or re.search(r"'start':\s*'([^']+)'[^}]*?'current':\s*True", metin)
         or re.search(r"'start':\s*'([^']+)'", metin))
    if not m:
        m2 = re.match(r"(\d{4}-\d{2}-\d{2})", metin)
        return (m2.group(1) if m2 else None), None
    try:
        dt, _ = _to_local(m.group(1).replace("-", "").replace(":", "").replace("T", "T"), {})
    except Exception:
        # ISO bicimi: 2026-08-17T05:00:00Z -> _to_local'in bekledigi kompakta cevir
        iso = m.group(1)
        try:
            base = datetime.strptime(iso.rstrip("Z")[:19], "%Y-%m-%dT%H:%M:%S")
            if iso.endswith("Z") and ZoneInfo is not None:
                local = datetime.now().astimezone().tzinfo
                base = base.replace(tzinfo=ZoneInfo("UTC")).astimezone(local).replace(tzinfo=None)
            dt = base
        except Exception:
            return None, None
    # Google stores DATE-ONLY tasks as a midnight timestamp in whatever zone
    # they were created in; converted to server-local that lands on 22:00,
    # 23:00, 01:00... (measured: 2.561 imported tasks carried a fake 23:00).
    # A whole-hour time in the dead of night is an artifact, not a schedule.
    if dt.minute == 0 and dt.hour in (22, 23, 0, 1, 2):
        return dt.date().isoformat(), None
    return dt.date().isoformat(), f"{dt.hour:02d}:{dt.minute:02d}"


def _rule_to_repeat(schedule: dict):
    """Takeout recurrences[].schedule -> (repeat, every, days[]) | None."""
    iv = schedule.get("interval") or {}
    every = max(1, int(iv.get("interval_multiplier") or 1))
    if "daily" in iv:
        return "daily", every, []
    if "weekly" in iv:
        gunler = sorted(_GUNAD[g] for g in (iv["weekly"].get("day_of_week") or [])
                        if g in _GUNAD)
        return "weekly", every, gunler
    if "monthly" in iv:
        return "monthly", every, []
    if "yearly" in iv:
        return "yearly", every, []
    return None


def parse_gtasks(data) -> dict:
    """Google Takeout Tasks JSON -> {'lists': [...], 'notes': [...]}.

    Two shapes are recognised:
    * Real Takeout (measured against an actual export, Aug 2026): tasks
      carry 'scheduled_time' (a Python-ish string) + 'task_recurrence_id',
      and the RULES live in a list-level 'recurrences' array. Google dumps
      every occurrence of a recurring task as its own row (10k rows!) —
      we import the RULES, not the copies: one recurring task per rule,
      due = the next open occurrence. Copies (completed archive included)
      are skipped.
    * Tasks-API shape (a 'due' field) — the simple path, used by tests and
      other tools."""
    if isinstance(data, dict):
        raw_lists = data.get("items") or data.get("lists") or []
    elif isinstance(data, list):
        raw_lists = data
    else:
        raw_lists = []
    out, notes = [], []
    for lst in raw_lists:
        if not isinstance(lst, dict):
            continue
        gorevler = [t for t in (lst.get("items") or lst.get("tasks") or [])
                    if isinstance(t, dict) and str(t.get("title", "")).strip()]
        satirlar = []
        kurallar = lst.get("recurrences") or []
        kuralli_acik: dict = {}
        kural_son: dict = {}          # rid -> newest copy date seen
        kural_not: dict = {}          # rid -> newest copy's NOTES (Google
                                      # stores notes on the copies!)
        for t in gorevler:
            rid = t.get("task_recurrence_id")
            if not rid:
                continue
            due, saat = _sched_to_local(t.get("scheduled_time"))
            if due:
                if due > kural_son.get(rid, ""):
                    kural_son[rid] = due
                    if t.get("notes"):
                        kural_not[rid] = str(t["notes"])
                elif t.get("notes") and rid not in kural_not:
                    kural_not[rid] = str(t["notes"])
                if str(t.get("status", "")).lower() != "completed" and (
                        rid not in kuralli_acik or due < kuralli_acik[rid][0]):
                    kuralli_acik[rid] = (due, saat)
        eski_kural = 0
        for r in kurallar:
            cevrim = _rule_to_repeat(r.get("schedule") or {})
            if not cevrim:
                notes.append(f"recurrence rule not translatable: '{r.get('title', '?')}'")
                continue
            rep, every, gunler = cevrim
            # ENDED RULES: Google records "delete this and following" /
            # "stop routine" as end_condition / stopped on the rule but
            # never deletes it. These must be skipped, or routines the
            # user deliberately ended come back from the dead.
            son_kosul = (r.get("schedule") or {}).get("end_condition") or {}
            sinir = str(son_kosul.get("date_boundary") or "")[:10]
            if (str(r.get("stopped", "")).lower() == "true"
                    or "instance_number_limit" in son_kosul
                    or (sinir and sinir <= date.today().isoformat())):
                eski_kural += 1
                continue
            if sinir:
                notes.append(f"future end date not supported, track manually: '{r.get('title','?')}' → {sinir}")
            # FRESHNESS: Google keeps dead rules around for years. A rule
            # whose newest copy is stale for its cadence is not imported —
            # birthdays are yearly, so they pass this filter.
            esik_gun = {"daily": 60, "weekly": 90, "monthly": 200, "yearly": 430}[rep] * max(1, every)
            son = kural_son.get(r.get("id"))
            if son and (date.today() - date.fromisoformat(son)).days > esik_gun:
                eski_kural += 1
                continue
            due, saat = kuralli_acik.get(r.get("id"), (None, None))
            if not due:
                # No open copy (this year's birthday may just be completed!)
                # — SKIPPING the rule would lose all future repeats. Compute
                # the next date from the rule itself (first one >= today).
                m0 = re.match(r"(\d{4}-\d{2}-\d{2})",
                              str((r.get("schedule") or {}).get("first_instance_date") or ""))
                if m0:
                    try:
                        import recur as _recur
                        ilk = datetime.strptime(m0.group(1), "%Y-%m-%d")
                        bugun = date.today()
                        for s2, _e2 in _recur.expand(ilk, ilk, rep, every, None,
                                                     bugun, bugun + timedelta(days=800),
                                                     gunler or None):
                            due = s2.date().isoformat()
                            break
                    except Exception:
                        due = None
                if not due:
                    notes.append(f"no open occurrence and next date not computable: '{r.get('title', '?')}'")
                    continue
                notes.append(f"scheduled at its next occurrence: '{r.get('title', '?')}' → {due}")
            satirlar.append({
                "title": str(r.get("title") or "?").strip()[:200],
                "notes": kural_not.get(r.get("id")),
                "due": due, "due_time": saat, "done": False, "done_at": None,
                "gid": f"rule-{r.get('id')}", "parent": None,
                "repeat": rep, "repeat_every": every,
                "repeat_days": ",".join(str(g) for g in gunler),
            })
        atlanan_kopya = 0
        for t in gorevler:
            if t.get("task_recurrence_id"):
                atlanan_kopya += 1
                continue
            if "due" in t or "scheduled_time" not in t and not lst.get("recurrences"):
                due = None
                m = re.match(r"(\d{4}-\d{2}-\d{2})", str(t.get("due") or ""))
                if m:
                    due = m.group(1)
                saat = None
            else:
                due, saat = _sched_to_local(t.get("scheduled_time"))
            bitti = str(t.get("status", "")).lower() == "completed"
            bitis = None
            mm = re.match(r"(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})", str(t.get("completed") or ""))
            if mm:
                bitis = f"{mm.group(1)} {mm.group(2)}"
            satirlar.append({
                "title": str(t["title"]).strip()[:200],
                "notes": (str(t.get("notes")) or None) if t.get("notes") else None,
                "due": due, "due_time": saat, "done": bitti, "done_at": bitis,
                "gid": t.get("id"), "parent": t.get("parent"),
                "repeat": "", "repeat_every": 1, "repeat_days": "",
            })
        if atlanan_kopya:
            notes.append(f"{atlanan_kopya} recurring copies folded into rules ('{lst.get('title')}')")
        if eski_kural:
            notes.append(f"{eski_kural} stale/ended recurrence rules skipped ('{lst.get('title')}')")
        out.append({"title": str(lst.get("title") or "Tasks")[:80], "tasks": satirlar})
    return {"lists": out, "notes": notes}
