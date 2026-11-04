"""
api/debug.py - Endpoint quan ly thoi gian ao.
"""
from datetime import date, datetime

from flask import Blueprint, jsonify, request

from mock_time import (
    get_mock_date,
    get_mock_datetime,
    get_now,
    get_today,
    set_mock_datetime,
)

debug_bp = Blueprint('debug', __name__)


def _parse_date(value: str) -> date | None:
    value = (value or '').strip()
    if not value:
        return None

    for fmt in ('%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass

    raise ValueError("invalid date")


def _parse_time(value: str):
    value = (value or '').strip()
    if not value:
        return None

    for fmt in ('%H:%M:%S', '%H:%M'):
        try:
            return datetime.strptime(value, fmt).time()
        except ValueError:
            pass

    raise ValueError("invalid time")


@debug_bp.route('/mock-time', methods=['GET'])
def get_mock_time():
    mock_date = get_mock_date()
    mock_datetime = get_mock_datetime()
    return jsonify({
        "mock_active": mock_datetime is not None,
        "mock_date": mock_date.isoformat() if mock_date else None,
        "mock_datetime": mock_datetime.isoformat(sep=' ') if mock_datetime else None,
        "effective_today": get_today().isoformat(),
        "effective_now": get_now().isoformat(sep=' '),
    })


@debug_bp.route('/mock-time', methods=['PUT'])
def set_mock_time():
    data = request.json or {}
    raw_datetime = (data.get('datetime') or '').strip()
    raw_date = (data.get('date') or '').strip()
    raw_time = (data.get('time') or '').strip()

    try:
        if raw_datetime:
            mock_dt = datetime.fromisoformat(raw_datetime.replace('T', ' '))
            set_mock_datetime(mock_dt)
        else:
            current_project_now = get_now().replace(microsecond=0)
            mock_day = _parse_date(raw_date) or current_project_now.date()
            mock_clock = _parse_time(raw_time) or current_project_now.time()
            mock_dt = datetime.combine(mock_day, mock_clock)
            set_mock_datetime(mock_dt)
    except ValueError:
        return jsonify({
            "success": False,
            "message": "Dinh dang thoi gian khong hop le. Date: YYYY-MM-DD hoac dd/MM/yyyy; time: HH:MM[:SS]",
        }), 400

    return jsonify({
        "success": True,
        "message": f"Da dat thoi gian ao: {mock_dt.isoformat(sep=' ')}",
        "effective_today": get_today().isoformat(),
        "effective_now": get_now().isoformat(sep=' '),
    })


@debug_bp.route('/mock-time', methods=['DELETE'])
def reset_mock_time():
    set_mock_datetime(None)
    return jsonify({
        "success": True,
        "message": "Da reset ve thoi gian that",
        "effective_today": date.today().isoformat(),
        "effective_now": datetime.now().isoformat(sep=' '),
    })
