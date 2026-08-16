"""A self-contained calendar + tasks server.

One container, one SQLite file, no external services and no CDN — it must run
offline on a Raspberry Pi and still be publishable as a standalone project.

    docker run -p 8090:8090 -v ./data:/data <image>

Environment
    PORT         listen port (default 8090)
    TZ           timezone for "today" (default system)
    DB_PATH      SQLite path (default /data/calendar.db)
    LANG         default UI language: tr | en (default tr)
    FIRST_WEEKDAY 0=Monday (default) .. 6=Sunday
    BASE_URL     absolute base used in .ics feed hints (optional)
    AUTH_TOKEN   when set, the API and UI require this token
    FEED_TOKEN   when set, .ics feeds require ?token=... (subscribe-safe)

Recurring-edit model (mirrors Google Calendar / RFC 5545):
    scope=all        edit the whole series (times shift by the drag delta)
    scope=one        a row in event_overrides keyed by the ORIGINAL occurrence
                     date — like a RECURRENCE-ID VEVENT
    scope=following  split: old series ends the day before, a new series row
                     starts at the edited occurrence
"""
from __future__ import annotations

import os
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import feeds
import ics_import
import recur
import store
from store import fmt_dt, parse_dt, tx, week_start

STATIC = Path(__file__).parent / "static"
LANG = os.environ.get("LANG_UI", "en")[:2].lower()
FIRST_WEEKDAY = int(os.environ.get("FIRST_WEEKDAY", "0"))
AUTH_TOKEN = os.environ.get("AUTH_TOKEN", "")
FEED_TOKEN = os.environ.get("FEED_TOKEN", "")
BASE_URL = os.environ.get("BASE_URL", "").rstrip("/")

app = FastAPI(title="Calendar & Tasks", docs_url=None, redoc_url=None)
store.init()


# ── auth (optional, off by default) ─────────────────────────────────────────
@app.middleware("http")
async def guard(request: Request, call_next):
    path = request.url.path
    if AUTH_TOKEN and not path.startswith("/healthz"):
        supplied = (request.headers.get("x-auth-token")
                    or request.query_params.get("token")
                    or request.cookies.get("auth_token") or "")
        if supplied != AUTH_TOKEN:
            return PlainTextResponse("unauthorized", status_code=401)
    return await call_next(request)


# ── models ──────────────────────────────────────────────────────────────────
class EventIn(BaseModel):
    """All fields optional: POST validates what it needs, PATCH is partial."""
    title: str | None = None
    starts_at: str | None = None
    ends_at: str | None = None
    all_day: bool | None = None
    notes: str | None = None
    location: str | None = None
    calendar_id: int | None = None
    repeat: str | None = None
    repeat_every: int | None = None
    repeat_days: str | None = None
    repeat_until: str | None = None
    color: str | None = None
    reminders: str | None = None


class TaskIn(BaseModel):
    title: str | None = None
    list_id: int | None = None
    parent_id: int | None = None
    notes: str | None = None
    due_date: str | None = None
    due_time: str | None = None
    done: bool | None = None
    position: int | None = None
    repeat: str | None = None
    repeat_every: int | None = None
    repeat_days: str | None = None


class NameIn(BaseModel):
    name: str
    color: str | None = None
    position: int | None = None
    visible: bool | None = None


class ReorderIn(BaseModel):
    list_id: int
    ids: list[int]


class ImportIcsIn(BaseModel):
    ics: str


class ImportTasksIn(BaseModel):
    data: dict | list


class DetachIn(BaseModel):
    """Move ONE occurrence of a routine task without touching the series."""
    due_date: str
    due_time: str | None = None


def today() -> date:
    return datetime.now().date()


def _norm_repeat(value: str | None) -> str:
    value = (value or "").strip().lower()
    return value if value in recur.VALID else ""


def _norm_days(value: str | None) -> str:
    return ",".join(str(d) for d in recur.parse_days(value))


def _norm_reminders(value: str | None) -> str:
    """'10, 1440' -> '10,1440'; capped, deduped, minutes only."""
    out: list[int] = []
    for part in (value or "").split(","):
        part = part.strip()
        if part.isdigit() and int(part) <= 40320 and int(part) not in out:
            out.append(int(part))
    return ",".join(str(m) for m in sorted(out)[:5])


def _norm_color(value: str | None) -> str | None:
    v = (value or "").strip()
    if len(v) == 7 and v[0] == "#" and all(ch in "0123456789abcdefABCDEF" for ch in v[1:]):
        return v.lower()
    return None


# ── config ──────────────────────────────────────────────────────────────────
@app.get("/healthz")
async def healthz():
    with tx() as c:
        events = c.execute("SELECT COUNT(*) FROM events WHERE deleted_at IS NULL").fetchone()[0]
        tasks = c.execute("SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL").fetchone()[0]
    return {"status": "ok", "events": events, "tasks": tasks}


@app.get("/api/config")
async def config():
    return {"lang": LANG, "first_weekday": FIRST_WEEKDAY,
            "feed_token": bool(FEED_TOKEN), "base_url": BASE_URL,
            "today": today().isoformat()}


# ── calendars & lists ───────────────────────────────────────────────────────
@app.get("/api/calendars")
async def calendars():
    with tx() as c:
        rows = c.execute("SELECT * FROM calendars ORDER BY position, id").fetchall()
    return [dict(r) for r in rows]


@app.post("/api/calendars")
async def calendar_create(body: NameIn):
    with tx() as c:
        cur = c.execute(
            "INSERT INTO calendars(name,color,position) VALUES (?,?,?)",
            (body.name.strip()[:80] or "Calendar", body.color or "#5b9dff",
             body.position or 0))
    return {"id": cur.lastrowid}


@app.patch("/api/calendars/{cid}")
async def calendar_update(cid: int, body: NameIn):
    with tx() as c:
        c.execute("UPDATE calendars SET name=COALESCE(?,name), color=COALESCE(?,color),"
                  " visible=COALESCE(?,visible) WHERE id=?",
                  (body.name.strip()[:80] if body.name else None, body.color,
                   None if body.visible is None else int(body.visible), cid))
    return {"status": "ok"}


@app.delete("/api/calendars/{cid}")
async def calendar_delete(cid: int):
    with tx() as c:
        c.execute("DELETE FROM calendars WHERE id=?", (cid,))
    return {"status": "ok"}


@app.get("/api/lists")
async def lists():
    with tx() as c:
        rows = c.execute("SELECT * FROM task_lists ORDER BY position, id").fetchall()
    return [dict(r) for r in rows]


@app.post("/api/lists")
async def list_create(body: NameIn):
    with tx() as c:
        cur = c.execute("INSERT INTO task_lists(name,color,position) VALUES (?,?,?)",
                        (body.name.strip()[:80] or "List", body.color or "#3fbf7f",
                         body.position or 0))
    return {"id": cur.lastrowid}


@app.patch("/api/lists/{lid}")
async def list_update(lid: int, body: NameIn):
    with tx() as c:
        c.execute("UPDATE task_lists SET name=COALESCE(?,name), color=COALESCE(?,color),"
                  " position=COALESCE(?,position) WHERE id=?",
                  (body.name.strip()[:80] if body.name else None, body.color,
                   body.position, lid))
    return {"status": "ok"}


@app.delete("/api/lists/{lid}")
async def list_delete(lid: int):
    with tx() as c:
        remaining = c.execute("SELECT COUNT(*) FROM task_lists").fetchone()[0]
        if remaining <= 1:
            return JSONResponse({"error": "last_list"}, status_code=400)
        c.execute("DELETE FROM task_lists WHERE id=?", (lid,))
    return {"status": "ok"}


# ── events ──────────────────────────────────────────────────────────────────
def _recur_sig(row) -> tuple:
    return (row["repeat"], row["repeat_every"], row["repeat_days"], row["repeat_until"])


def _merged_event(row, body: EventIn) -> dict:
    """Row values with body's provided fields laid on top (PATCH semantics)."""
    all_day = row["all_day"] if body.all_day is None else int(bool(body.all_day))
    start = parse_dt(body.starts_at) if body.starts_at else parse_dt(row["starts_at"])
    if body.ends_at:
        end = parse_dt(body.ends_at)
    elif body.starts_at:
        # start moved without an explicit end: keep the original duration
        end = start + (parse_dt(row["ends_at"]) - parse_dt(row["starts_at"]))
    else:
        end = parse_dt(row["ends_at"])
    if end < start:
        end = start
    return {
        "calendar_id": row["calendar_id"] if body.calendar_id is None else body.calendar_id,
        "title": (body.title.strip()[:200] if body.title else row["title"]) or "(untitled)",
        "notes": row["notes"] if body.notes is None else (body.notes or None),
        "location": row["location"] if body.location is None else (body.location or None),
        "starts_at": fmt_dt(start, all_day), "ends_at": fmt_dt(end, all_day),
        "all_day": all_day,
        "repeat": row["repeat"] if body.repeat is None else _norm_repeat(body.repeat),
        "repeat_every": row["repeat_every"] if body.repeat_every is None else max(1, body.repeat_every),
        "repeat_days": row["repeat_days"] if body.repeat_days is None else _norm_days(body.repeat_days),
        "repeat_until": row["repeat_until"] if body.repeat_until is None else (body.repeat_until or None),
        "color": row["color"] if body.color is None else _norm_color(body.color),
        "reminders": row["reminders"] if body.reminders is None else _norm_reminders(body.reminders),
    }


def _align_weekly_start(values: dict) -> dict:
    """Weekly rule whose start weekday is not in repeat_days: shift the start
    forward to the first selected weekday (what Google does when you pick
    days that exclude the start).  Without this the event never shows on its
    own start date — the '16 Aug: recurring events look broken' bug."""
    if values.get("repeat") == "weekly" and values.get("repeat_days"):
        days = recur.parse_days(values["repeat_days"])
        s = parse_dt(values["starts_at"])
        if days and s.weekday() not in days:
            e = parse_dt(values["ends_at"])
            for i in range(1, 8):
                if (s + timedelta(days=i)).weekday() in days:
                    values["starts_at"] = fmt_dt(s + timedelta(days=i), values["all_day"])
                    values["ends_at"] = fmt_dt(e + timedelta(days=i), values["all_day"])
                    break
    return values


def _write_event(c, values: dict, eid: int | None = None) -> int:
    cols = ("calendar_id", "title", "notes", "location", "starts_at", "ends_at",
            "all_day", "repeat", "repeat_every", "repeat_days", "repeat_until",
            "color", "reminders")
    if eid is None:
        cur = c.execute(
            f"INSERT INTO events({','.join(cols)},uid) VALUES ({','.join('?' * len(cols))},?)",
            tuple(values[k] for k in cols) + (store.new_uid("ev"),))
        return cur.lastrowid
    c.execute(
        f"UPDATE events SET {','.join(k + '=?' for k in cols)},"
        "updated_at=datetime('now','localtime') WHERE id=?",
        tuple(values[k] for k in cols) + (eid,))
    return eid


@app.post("/api/events")
async def event_create(body: EventIn):
    if not body.starts_at:
        return JSONResponse({"error": "starts_at_required"}, status_code=422)
    all_day = bool(body.all_day)
    start = parse_dt(body.starts_at)
    end = parse_dt(body.ends_at) if body.ends_at else (
        start if all_day else start + timedelta(hours=1))
    if end < start:
        end = start
    with tx() as c:
        eid = _write_event(c, _align_weekly_start({
            "calendar_id": body.calendar_id,
            "title": (body.title or "").strip()[:200] or "(untitled)",
            "notes": body.notes, "location": body.location,
            "starts_at": fmt_dt(start, all_day), "ends_at": fmt_dt(end, all_day),
            "all_day": int(all_day),
            "repeat": _norm_repeat(body.repeat),
            "repeat_every": max(1, body.repeat_every or 1),
            "repeat_days": _norm_days(body.repeat_days),
            "repeat_until": body.repeat_until or None,
            "color": _norm_color(body.color),
            "reminders": _norm_reminders(body.reminders),
        }))
    return {"id": eid}


@app.get("/api/events/{eid}")
async def event_get(eid: int):
    with tx() as c:
        row = c.execute("SELECT * FROM events WHERE id=?", (eid,)).fetchone()
        if not row:
            return JSONResponse({"error": "not_found"}, status_code=404)
        ov = c.execute("SELECT * FROM event_overrides WHERE event_id=? ORDER BY occ_date",
                       (eid,)).fetchall()
    d = dict(row)
    d["all_day"] = bool(d["all_day"])
    d["overrides"] = [dict(o) for o in ov]
    return d


def _align_weekly_due(due: str | None, repeat: str, days_csv: str) -> str | None:
    """Weekly task whose due weekday is not in repeat_days: advance to the
    first selected weekday (same rule as events)."""
    if not due or repeat != "weekly" or not days_csv:
        return due
    days = recur.parse_days(days_csv)
    d0 = date.fromisoformat(due)
    if not days or d0.weekday() in days:
        return due
    for i in range(1, 8):
        if (d0 + timedelta(days=i)).weekday() in days:
            return (d0 + timedelta(days=i)).isoformat()
    return due


def _occ_base_start(row, occ_date: str) -> datetime:
    """The original wall-clock start of the occurrence in slot `occ_date`."""
    base = parse_dt(row["starts_at"])
    d = date.fromisoformat(occ_date)
    return datetime(d.year, d.month, d.day, base.hour, base.minute)


@app.patch("/api/events/{eid}")
async def event_update(eid: int, body: EventIn, scope: str = "all",
                       occ_date: str | None = None):
    scope = scope if scope in ("all", "one", "following") else "all"
    with tx() as c:
        row = c.execute("SELECT * FROM events WHERE id=?", (eid,)).fetchone()
        if not row:
            return JSONResponse({"error": "not_found"}, status_code=404)

        if not row["repeat"]:
            scope = "all"          # scopes only mean something on a series
        if scope in ("one", "following") and not occ_date:
            return JSONResponse({"error": "occ_date_required"}, status_code=422)
        if scope == "following" and occ_date == row["starts_at"][:10]:
            scope = "all"          # "this and following" from the first = all

        if scope == "one":
            # Store only what the client sent — unset fields keep following
            # the series (so a later "edit all" still reaches them).
            c.execute(
                "INSERT INTO event_overrides(event_id,occ_date,cancelled,starts_at,"
                "ends_at,title,notes,location,color,reminders,all_day)"
                " VALUES (?,?,0,?,?,?,?,?,?,?,?)"
                " ON CONFLICT(event_id,occ_date) DO UPDATE SET cancelled=0,"
                " starts_at=COALESCE(excluded.starts_at,starts_at),"
                " ends_at=COALESCE(excluded.ends_at,ends_at),"
                " title=COALESCE(excluded.title,title),"
                " notes=COALESCE(excluded.notes,notes),"
                " location=COALESCE(excluded.location,location),"
                " color=COALESCE(excluded.color,color),"
                " reminders=COALESCE(excluded.reminders,reminders),"
                " all_day=COALESCE(excluded.all_day,all_day)",
                (eid, occ_date,
                 body.starts_at and fmt_dt(parse_dt(body.starts_at), bool(body.all_day)),
                 body.ends_at and fmt_dt(parse_dt(body.ends_at), bool(body.all_day)),
                 body.title and body.title.strip()[:200],
                 body.notes, body.location, _norm_color(body.color),
                 None if body.reminders is None else _norm_reminders(body.reminders),
                 None if body.all_day is None else int(body.all_day)))
            return {"status": "ok", "scope": "one"}

        if scope == "following":
            values = _merged_event(row, body)
            occ_start = _occ_base_start(row, occ_date)
            if body.starts_at is None:
                dur = parse_dt(values["ends_at"]) - parse_dt(values["starts_at"])
                values["starts_at"] = fmt_dt(occ_start, values["all_day"])
                values["ends_at"] = fmt_dt(occ_start + dur, values["all_day"])
            new_id = _write_event(c, _align_weekly_start(values))
            split = date.fromisoformat(occ_date)
            c.execute("UPDATE events SET repeat_until=?,"
                      " updated_at=datetime('now','localtime') WHERE id=?",
                      ((split - timedelta(days=1)).isoformat(), eid))
            # Exceptions from the split point onwards belonged to the removed
            # tail of the old series — they die with it (Google does the same).
            c.execute("DELETE FROM event_overrides WHERE event_id=? AND occ_date>=?",
                      (eid, occ_date))
            return {"status": "ok", "scope": "following", "new_id": new_id}

        # scope == all
        values = _merged_event(row, body)
        if occ_date and body.starts_at and row["repeat"]:
            # Dragging one occurrence with "change all": shift the whole
            # series by the same delta, keep the pattern anchored.
            delta = parse_dt(body.starts_at) - _occ_base_start(row, occ_date)
            base_start = parse_dt(row["starts_at"]) + delta
            duration = parse_dt(values["ends_at"]) - parse_dt(values["starts_at"])
            values["starts_at"] = fmt_dt(base_start, values["all_day"])
            values["ends_at"] = fmt_dt(base_start + duration, values["all_day"])
        _write_event(c, _align_weekly_start(values), eid)
        if _recur_sig(row) != (values["repeat"], values["repeat_every"],
                               values["repeat_days"], values["repeat_until"]):
            # The rule changed — old exception slots may no longer exist.
            c.execute("DELETE FROM event_overrides WHERE event_id=?", (eid,))
    return {"status": "ok", "scope": "all"}


@app.delete("/api/events/{eid}")
async def event_delete(eid: int, scope: str = "all", occ_date: str | None = None):
    scope = scope if scope in ("all", "one", "following") else "all"
    with tx() as c:
        row = c.execute("SELECT * FROM events WHERE id=?", (eid,)).fetchone()
        if not row:
            return JSONResponse({"error": "not_found"}, status_code=404)
        if not row["repeat"]:
            scope = "all"
        if scope in ("one", "following") and not occ_date:
            return JSONResponse({"error": "occ_date_required"}, status_code=422)
        if scope == "following" and occ_date == row["starts_at"][:10]:
            scope = "all"

        if scope == "one":
            c.execute(
                "INSERT INTO event_overrides(event_id,occ_date,cancelled)"
                " VALUES (?,?,1) ON CONFLICT(event_id,occ_date) DO UPDATE SET"
                " cancelled=1, starts_at=NULL, ends_at=NULL, title=NULL,"
                " notes=NULL, location=NULL, color=NULL, reminders=NULL, all_day=NULL",
                (eid, occ_date))
            return {"status": "ok", "scope": "one"}
        if scope == "following":
            split = date.fromisoformat(occ_date)
            c.execute("UPDATE events SET repeat_until=?,"
                      " updated_at=datetime('now','localtime') WHERE id=?",
                      ((split - timedelta(days=1)).isoformat(), eid))
            c.execute("DELETE FROM event_overrides WHERE event_id=? AND occ_date>=?",
                      (eid, occ_date))
            return {"status": "ok", "scope": "following"}
        # Soft delete: 24 saat "Silinenler"de durur, geri alinabilir.
        c.execute("UPDATE events SET deleted_at=datetime('now','localtime')"
                  " WHERE id=?", (eid,))
    return {"status": "ok", "scope": "all"}


# ── tasks ───────────────────────────────────────────────────────────────────
@app.get("/api/tasks")
async def tasks(include_done: int = 0, list_id: int | None = None):
    """Open tasks in manual order; completed ones (when asked) CAPPED to the
    most recent 300 — a Google import can carry a 10k-task archive and the
    UI must not render (or refetch every few minutes) all of it."""
    where, args = "", []
    if list_id:
        where = " AND list_id=?"
        args.append(list_id)
    with tx() as c:
        rows = list(c.execute(
            f"SELECT * FROM tasks WHERE done=0 AND deleted_at IS NULL{where}"
            " ORDER BY position, id", args))
        if include_done:
            rows += list(c.execute(
                f"SELECT * FROM tasks WHERE done=1 AND deleted_at IS NULL{where}"
                " ORDER BY COALESCE(done_at, updated_at) DESC LIMIT 300", args))
    return [dict(r) for r in rows]


@app.post("/api/tasks")
async def task_create(body: TaskIn):
    with tx() as c:
        lid = body.list_id
        if not lid:
            row = c.execute("SELECT id FROM task_lists ORDER BY position, id LIMIT 1").fetchone()
            lid = row["id"] if row else None
        if lid is None:
            return JSONResponse({"error": "no_list"}, status_code=400)
        pos = c.execute("SELECT COALESCE(MAX(position),0)+1 FROM tasks WHERE list_id=?",
                        (lid,)).fetchone()[0]
        rep = _norm_repeat(body.repeat)
        gunler = _norm_days(body.repeat_days) if rep == "weekly" else ""
        due = _align_weekly_due(body.due_date or None, rep, gunler)
        cur = c.execute(
            "INSERT INTO tasks(list_id,parent_id,title,notes,due_date,due_time,"
            "position,repeat,repeat_every,repeat_days,uid) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (lid, body.parent_id, (body.title or "").strip()[:200] or "(untitled)", body.notes,
             due, body.due_time or None, pos,
             rep, max(1, body.repeat_every or 1), gunler, store.new_uid("td")))
    return {"id": cur.lastrowid}


@app.post("/api/tasks/reorder")
async def task_reorder(body: ReorderIn):
    """Manual ordering after a drag — ids are top-level tasks in new order."""
    with tx() as c:
        for i, tid in enumerate(body.ids):
            c.execute("UPDATE tasks SET position=?, list_id=?,"
                      " updated_at=datetime('now','localtime')"
                      " WHERE id=? AND parent_id IS NULL",
                      ((i + 1) * 10, body.list_id, tid))
    return {"status": "ok"}


@app.post("/api/tasks/{tid}/detach")
async def task_detach(tid: int, body: DetachIn):
    """'Move only this task': this repeat detaches into a standalone task
    at the given date; the series continues from its NEXT occurrence."""
    with tx() as c:
        row = c.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
        if not row:
            return JSONResponse({"error": "not_found"}, status_code=404)
        if not row["repeat"] or not row["due_date"]:
            return JSONResponse({"error": "not_recurring"}, status_code=400)
        pos = c.execute("SELECT COALESCE(MAX(position),0)+1 FROM tasks WHERE list_id=?",
                        (row["list_id"],)).fetchone()[0]
        cur = c.execute(
            "INSERT INTO tasks(list_id,parent_id,title,notes,due_date,due_time,"
            "position,repeat,repeat_every,repeat_days,uid) VALUES (?,?,?,?,?,?,?,'',1,'',?)",
            (row["list_id"], None, row["title"], row["notes"], body.due_date,
             body.due_time if body.due_time is not None else row["due_time"],
             pos, store.new_uid("td")))
        nxt = recur.next_due(date.fromisoformat(row["due_date"]), row["repeat"],
                             row["repeat_every"], recur.parse_days(row["repeat_days"]))
        c.execute("UPDATE tasks SET due_date=?, updated_at=datetime('now','localtime')"
                  " WHERE id=?", (nxt.isoformat() if nxt else None, tid))
    return {"new_id": cur.lastrowid, "series_due_date": nxt.isoformat() if nxt else None}


@app.patch("/api/tasks/{tid}")
async def task_update(tid: int, body: TaskIn):
    with tx() as c:
        row = c.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
        if not row:
            return JSONResponse({"error": "not_found"}, status_code=404)

        # Completing a repeating task rolls it forward instead of closing it —
        # the Google Tasks behaviour people expect from "every week" chores.
        if body.done and not row["done"] and row["repeat"]:
            base = row["due_date"] or today().isoformat()
            nxt = recur.next_due(date.fromisoformat(base), row["repeat"],
                                 row["repeat_every"], recur.parse_days(row["repeat_days"]))
            c.execute("UPDATE tasks SET due_date=?, updated_at=datetime('now','localtime')"
                      " WHERE id=?", (nxt.isoformat() if nxt else None, tid))
            return {"status": "rolled", "due_date": nxt.isoformat() if nxt else None}

        fields, args = [], []
        for name, value in (
            ("list_id", body.list_id), ("parent_id", body.parent_id),
            ("notes", body.notes), ("due_date", body.due_date),
            ("due_time", body.due_time), ("position", body.position),
        ):
            if value is not None:
                fields.append(f"{name}=?")
                args.append(value or None)
        if body.title:
            fields.append("title=?")
            args.append(body.title.strip()[:200])
        if body.repeat is not None:
            rep = _norm_repeat(body.repeat)
            fields.append("repeat=?")
            args.append(rep)
            fields.append("repeat_every=?")
            args.append(max(1, body.repeat_every or 1))
            fields.append("repeat_days=?")
            args.append(_norm_days(body.repeat_days) if rep == "weekly" else "")
        if body.done is not None:
            fields.append("done=?")
            args.append(int(body.done))
            fields.append("done_at=?")
            args.append(datetime.now().strftime("%Y-%m-%d %H:%M") if body.done else None)
        if fields:
            fields.append("updated_at=datetime('now','localtime')")
            args.append(tid)
            c.execute(f"UPDATE tasks SET {','.join(fields)} WHERE id=?", args)
    return {"status": "ok"}


@app.delete("/api/tasks/{tid}")
async def task_delete(tid: int):
    # Soft delete (alt gorevleriyle) — 24 saat "Silinenler"de geri alinabilir.
    with tx() as c:
        c.execute("UPDATE tasks SET deleted_at=datetime('now','localtime')"
                  " WHERE id=? OR parent_id=?", (tid, tid))
    return {"status": "ok"}


@app.post("/api/tasks/{tid}/skip")
async def task_skip(tid: int):
    # Rutin gorevde "yalniz bu tekrari sil": tarihi bir SONRAKI tekrara sar.
    with tx() as c:
        row = c.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
        if not row:
            return JSONResponse({"error": "not_found"}, status_code=404)
        if not row["repeat"] or not row["due_date"]:
            return JSONResponse({"error": "not_recurring"}, status_code=400)
        nxt = recur.next_due(date.fromisoformat(row["due_date"]), row["repeat"],
                             row["repeat_every"], recur.parse_days(row["repeat_days"]))
        c.execute("UPDATE tasks SET due_date=?, updated_at=datetime('now','localtime')"
                  " WHERE id=?", (nxt.isoformat() if nxt else None, tid))
    return {"status": "skipped", "due_date": nxt.isoformat() if nxt else None}


@app.get("/api/trash")
async def trash():
    # Son 24 saatte silinenler; daha eskiler burada KALICI temizlenir.
    with tx() as c:
        c.execute("DELETE FROM events WHERE deleted_at IS NOT NULL"
                  " AND deleted_at < datetime('now','localtime','-1 day')")
        c.execute("DELETE FROM tasks WHERE deleted_at IS NOT NULL"
                  " AND deleted_at < datetime('now','localtime','-1 day')")
        ev = c.execute("SELECT id,title,starts_at,all_day,deleted_at FROM events"
                       " WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").fetchall()
        td = c.execute("SELECT id,title,due_date,due_time,deleted_at FROM tasks"
                       " WHERE deleted_at IS NOT NULL AND parent_id IS NULL"
                       " ORDER BY deleted_at DESC").fetchall()
    return {"events": [dict(r) for r in ev], "tasks": [dict(r) for r in td]}


class RestoreIn(BaseModel):
    kind: str
    id: int


@app.post("/api/trash/restore")
async def trash_restore(body: RestoreIn):
    with tx() as c:
        if body.kind == "event":
            c.execute("UPDATE events SET deleted_at=NULL WHERE id=?", (body.id,))
        else:
            c.execute("UPDATE tasks SET deleted_at=NULL WHERE id=? OR parent_id=?",
                      (body.id, body.id))
    return {"status": "ok"}


# ── import from Google ──────────────────────────────────────────────────────
def _count_to_until(start: datetime, rule: str, every: int,
                    days: list[int], count: int) -> date:
    """RRULE COUNT=N -> our model's 'until' date (the Nth occurrence)."""
    if rule == "weekly" and days:
        son = start.date()
        uretilen = 0
        genis = start.date() + timedelta(days=7 * every * (count + 2) + 14)
        for s2, _ in recur.expand(start, start, rule, every, None,
                                  start.date(), genis, days):
            son = s2.date()
            uretilen += 1
            if uretilen >= count:
                break
        return son
    return recur._step(start, rule, every, count - 1).date()


@app.post("/api/import/ics")
async def import_ics(body: ImportIcsIn):
    parsed = ics_import.parse_ics(body.ics)
    masters = [e for e in parsed["events"] if e["recurrence_id"] is None and not e["cancelled"]]
    ozeller = [e for e in parsed["events"] if e["recurrence_id"] is not None]
    eklenen = guncellenen = istisna = 0
    with tx() as c:
        uid_map: dict[str, int] = {}
        for e in masters:
            until = e["repeat_until"]
            if e["count"] and e["repeat"] and not until:
                until = _count_to_until(e["starts_at"], e["repeat"],
                                        e["repeat_every"], e["repeat_days"], e["count"])
            values = {
                "calendar_id": None,
                "title": e["title"], "notes": e["notes"], "location": e["location"],
                "starts_at": fmt_dt(e["starts_at"], e["all_day"]),
                "ends_at": fmt_dt(e["ends_at"], e["all_day"]),
                "all_day": int(e["all_day"]),
                "repeat": e["repeat"], "repeat_every": e["repeat_every"],
                "repeat_days": ",".join(str(x) for x in e["repeat_days"]),
                "repeat_until": until.isoformat() if until else None,
                "color": None,
                "reminders": ",".join(str(m) for m in sorted(set(e["reminders"]))[:5]),
            }
            values = _align_weekly_start(values)
            row = c.execute("SELECT id FROM events WHERE uid=?",
                            (e["uid"] or "",)).fetchone() if e["uid"] else None
            if row:
                _write_event(c, values, row["id"])
                c.execute("DELETE FROM event_overrides WHERE event_id=?", (row["id"],))
                eid = row["id"]
                guncellenen += 1
            else:
                cols = ("calendar_id", "title", "notes", "location", "starts_at",
                        "ends_at", "all_day", "repeat", "repeat_every",
                        "repeat_days", "repeat_until", "color", "reminders")
                cur = c.execute(
                    f"INSERT INTO events({','.join(cols)},uid) VALUES ({','.join('?' * len(cols))},?)",
                    tuple(values[k] for k in cols)
                    + (e["uid"] or store.new_uid("im"),))
                eid = cur.lastrowid
                eklenen += 1
            if e["uid"]:
                uid_map[e["uid"]] = eid
            for ex in e["exdates"]:
                c.execute("INSERT INTO event_overrides(event_id,occ_date,cancelled)"
                          " VALUES (?,?,1) ON CONFLICT(event_id,occ_date)"
                          " DO UPDATE SET cancelled=1",
                          (eid, ex.date().isoformat()))
                istisna += 1
        for o in ozeller:
            eid = uid_map.get(o["uid"] or "")
            if not eid:
                continue
            rid_dt, _rid_all = o["recurrence_id"]
            c.execute(
                "INSERT INTO event_overrides(event_id,occ_date,cancelled,starts_at,"
                "ends_at,title,notes,location,reminders,all_day)"
                " VALUES (?,?,?,?,?,?,?,?,?,?)"
                " ON CONFLICT(event_id,occ_date) DO UPDATE SET cancelled=excluded.cancelled,"
                " starts_at=excluded.starts_at, ends_at=excluded.ends_at,"
                " title=excluded.title, notes=excluded.notes, location=excluded.location,"
                " reminders=excluded.reminders, all_day=excluded.all_day",
                (eid, rid_dt.date().isoformat(), int(o["cancelled"]),
                 None if o["cancelled"] else fmt_dt(o["starts_at"], o["all_day"]),
                 None if o["cancelled"] else fmt_dt(o["ends_at"], o["all_day"]),
                 o["title"], o["notes"], o["location"],
                 ",".join(str(m) for m in sorted(set(o["reminders"]))[:5]) or None,
                 int(o["all_day"])))
            istisna += 1
    return {"added": eklenen, "updated": guncellenen, "overrides": istisna,
            "notes": parsed["notes"][:20]}


@app.post("/api/import/gtasks")
async def import_gtasks(body: ImportTasksIn):
    parsed = ics_import.parse_gtasks(body.data)
    liste_n = eklenen = guncellenen = 0
    with tx() as c:
        for lst in parsed["lists"]:
            row = c.execute("SELECT id FROM task_lists WHERE name=?",
                            (lst["title"],)).fetchone()
            lid = row["id"] if row else None      # liste TEMBEL acilir: yalniz
            gid_map: dict = {}                    # yeni gorev eklenecekse
            for t in lst["tasks"]:
                uid = f"gt-{t['gid']}" if t.get("gid") else None
                parent = gid_map.get(t.get("parent")) if t.get("parent") else None
                row = c.execute("SELECT id FROM tasks WHERE uid=?",
                                (uid,)).fetchone() if uid else None
                if row:
                    # ⚠️ list_id BILEREK guncellenmez: kullanici gorevleri
                    # baska listeye tasidiysa yeniden alim geri surmesin
                    # (17 Agu'da yasandi: birlestirilmis liste geri dogdu).
                    c.execute("UPDATE tasks SET title=?, notes=?, due_date=?, due_time=?,"
                              " done=?, done_at=?, repeat=?, repeat_every=?, repeat_days=?,"
                              " parent_id=?,"
                              " updated_at=datetime('now','localtime') WHERE id=?",
                              (t["title"], t["notes"], t["due"], t.get("due_time"),
                               int(t["done"]), t.get("done_at"),
                               t.get("repeat", ""), t.get("repeat_every", 1),
                               t.get("repeat_days", ""), parent, row["id"]))
                    tid = row["id"]
                    guncellenen += 1
                else:
                    if lid is None:
                        lid = c.execute("INSERT INTO task_lists(name,color,position)"
                                        " VALUES (?,?,99)",
                                        (lst["title"], "#3fbf7f")).lastrowid
                        liste_n += 1
                    pos = c.execute("SELECT COALESCE(MAX(position),0)+1 FROM tasks"
                                    " WHERE list_id=?", (lid,)).fetchone()[0]
                    tid = c.execute(
                        "INSERT INTO tasks(list_id,parent_id,title,notes,due_date,due_time,"
                        "done,done_at,position,repeat,repeat_every,repeat_days,uid)"
                        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (lid, parent, t["title"], t["notes"], t["due"], t.get("due_time"),
                         int(t["done"]), t.get("done_at"), pos,
                         t.get("repeat", ""), t.get("repeat_every", 1),
                         t.get("repeat_days", ""),
                         uid or store.new_uid("td"))).lastrowid
                    eklenen += 1
                if t.get("gid"):
                    gid_map[t["gid"]] = tid
    return {"lists": liste_n, "added": eklenen, "updated": guncellenen,
            "notes": parsed.get("notes", [])[:20]}


# ── search ──────────────────────────────────────────────────────────────────
@app.get("/api/search")
async def search(q: str = ""):
    q = q.strip()
    if len(q) < 2:
        return {"events": [], "tasks": []}
    like = f"%{q}%"
    with tx() as c:
        ev = c.execute(
            "SELECT id,title,starts_at,ends_at,all_day,repeat,location FROM events"
            " WHERE deleted_at IS NULL AND (title LIKE ? OR notes LIKE ? OR location LIKE ?)"
            " ORDER BY starts_at DESC LIMIT 30", (like, like, like)).fetchall()
        td = c.execute(
            "SELECT id,title,due_date,due_time,done,list_id FROM tasks"
            " WHERE deleted_at IS NULL AND (title LIKE ? OR notes LIKE ?)"
            " ORDER BY done, due_date IS NULL, due_date DESC LIMIT 30",
            (like, like)).fetchall()
    return {"events": [dict(r) for r in ev], "tasks": [dict(r) for r in td]}


# ── the grid's single data call ─────────────────────────────────────────────
@app.get("/api/range")
async def range_view(start: str | None = None, days: int = 7):
    """Everything the grid needs for a window: recurrences expanded, exceptions
    applied.  The client sends the exact window start (it knows whether the
    view is a fixed week or a rolling N-day strip); the server never re-snaps.
    """
    days = max(1, min(int(days), 42))
    first = date.fromisoformat(start) if start else week_start(today(), FIRST_WEEKDAY)
    last = first + timedelta(days=days - 1)

    with tx() as c:
        ev_rows = c.execute("SELECT * FROM events WHERE deleted_at IS NULL").fetchall()
        cal_rows = c.execute("SELECT * FROM calendars").fetchall()
        ov_rows = c.execute("SELECT * FROM event_overrides").fetchall()
        task_rows = c.execute(
            "SELECT * FROM tasks WHERE deleted_at IS NULL"
            " AND due_date IS NOT NULL AND due_date BETWEEN ? AND ?",
            (first.isoformat(), last.isoformat())).fetchall()
        rep_task_rows = c.execute(
            "SELECT * FROM tasks WHERE deleted_at IS NULL"
            " AND repeat != '' AND due_date IS NOT NULL AND done=0"
        ).fetchall()

    cal_colors = {r["id"]: r["color"] for r in cal_rows}
    hidden = {r["id"] for r in cal_rows if not r["visible"]}
    ov_map: dict[int, dict[str, dict]] = {}
    for o in ov_rows:
        ov_map.setdefault(o["event_id"], {})[o["occ_date"]] = dict(o)

    def emit(r, s: datetime, e: datetime, occ_date: str, o: dict | None):
        all_day = bool(r["all_day"] if not o or o.get("all_day") is None else o["all_day"])
        return {
            "id": r["id"], "occ_date": occ_date,
            "title": (o or {}).get("title") or r["title"],
            "notes": r["notes"] if not o or o.get("notes") is None else o["notes"],
            "location": r["location"] if not o or o.get("location") is None else o["location"],
            "all_day": all_day,
            "starts_at": fmt_dt(s, False), "ends_at": fmt_dt(e, False),
            "calendar_id": r["calendar_id"],
            "color": ((o or {}).get("color") or r["color"]
                      or cal_colors.get(r["calendar_id"], "#5b9dff")),
            "own_color": r["color"],
            "reminders": (o or {}).get("reminders")
                          if o and o.get("reminders") is not None else r["reminders"],
            "repeat": r["repeat"], "repeat_every": r["repeat_every"],
            "repeat_days": r["repeat_days"], "repeat_until": r["repeat_until"],
            "recurring": bool(r["repeat"]),
            "is_override": bool(o),
            "series_start": r["starts_at"],
        }

    occurrences = []
    for r in ev_rows:
        if r["calendar_id"] in hidden:
            continue
        s0, e0 = parse_dt(r["starts_at"]), parse_dt(r["ends_at"])
        until = date.fromisoformat(r["repeat_until"]) if r["repeat_until"] else None
        evs_ov = ov_map.get(r["id"], {})
        seen: set[str] = set()
        for s, e in recur.expand(s0, e0, r["repeat"], r["repeat_every"], until,
                                 first, last, recur.parse_days(r["repeat_days"])):
            occ_date = s.date().isoformat()
            seen.add(occ_date)
            o = evs_ov.get(occ_date)
            if o and o["cancelled"]:
                continue
            if o and o.get("starts_at"):
                s2 = parse_dt(o["starts_at"])
                e2 = parse_dt(o["ends_at"]) if o.get("ends_at") else s2 + (e - s)
            else:
                s2, e2 = s, e
            if s2.date() <= last and e2.date() >= first:
                occurrences.append(emit(r, s2, e2, occ_date, o))
        # An occurrence moved INTO this window from outside it: its base slot
        # was never expanded above, so walk the overrides too.
        for occ_date, o in evs_ov.items():
            if occ_date in seen or o["cancelled"] or not o.get("starts_at"):
                continue
            s2 = parse_dt(o["starts_at"])
            e2 = parse_dt(o["ends_at"]) if o.get("ends_at") else s2 + (e0 - s0)
            if s2.date() <= last and e2.date() >= first:
                occurrences.append(emit(r, s2, e2, occ_date, o))

    # Show FUTURE occurrences of routine tasks on the calendar (the Google
    # Tasks behaviour). The model is a single row that rolls forward on
    # completion, so future ones are display-only 'projected' copies: no
    # checkbox, not draggable, clicking opens the series card.
    tasks_out = [dict(r) for r in task_rows]
    seen = {(t["id"], t["due_date"]) for t in tasks_out}
    for r in rep_task_rows:
        base = date.fromisoformat(r["due_date"])
        s0 = datetime(base.year, base.month, base.day)
        for occ_s, _ in recur.expand(s0, s0, r["repeat"], r["repeat_every"], None,
                                     first, last, recur.parse_days(r["repeat_days"])):
            dstr = occ_s.date().isoformat()
            if occ_s.date() <= base or (r["id"], dstr) in seen:
                continue
            proj = dict(r)
            proj["due_date"] = dstr
            proj["projected"] = True
            tasks_out.append(proj)
            seen.add((r["id"], dstr))

    return {
        "start": first.isoformat(), "end": last.isoformat(), "days": days,
        "today": today().isoformat(),
        "events": sorted(occurrences, key=lambda x: (not x["all_day"], x["starts_at"])),
        "tasks": sorted(tasks_out, key=lambda t: (t["due_date"], t["due_time"] or "")),
    }


# ── .ics feeds ──────────────────────────────────────────────────────────────
def _feed_guard(token: str | None):
    if FEED_TOKEN and token != FEED_TOKEN:
        return PlainTextResponse("unauthorized", status_code=401)
    return None


def _reminder_list(value: str | None) -> list[int]:
    return [int(p) for p in (value or "").split(",") if p.strip().isdigit()]


@app.get("/calendar.ics")
async def calendar_feed(token: str | None = None):
    bad = _feed_guard(token)
    if bad:
        return bad
    with tx() as c:
        rows = c.execute("SELECT * FROM events WHERE deleted_at IS NULL").fetchall()
        ov_rows = c.execute("SELECT * FROM event_overrides ORDER BY occ_date").fetchall()
    ov_map: dict[int, list] = {}
    for o in ov_rows:
        ov_map.setdefault(o["event_id"], []).append(o)

    items = []
    for r in rows:
        base_start = parse_dt(r["starts_at"])
        base_end = parse_dt(r["ends_at"])
        all_day = bool(r["all_day"])
        exdates, extra = [], []
        for o in ov_map.get(r["id"], []):
            d = date.fromisoformat(o["occ_date"])
            slot = d if all_day else datetime(d.year, d.month, d.day,
                                              base_start.hour, base_start.minute)
            if o["cancelled"]:
                exdates.append(slot)
                continue
            s2 = parse_dt(o["starts_at"]) if o["starts_at"] else (
                slot if not all_day else datetime(d.year, d.month, d.day))
            e2 = parse_dt(o["ends_at"]) if o["ends_at"] else s2 + (base_end - base_start)
            o_all_day = all_day if o["all_day"] is None else bool(o["all_day"])
            extra.append({
                "uid": r["uid"], "recurrence_id": slot, "recurrence_id_all_day": all_day,
                "title": o["title"] or r["title"],
                "notes": r["notes"] if o["notes"] is None else o["notes"],
                "location": r["location"] if o["location"] is None else o["location"],
                "all_day": o_all_day, "starts_at": s2, "ends_at": e2,
                "repeat": "", "repeat_every": 1, "repeat_until": None,
                "reminders": _reminder_list(o["reminders"] if o["reminders"] is not None
                                            else r["reminders"]),
            })
        items.append({
            "uid": r["uid"], "title": r["title"], "notes": r["notes"],
            "location": r["location"], "all_day": all_day,
            "starts_at": base_start, "ends_at": base_end,
            "repeat": r["repeat"], "repeat_every": r["repeat_every"],
            "repeat_days": recur.parse_days(r["repeat_days"]),
            "repeat_until": date.fromisoformat(r["repeat_until"]) if r["repeat_until"] else None,
            "exdates": exdates,
            "reminders": _reminder_list(r["reminders"]),
        })
        items.extend(extra)
    return PlainTextResponse(feeds.build("Calendar", items),
                             media_type="text/calendar; charset=utf-8")


@app.get("/tasks.ics")
async def tasks_feed(token: str | None = None):
    bad = _feed_guard(token)
    if bad:
        return bad
    with tx() as c:
        rows = c.execute(
            "SELECT t.*, l.name AS list_name FROM tasks t "
            "LEFT JOIN task_lists l ON l.id=t.list_id "
            "WHERE t.due_date IS NOT NULL AND t.deleted_at IS NULL").fetchall()
    items = []
    for r in rows:
        d = date.fromisoformat(r["due_date"])
        if r["due_time"]:
            hh, mm = (r["due_time"].split(":") + ["0"])[:2]
            start = datetime(d.year, d.month, d.day, int(hh), int(mm))
            end = start + timedelta(minutes=30)
            all_day = False
        else:
            start = end = d
            all_day = True
        items.append({
            "uid": r["uid"], "title": ("✓ " if r["done"] else "") + r["title"],
            "notes": r["notes"], "location": None, "all_day": all_day,
            "starts_at": start, "ends_at": end,
            "repeat": "", "repeat_every": 1, "repeat_until": None,
            "status": "COMPLETED" if r["done"] else "NEEDS-ACTION",
        })
    return PlainTextResponse(feeds.build("Tasks", items),
                             media_type="text/calendar; charset=utf-8")


# ── UI ──────────────────────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/")
async def index():
    return FileResponse(STATIC / "index.html")


@app.get("/panel")
async def panel():
    """Compact build for embedding in a dashboard iframe."""
    return FileResponse(STATIC / "panel.html")
