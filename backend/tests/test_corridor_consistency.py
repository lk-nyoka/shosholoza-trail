"""
The test that stops the corridor from drifting again.

Three separate audits found the same class of defect: the app said one thing
about the line and the API said another, because each had its own hand-typed
copy of the numbers. Comments do not prevent that. A failing test does.

`supabase/seed.sql` is generated from the frontend's own runtime values by
scripts/seed-sql.ts, so it is the closest thing to a machine-readable statement
of what the app actually believes. This compares it with app/corridor.py, which
is what the API believes. If anyone edits one side, this goes red.

If the seed file is not present (a checkout without it), the frontend checks are
skipped rather than failed - they cannot say anything useful about a file that
is not there.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from app import corridor

SEED = Path(__file__).resolve().parents[2] / "supabase" / "seed.sql"


def test_total_km_is_the_last_stop():
    assert corridor.STOPS[-1]["km"] == corridor.TOTAL_KM


def test_stops_run_in_order_and_never_repeat_a_kilometre():
    kms = [stop["km"] for stop in corridor.STOPS]
    assert kms == sorted(kms)
    assert len(set(kms)) == len(kms)


def test_every_modelled_call_matches_its_stop():
    by_id = {stop["id"]: stop for stop in corridor.STOPS}
    for call in corridor.CALLS:
        if call["stop_id"] is None:
            # A published call the app does not model as a destination. Its
            # kilometre must be absent, not guessed.
            assert call["km"] is None, f"{call['stop_name']} has an invented kilometre"
            continue
        assert call["stop_id"] in by_id, f"{call['stop_id']} is not a stop"
        assert call["km"] == by_id[call["stop_id"]]["km"]


def test_calls_are_chronological_across_the_two_days():
    def minutes(call: dict) -> int:
        clock = call.get("departs") or call["arrives"]
        hours, mins = (int(part) for part in clock.split(":"))
        return (call["day"] - 1) * 24 * 60 + hours * 60 + mins

    stamps = [minutes(call) for call in corridor.CALLS]
    assert stamps == sorted(stamps), "the timetable goes backwards in time"


def test_the_published_duration_matches_the_published_times():
    first, last = corridor.CALLS[0], corridor.CALLS[-1]
    start = [int(p) for p in first["departs"].split(":")]
    end = [int(p) for p in last["arrives"].split(":")]
    spanned = ((last["day"] - first["day"]) * 24 + end[0] - start[0]) * 60 + end[1] - start[1]
    assert spanned * 60 == corridor.JOURNEY_DURATION_SECONDS


def test_no_platform_numbers_are_published():
    # We do not have them. A passenger acting on a fabricated platform number is
    # precisely the harm this project warns about in its own documents.
    for call in corridor.CALLS:
        assert "platform" not in call


@pytest.mark.skipif(not SEED.exists(), reason="supabase/seed.sql has not been generated")
def test_the_api_and_the_app_agree_about_every_stop():
    text = SEED.read_text(encoding="utf-8")
    block = re.search(r"insert into stops .*?values(.*?)on conflict", text, re.S)
    assert block, "could not find the stops insert in seed.sql"

    rows = re.findall(
        r"\('([^']+)', '([^']*)', ([-\d.]+), ([-\d.]+), ([-\d.]+)\)", block.group(1)
    )
    frontend = {row[0]: (row[1], float(row[2])) for row in rows}
    backend = {stop["id"]: (stop["name"], float(stop["km"])) for stop in corridor.STOPS}

    assert frontend.keys() == backend.keys(), "the two sides list different stops"
    for stop_id, (name, km) in backend.items():
        assert frontend[stop_id][0] == name, f"{stop_id}: name differs"
        assert abs(frontend[stop_id][1] - km) < 0.05, (
            f"{stop_id}: app says {frontend[stop_id][1]} km, API says {km} km"
        )


@pytest.mark.skipif(not SEED.exists(), reason="supabase/seed.sql has not been generated")
def test_the_api_and_the_app_agree_about_every_departure():
    text = SEED.read_text(encoding="utf-8")
    block = re.search(r"insert into calls .*?values(.*?)on conflict", text, re.S)
    assert block, "could not find the calls insert in seed.sql"

    rows = re.findall(r"\('[^']+', '([^']+)', \d+, '(\d\d:\d\d):00', (\d+),", block.group(1))
    frontend = {row[0]: (row[1], int(row[2])) for row in rows}

    for call in corridor.CALLS:
        if call["stop_id"] is None:
            continue
        clock = call.get("departs") or call["arrives"]
        assert call["stop_id"] in frontend, f"the app has no call at {call['stop_name']}"
        app_clock, app_day = frontend[call["stop_id"]]
        assert app_clock == clock, f"{call['stop_name']}: app says {app_clock}, API says {clock}"
        assert app_day + 1 == call["day"], f"{call['stop_name']}: the day numbers differ"
