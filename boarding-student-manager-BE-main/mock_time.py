"""
mock_time.py - Quan ly thoi gian ao de test.

Co che luu:
- Luu moc thoi gian that tai luc set.
- Luu moc thoi gian ao tai luc set.
- Khi khoi dong lai, tai file JSON va tinh lai thoi gian ao hien tai
  theo do lech da troi qua o thoi gian that.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path

STATE_DIR = Path(__file__).resolve().parent / "runtime"
STATE_FILE = STATE_DIR / "mock_time_state.json"

_mock_real_base: datetime | None = None
_mock_virtual_base: datetime | None = None
_last_mtime: float | None = None


def _ensure_state_dir():
    STATE_DIR.mkdir(parents=True, exist_ok=True)


def _refresh_last_mtime():
    global _last_mtime
    try:
        _last_mtime = STATE_FILE.stat().st_mtime if STATE_FILE.exists() else None
    except OSError:
        _last_mtime = None


def _save_state():
    if _mock_real_base is None or _mock_virtual_base is None:
        if STATE_FILE.exists():
            STATE_FILE.unlink()
        _refresh_last_mtime()
        return

    _ensure_state_dir()
    STATE_FILE.write_text(json.dumps({
        "real_base": _mock_real_base.isoformat(),
        "virtual_base": _mock_virtual_base.isoformat(),
    }, ensure_ascii=True, indent=2), encoding="utf-8")
    _refresh_last_mtime()


def load_mock_state(rebase: bool = False):
    global _mock_real_base, _mock_virtual_base
    if not STATE_FILE.exists():
        _mock_real_base = None
        _mock_virtual_base = None
        _refresh_last_mtime()
        return

    try:
        raw = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        real_base = datetime.fromisoformat(raw["real_base"])
        virtual_base = datetime.fromisoformat(raw["virtual_base"])
    except Exception:
        _mock_real_base = None
        _mock_virtual_base = None
        _refresh_last_mtime()
        return

    if rebase:
        real_now = datetime.now()
        virtual_base = virtual_base + (real_now - real_base)
        real_base = real_now

    _mock_real_base = real_base
    _mock_virtual_base = virtual_base

    if rebase:
        _save_state()
    else:
        _refresh_last_mtime()


def refresh_mock_state_for_startup():
    load_mock_state(rebase=True)


def _reload_if_changed():
    """Re-read state from disk if the file has changed (handles multi-process Flask reloader)."""
    global _mock_real_base, _mock_virtual_base, _last_mtime
    try:
        current_mtime = STATE_FILE.stat().st_mtime if STATE_FILE.exists() else None
    except OSError:
        current_mtime = None

    if current_mtime != _last_mtime:
        _last_mtime = current_mtime
        load_mock_state()


def get_now() -> datetime:
    _reload_if_changed()
    if _mock_real_base is not None and _mock_virtual_base is not None:
        return _mock_virtual_base + (datetime.now() - _mock_real_base)
    return datetime.now()


def get_today() -> date:
    return get_now().date()


def set_mock_datetime(dt: datetime | None):
    global _mock_real_base, _mock_virtual_base
    if dt is None:
        _mock_real_base = None
        _mock_virtual_base = None
        _save_state()
        return

    _mock_real_base = datetime.now()
    _mock_virtual_base = dt
    _save_state()


def set_mock_date(d: date | None):
    if d is None:
        set_mock_datetime(None)
        return
    project_now = get_now()
    set_mock_datetime(project_now.replace(year=d.year, month=d.month, day=d.day))


def get_mock_datetime() -> datetime | None:
    _reload_if_changed()
    if _mock_real_base is None or _mock_virtual_base is None:
        return None
    return get_now()


def get_mock_date() -> date | None:
    mock_now = get_mock_datetime()
    return mock_now.date() if mock_now is not None else None


load_mock_state()
