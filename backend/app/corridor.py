"""
The corridor, once.

Three audits in a row found the same defect: the frontend said 1 568 km and
08:30, the API said 1 582 km and 06:00, and the AI guide said something else
again. Every one of those numbers was typed separately, which is why they
drifted. So they are typed here, once, and everything else imports them.

The kilometres are measured along the mapped railway geometry the ride is drawn
from, not estimated. The times are the published Shosholoza Meyl calls compiled
by seat61.com, checked September 2026 — a schedule, not a live feed, and the
API must never present them as one.

If you change a number in this file, regenerate the frontend seed as well:

    npx esbuild scripts/seed-sql.ts --bundle --platform=node --format=cjs \
      --outfile=scripts/.seed.cjs && node scripts/.seed.cjs > supabase/seed.sql
"""
from __future__ import annotations

JOURNEY_ID = "pretoria-cape-town"

#: Measured along the mapped alignment, Pretoria platform to Cape Town platform.
TOTAL_KM = 1568.3

#: 08:30 day 1 to 12:40 day 2.
JOURNEY_DURATION_SECONDS = 28 * 3600 + 10 * 60

STOPS: list[dict] = [
    {"id": "pretoria",     "name": "Pretoria",       "province": "Gauteng",       "km": 0.0,
     "latitude": -25.7573, "longitude": 28.1866},
    {"id": "johannesburg", "name": "Johannesburg",   "province": "Gauteng",       "km": 56.6,
     "latitude": -26.1955, "longitude": 28.0416},
    {"id": "kimberley",    "name": "Kimberley",      "province": "Northern Cape", "km": 539.7,
     "latitude": -28.7282, "longitude": 24.7499},
    {"id": "de-aar",       "name": "De Aar",         "province": "Northern Cape", "km": 776.0,
     "latitude": -30.6497, "longitude": 24.0129},
    {"id": "beaufort",     "name": "Beaufort West",  "province": "Western Cape",  "km": 1035.5,
     "latitude": -32.3568, "longitude": 22.5811},
    {"id": "matjies",      "name": "Matjiesfontein", "province": "Western Cape",  "km": 1264.0,
     "latitude": -33.2167, "longitude": 20.5833},
    {"id": "worcester",    "name": "Worcester",      "province": "Western Cape",  "km": 1393.7,
     "latitude": -33.6464, "longitude": 19.4487},
    {"id": "cape-town",    "name": "Cape Town",      "province": "Western Cape",  "km": 1568.3,
     "latitude": -33.9249, "longitude": 18.4241},
]

#: Published calls. Three of them - Klerksdorp, Wellington, Bellville - are real
#: stops the app does not model as destinations; they are listed because leaving
#: a call out of a timetable is its own kind of lie, and their kilometre is null
#: rather than invented.
#:
#: No platform numbers. We do not have them, and a passenger acting on a
#: fabricated platform number is exactly the harm this project keeps warning
#: about in its own documents.
CALLS: list[dict] = [
    {"stop_id": "pretoria",     "stop_name": "Pretoria",       "km": 0.0,    "day": 1, "departs": "08:30"},
    {"stop_id": "johannesburg", "stop_name": "Johannesburg",   "km": 56.6,   "day": 1, "departs": "10:00"},
    {"stop_id": None,           "stop_name": "Klerksdorp",     "km": None,   "day": 1, "departs": "14:15"},
    {"stop_id": "kimberley",    "stop_name": "Kimberley",      "km": 539.7,  "day": 1, "departs": "19:07"},
    {"stop_id": "de-aar",       "stop_name": "De Aar",         "km": 776.0,  "day": 1, "departs": "23:05"},
    {"stop_id": "beaufort",     "stop_name": "Beaufort West",  "km": 1035.5, "day": 2, "departs": "03:40"},
    {"stop_id": "matjies",      "stop_name": "Matjiesfontein", "km": 1264.0, "day": 2, "departs": "07:15"},
    {"stop_id": "worcester",    "stop_name": "Worcester",      "km": 1393.7, "day": 2, "departs": "09:20"},
    {"stop_id": None,           "stop_name": "Wellington",     "km": None,   "day": 2, "departs": "11:10"},
    {"stop_id": None,           "stop_name": "Bellville",      "km": None,   "day": 2, "departs": "12:10"},
    {"stop_id": "cape-town",    "stop_name": "Cape Town",      "km": 1568.3, "day": 2, "arrives":  "12:40"},
]

#: Said wherever these times are served. The API is not a live feed and must not
#: be mistaken for one.
SCHEDULE_NOTICE = (
    "Published schedule compiled from operator timetables (seat61.com, checked "
    "September 2026). This is not live operational data. Confirm every departure "
    "with the operator before travelling."
)
