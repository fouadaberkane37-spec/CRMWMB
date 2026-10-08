import re

# Characters Excel (and openpyxl) refuse inside a cell: ASCII control chars except tab/newline/CR.
_ILLEGAL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
# Phone numbers and amounts legitimately start with + or -; anything else that does could be a formula.
_NUMERIC = re.compile(r"^[+-]?[\d\s().,-]*$")


def clean_text(value):
    if not isinstance(value, str):
        return value
    return _ILLEGAL.sub("", value)


def csv_safe(value):
    """Clean a CSV cell and stop Excel from evaluating text (e.g. an inbound SMS) as a formula."""
    value = clean_text(value)
    if not isinstance(value, str) or not value:
        return value
    if value[0] in "=@\t\r" or (value[0] in "+-" and not _NUMERIC.match(value)):
        return "'" + value
    return value
