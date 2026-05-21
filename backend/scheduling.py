"""
Scheduling constraints — forward-looking only.
Existing violations in the DB are never retroactively blocked.
"""
from datetime import datetime, timedelta
from typing import List, Optional

# ── Service configuration ─────────────────────────────────────────────────────
# key → (required_techs, default_duration_minutes, label_fr)
SERVICE_CONFIG: dict = {
    'gutters':     (2, 120, 'Nettoyage de gouttières'),
    'window-ext':  (1,  90, 'Vitres (Extérieur)'),
    'window-int':  (1,  90, 'Vitres (Intérieur)'),
    'window-full': (2, 180, 'Vitres (Int. + Ext.)'),
    'pressure':    (1,  90, 'Lavage haute pression'),
    'roof':        (2, 150, 'Nettoyage de toiture'),
    'screens':     (1,  60, 'Nettoyage de moustiquaires'),
    'solar':       (2, 120, 'Panneaux solaires'),
    'estimate':    (1,  60, 'Estimation'),
    'follow_up':   (1,  30, 'Suivi'),
    # backward-compat
    'service':     (1,  90, 'Service général'),
    'install':     (2, 120, 'Installation'),
}

MAX_1TECH_JOBS  = 5
BUFFER_MINUTES  = 30


def get_tech_requirement(service_type: str) -> int:
    return SERVICE_CONFIG.get(service_type, (1, 90, ''))[0]


def get_default_duration(service_type: str) -> int:
    return SERVICE_CONFIG.get(service_type, (1, 90, ''))[1]


def get_service_label(service_type: str) -> str:
    return SERVICE_CONFIG.get(service_type, (1, 90, service_type))[2]


def _active(bookings: List) -> List:
    return [b for b in bookings if (b.status or 'todo') != 'cancelled']


def classify_day(bookings: List) -> str:
    """Return 'empty' | '1-tech' | '2-tech' | 'mixed'. Ignores cancelled."""
    active = _active(bookings)
    if not active:
        return 'empty'
    techs = {get_tech_requirement(b.type or 'service') for b in active}
    if len(techs) == 1:
        return '1-tech' if techs.pop() == 1 else '2-tech'
    return 'mixed'


def _buffer_error(new_start: datetime, new_end: datetime,
                  b_start: datetime, b_end: datetime) -> Optional[str]:
    buf = timedelta(minutes=BUFFER_MINUTES)
    # No conflict: new ends ≥30 min before b starts, OR new starts ≥30 min after b ends
    if new_end + buf <= b_start or new_start >= b_end + buf:
        return None
    if new_start < b_end and new_end > b_start:
        return "Ce créneau n'est pas disponible : il chevauche un rendez-vous existant."
    return "Ce créneau n'est pas disponible : un délai de 30 minutes est requis entre les rendez-vous."


def validate_new_booking(
    service_type: str,
    scheduled_at: datetime,
    duration_minutes: int,
    day_bookings: List,  # bookings already on that day, excluding the one being edited
) -> Optional[str]:
    """Return French error string if invalid, None if OK."""
    active = _active(day_bookings)
    new_techs  = get_tech_requirement(service_type)
    new_start  = scheduled_at
    new_end    = new_start + timedelta(minutes=duration_minutes)
    day_class  = classify_day(active)

    # ── Day / tech compatibility ──────────────────────────────────────────────
    if day_class == 'mixed':
        return ("Cette journée contient des rendez-vous mixtes existants. "
                "Aucun nouveau rendez-vous ne peut y être ajouté.")

    if day_class == '1-tech' and new_techs == 2:
        if service_type == 'gutters':
            return ("Impossible d'ajouter un nettoyage de gouttières : "
                    "cette journée est déjà classée comme journée à 1 technicien.")
        return ("Impossible d'ajouter ce service à 2 techniciens : "
                "cette journée est déjà classée comme journée à 1 technicien.")

    if day_class == '2-tech' and new_techs == 1:
        return ("Impossible d'ajouter ce service à 1 technicien : "
                "cette journée nécessite 2 techniciens.")

    # ── Capacity (1-tech days) ────────────────────────────────────────────────
    if day_class == '1-tech' and len(active) >= MAX_1TECH_JOBS:
        return "Cette journée a atteint sa capacité maximale de 5 rendez-vous."
    # Also apply cap when adding the first 1-tech job to an empty day
    if day_class == 'empty' and new_techs == 1 and len(active) >= MAX_1TECH_JOBS:
        return "Cette journée a atteint sa capacité maximale de 5 rendez-vous."

    # ── 30-minute buffer ──────────────────────────────────────────────────────
    for b in active:
        if not b.scheduled_at:
            continue
        b_start = b.scheduled_at
        b_end   = b_start + timedelta(minutes=b.duration_minutes or 60)
        err = _buffer_error(new_start, new_end, b_start, b_end)
        if err:
            return err

    return None


def available_slots(
    service_type: str,
    date_str: str,        # YYYY-MM-DD
    duration_minutes: int,
    day_bookings: List,   # all bookings on that day
    start_hour: int = 8,
    end_hour:   int = 18,
    interval:   int = 30, # minutes
) -> List[str]:
    """Return sorted list of available HH:MM start-time strings."""
    active    = _active(day_bookings)
    new_techs = get_tech_requirement(service_type)
    day_class = classify_day(active)

    # Fast-fail: incompatible day
    if day_class == 'mixed':
        return []
    if day_class == '1-tech' and new_techs == 2:
        return []
    if day_class == '2-tech' and new_techs == 1:
        return []
    if day_class == '1-tech' and len(active) >= MAX_1TECH_JOBS:
        return []

    d        = datetime.strptime(date_str, "%Y-%m-%d").date()
    slots    = []
    cur      = datetime(d.year, d.month, d.day, start_hour, 0)
    deadline = datetime(d.year, d.month, d.day, end_hour,   0)
    dur      = timedelta(minutes=duration_minutes)
    step     = timedelta(minutes=interval)
    buf      = timedelta(minutes=BUFFER_MINUTES)

    while cur + dur <= deadline:
        cur_end = cur + dur
        ok = all(
            (cur_end + buf <= b.scheduled_at) or
            (cur >= b.scheduled_at + timedelta(minutes=b.duration_minutes or 60) + buf)
            for b in active if b.scheduled_at
        )
        if ok:
            slots.append(cur.strftime("%H:%M"))
        cur += step

    return slots
