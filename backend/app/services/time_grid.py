from datetime import UTC, datetime

MAX_POINTS = 20_000
# Before 15 Oct 1582 Horizons prints Julian calendar dates (1500-Feb-29), which do not parse
# as the Gregorian dates we send; 1583 is the first whole Gregorian year.
EARLIEST = datetime(1583, 1, 1, tzinfo=UTC)


def to_utc(value: datetime) -> datetime:
    """Naive datetimes are treated as UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def check_time_grid(start: datetime, end: datetime, step_minutes: int) -> tuple[datetime, datetime]:
    """Normalize to UTC and make sure the grid is sane. Raises ValueError otherwise."""
    start, end = to_utc(start), to_utc(end)
    if end <= start:
        raise ValueError("end must be later than start")
    if start < EARLIEST:
        raise ValueError("start must be in 1583 or later (Gregorian calendar dates only)")
    points = (end - start).total_seconds() / 60 / step_minutes + 1
    if points > MAX_POINTS:
        raise ValueError(
            f"Too many points ({int(points)}, max {MAX_POINTS}); increase step_minutes"
        )
    return start, end
