"""Blue work -> ZF CRM bridge: CSV column mapping, normalisation, status maps, idempotent upserts.

Idempotency: every imported record carries ``external_ref`` (Blue work id, or a stable hash of the
row when the CSV has no id column). Re-importing the same file updates records, never duplicates.

Entities: customers, leads, jobs, quotes, invoices, service_plans.
"""
import csv
import hashlib
import io
import re
import unicodedata
from datetime import datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import text

import models
from money import new_token, next_number, TPS_RATE, TVQ_RATE

ENTITIES = ["customers", "leads", "jobs", "quotes", "invoices", "service_plans"]
SOURCE = "bluework"

# ── Field catalogue + header aliases (English / French) ───────────────────────

_PERSON = ["name", "first_name", "last_name", "phone", "email", "address", "city", "postal_code",
           "status", "tags", "notes", "date", "external_id"]
_CUSTOMER_REF = ["customer_id", "customer_name", "phone", "email"]

FIELDS = {
    "customers": ["external_id"] + [f for f in _PERSON if f != "external_id"],
    "leads": ["external_id"] + [f for f in _PERSON if f != "external_id"],
    "jobs": ["external_id"] + _CUSTOMER_REF + ["title", "status", "scheduled", "total", "technician", "notes", "address"],
    "quotes": ["external_id", "number"] + _CUSTOMER_REF + ["title", "status", "total", "date", "address"],
    "invoices": ["external_id", "number"] + _CUSTOMER_REF + ["status", "total", "paid", "date", "due_date", "paid_date"],
    "service_plans": ["external_id"] + _CUSTOMER_REF + ["name", "status", "price", "frequency",
                                                         "visits", "start_date", "end_date"],
}
REQUIRED = {  # at least one of each group must be mapped / present on a row
    "customers": [["name", "first_name", "phone", "email"]],
    "leads": [["name", "first_name", "phone", "email"]],
    "jobs": [["customer_id", "customer_name", "phone", "email"]],
    "quotes": [["customer_id", "customer_name", "phone", "email"]],
    "invoices": [["customer_id", "customer_name", "phone", "email"]],
    "service_plans": [["customer_id", "customer_name", "phone", "email"]],
}

ALIASES = {
    "customer_id": ["customer id", "client id", "id client", "id customer", "contact id", "id contact",
                    "customer number", "numero client", "customer"],
    "external_id": ["id", "bw id", "blue work id", "uuid", "job id", "quote id", "invoice id", "plan id",
                    "lead id", "id job", "id soumission", "id facture", "id lead", "id plan", "reference",
                    "ref"],
    "number": ["number", "no", "num", "quote number", "quote no", "quote", "invoice number", "invoice no",
               "invoice", "numero", "numero de soumission", "numero de facture", "no de facture",
               "no de soumission", "soumission", "facture"],
    "first_name": ["first name", "firstname", "given name", "prenom"],
    "last_name": ["last name", "lastname", "surname", "family name", "nom de famille"],
    "customer_name": ["customer name", "client name", "nom du client", "nom client", "client", "customer",
                      "contact", "contact name", "nom du contact"],
    "name": ["name", "full name", "nom", "nom complet", "customer name", "client name", "nom du client",
             "nom client", "client", "customer", "lead name", "nom du lead"],
    "phone": ["phone", "phone number", "mobile", "cell", "cellphone", "telephone", "tel", "cellulaire",
              "numero de telephone", "customer phone", "telephone client"],
    "email": ["email", "e mail", "email address", "courriel", "adresse courriel", "adresse email",
              "customer email", "courriel client"],
    "address": ["address", "street", "street address", "service address", "adresse", "adresse de service",
                "property address", "adresse de la propriete", "rue"],
    "city": ["city", "town", "ville", "municipalite"],
    "postal_code": ["postal code", "zip", "zip code", "postcode", "code postal"],
    "status": ["status", "statut", "etat", "stage", "pipeline status", "lifecycle", "lifecycle status",
               "etape", "payment status"],
    "tags": ["tags", "tag", "etiquettes", "etiquette", "labels", "segments"],
    "notes": ["notes", "note", "comments", "comment", "commentaires", "description", "details", "memo"],
    "date": ["date", "created", "created at", "created date", "date created", "date de creation", "cree le",
             "issue date", "issued", "date d emission", "date de la facture", "date de la soumission",
             "sent date"],
    "scheduled": ["scheduled", "scheduled date", "scheduled for", "date prevue", "date planifiee",
                  "date de service", "service date", "start", "start date", "date de debut", "job date",
                  "date du job", "appointment", "rendez vous", "date"],
    "due_date": ["due date", "due", "date d echeance", "echeance", "date limite"],
    "paid_date": ["paid date", "paid at", "date paid", "payment date", "date de paiement", "paye le"],
    "start_date": ["start date", "start", "date de debut", "debut", "begins"],
    "end_date": ["end date", "end", "expires", "expiry", "expiration", "date de fin", "fin"],
    "total": ["total", "amount", "grand total", "montant", "montant total", "price", "prix", "value",
              "valeur", "total amount", "total ttc"],
    "paid": ["paid", "amount paid", "paid amount", "montant paye", "paye", "payments", "paiements",
             "total paid", "total paye"],
    "price": ["price", "prix", "amount", "montant", "plan price", "price per period", "prix du plan", "total",
              "cost", "cout"],
    "technician": ["technician", "tech", "technicien", "assigned to", "assigned", "assigne a", "employee",
                   "employe", "crew", "equipe"],
    "title": ["title", "titre", "job", "job name", "job title", "service", "services", "name", "nom",
              "description", "type"],
    "frequency": ["frequency", "billing frequency", "billing", "frequence", "frequence de facturation",
                  "interval", "recurrence"],
    "visits": ["visits", "visits per year", "nombre de visites", "visites", "visites par annee"],
}
# plans call the title "name"; quotes/jobs "title" but may also carry a plain "name"
ALIASES_BY_ENTITY = {
    ("service_plans", "name"): ["name", "nom", "plan", "plan name", "nom du plan", "forfait", "title", "titre",
                                "service plan"],
    ("jobs", "total"): ["total", "amount", "montant", "montant total", "price", "prix", "value", "valeur"],
    ("service_plans", "start_date"): ["start date", "start", "date de debut", "debut", "begins", "date"],
}


def _fold(s) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", " ", s.lower())
    return s.strip()


def guess_mapping(entity: str, headers: list) -> dict:
    """{field: header} guessed from header names. Each header is used at most once; the more specific
    fields (customer_id, first/last name) claim their headers first."""
    if entity not in FIELDS:
        raise ValueError(f"unknown entity {entity!r}")
    folded = {h: _fold(h) for h in headers}
    wanted = list(FIELDS[entity])
    # claim order: specific ids/names first so generic ones ("name", "id") don't steal their headers
    order = ["customer_id", "customer_name", "first_name", "last_name", "external_id", "number"]
    wanted.sort(key=lambda f: (order.index(f) if f in order else len(order)))
    mapping, used = {}, set()
    for field in wanted:
        aliases = ALIASES_BY_ENTITY.get((entity, field), ALIASES.get(field, []))
        for alias in aliases:
            hit = next((h for h, f in folded.items() if f == alias and h not in used), None)
            if hit is not None:
                mapping[field] = hit
                used.add(hit)
                break
    # a combined "name" is redundant when first/last are present
    if "first_name" in mapping and "name" in mapping and entity in ("customers", "leads"):
        used.discard(mapping.pop("name"))
    return mapping


# ── CSV reading ───────────────────────────────────────────────────────────────

def read_csv(data: bytes):
    """bytes -> (headers, rows[list of dict]). Handles BOM, utf-8/cp1252, comma/semicolon/tab."""
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            text = data.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    sample = text[:4096]
    delim = max([",", ";", "\t"], key=lambda d: sample.split("\n", 1)[0].count(d))
    reader = csv.DictReader(io.StringIO(text, newline=""), delimiter=delim)
    headers = [h.strip() for h in (reader.fieldnames or []) if h is not None]
    rows = []
    for r in reader:
        rows.append({(k or "").strip(): (v or "").strip() for k, v in r.items() if k is not None})
    return headers, rows


# ── Value parsers ─────────────────────────────────────────────────────────────

def normalize_phone(raw):
    """E.164 for NANP numbers (same rules as scripts/import_saguenay_clients.py). None if invalid."""
    if not raw or not str(raw).strip():
        return None
    digits = re.sub(r"\D", "", str(raw))
    if len(digits) == 11 and digits.startswith("1"):
        e164 = "+" + digits
    elif len(digits) == 10:
        e164 = "+1" + digits
    else:
        return None
    if e164[2] in "01" or e164[5] in "01":
        return None
    return e164


def clean_email(raw):
    e = (raw or "").strip()
    return e.lower() if re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", e) else None


def parse_cents(raw):
    """'$1,234.56' / '1 234,56 $' / '1.234,56' -> 123456. None when empty/unparseable."""
    if raw is None or not str(raw).strip():
        return None
    s = re.sub(r"[^\d,.\-()]", "", str(raw).replace(" ", " "))
    neg = s.startswith("-") or (s.startswith("(") and s.endswith(")"))
    s = s.strip("-()")
    if not s:
        return None
    if "," in s and "." in s:      # last separator is the decimal one
        s = s.replace(",", "") if s.rfind(".") > s.rfind(",") else s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".") if s.count(",") == 1 and len(s.rpartition(",")[2]) != 3 else s.replace(",", "")
    elif s.count(".") > 1:
        s = s.replace(".", "")
    try:
        cents = int((Decimal(s) * 100).quantize(Decimal(1)))
    except InvalidOperation:
        return None
    return -cents if neg else cents


_DATE_FORMATS = ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y/%m/%d", "%b %d, %Y", "%B %d, %Y",
                 "%d %b %Y", "%d %B %Y", "%b %d %Y"]


def parse_date(raw):
    """-> ISO string 'YYYY-MM-DDTHH:MM:SS' or None. a/b/yyyy: day-first (Québec) unless b>12."""
    s = (raw or "").strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "")).replace(tzinfo=None).isoformat(timespec="seconds")
    except ValueError:
        pass
    m = re.match(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$", s)
    if m:
        a, b, y = int(m[1]), int(m[2]), int(m[3])
        d, mo = (b, a) if (b > 12 and a <= 12) else (a, b)
        hh, mm, ss = int(m[4] or 0), int(m[5] or 0), int(m[6] or 0)
        if m[7]:
            hh = hh % 12 + (12 if m[7].lower() == "pm" else 0)
        try:
            return datetime(y, mo, d, hh, mm, ss).isoformat(timespec="seconds")
        except ValueError:
            return None
    for f in _DATE_FORMATS:
        try:
            return datetime.strptime(s, f).isoformat(timespec="seconds")
        except ValueError:
            continue
    return None


def _dt(iso):
    return datetime.fromisoformat(iso) if iso else None


def _cap(word):
    return word[:1].upper() + word[1:].lower() if word else word


def titlecase_name(s):
    return " ".join("".join(t if t in "-'’" else _cap(t) for t in re.split(r"([-'’])", p))
                    for p in " ".join((s or "").split()).split(" "))


def split_name(raw):
    n = titlecase_name(raw or "")
    if not n:
        return None, None
    parts = n.split(" ")
    return parts[0], (" ".join(parts[1:]) or None)


# ── Status maps (Blue work -> ZF CRM) ─────────────────────────────────────────

QUOTE_STATUS = {
    "draft": "draft", "brouillon": "draft", "not sent": "draft", "unsent": "draft", "non envoye": "draft",
    "non envoyee": "draft", "sent": "sent", "envoye": "sent", "envoyee": "sent",
    "viewed": "viewed", "vu": "viewed", "vue": "viewed", "consulte": "viewed", "consultee": "viewed",
    "accepted": "accepted", "signed": "accepted", "accepte": "accepted", "acceptee": "accepted",
    "signe": "accepted", "signee": "accepted", "approved": "accepted", "approuve": "accepted",
    "declined": "declined", "refuse": "declined", "refusee": "declined", "rejected": "declined",
    "expired": "expired", "expire": "expired", "expiree": "expired",
}
INVOICE_STATUS = {
    "draft": "draft", "brouillon": "draft", "not sent": "draft", "unsent": "draft", "non envoye": "draft",
    "non envoyee": "draft", "sent": "sent", "envoye": "sent", "envoyee": "sent",
    "viewed": "viewed", "vu": "viewed", "vue": "viewed", "consulte": "viewed", "consultee": "viewed",
    "paid": "paid", "paye": "paid", "payee": "paid",
    "partial": "partial", "partially paid": "partial", "partiellement paye": "partial",
    "partiellement payee": "partial", "paiement partiel": "partial",
    "failed": "sent", "echoue": "sent", "echec": "sent", "past due": "sent", "overdue": "sent", "en retard": "sent",
    "cancelled": "cancelled", "canceled": "cancelled", "annule": "cancelled", "annulee": "cancelled",
    "void": "cancelled", "refunded": "refunded", "rembourse": "refunded", "remboursee": "refunded",
    "partial refund": "paid", "partially refunded": "paid", "remboursement partiel": "paid",
}
PLAN_STATUS = {
    "draft": "draft", "brouillon": "draft", "sent": "sent", "envoye": "sent", "envoyee": "sent",
    "pending": "sent", "en attente": "sent", "active": "active", "actif": "active", "active plan": "active",
    "past due": "past_due", "en retard": "past_due", "overdue": "past_due",
    "cancelled": "cancelled", "canceled": "cancelled", "annule": "cancelled", "annulee": "cancelled",
    "expired": "expired", "expire": "expired", "expiree": "expired",
}
# job_status: todo | payment_pending | done | cancelled
JOB_STATUS = {
    "scheduled": "todo", "planifie": "todo", "planifiee": "todo", "pending": "todo", "en attente": "todo",
    "unscheduled": "todo", "in progress": "todo", "en cours": "todo", "confirmed": "todo", "confirme": "todo",
    "completed": "done", "complete": "done", "completee": "done", "termine": "done", "terminee": "done",
    "done": "done", "finished": "done", "cancelled": "cancelled", "canceled": "cancelled",
    "annule": "cancelled", "annulee": "cancelled",
}
JOB_STAGE = {"todo": "won", "payment_pending": "won", "done": "won", "cancelled": "lost"}
# Contact.status. Customer lifecycle: new / upcoming / active plan / past (all are customers).
CUSTOMER_LIFECYCLE = {"new": "customer", "nouveau": "customer", "upcoming": "customer", "a venir": "customer",
                      "active plan": "customer", "plan actif": "customer", "active": "customer",
                      "past": "customer", "passe": "customer", "ancien": "customer", "inactive": "inactive",
                      "inactif": "inactive"}
LEAD_STATUS = {"new": "lead", "nouveau": "lead", "open": "lead", "contacted": "lead", "contacte": "lead",
               "qualified": "prospect", "qualifie": "prospect", "quoted": "prospect", "quote sent": "prospect",
               "estimate sent": "prospect", "proposal": "prospect", "proposal sent": "prospect",
               "follow up": "prospect", "suivi": "prospect", "negotiation": "prospect",
               "won": "customer", "converted": "customer", "converti": "customer", "customer": "customer",
               "client": "customer", "lost": "inactive", "perdu": "inactive", "dead": "inactive",
               "closed lost": "inactive", "not interested": "inactive", "archived": "inactive",
               "archive": "inactive", "unqualified": "inactive", "spam": "inactive"}
FREQUENCY = {"monthly": "monthly", "month": "monthly", "mensuel": "monthly", "mensuelle": "monthly",
             "par mois": "monthly", "yearly": "yearly", "annual": "yearly", "annually": "yearly",
             "annuel": "yearly", "annuelle": "yearly", "year": "yearly", "par annee": "yearly",
             "per visit": "per_visit", "par visite": "per_visit", "visit": "per_visit", "one time": "per_visit"}

STATUS_MAPS = {"quotes": QUOTE_STATUS, "invoices": INVOICE_STATUS, "service_plans": PLAN_STATUS,
               "jobs": JOB_STATUS, "customers": CUSTOMER_LIFECYCLE, "leads": LEAD_STATUS}
STATUS_DEFAULT = {"quotes": "draft", "invoices": "draft", "service_plans": "draft", "jobs": "todo",
                  "customers": "customer", "leads": "lead"}


def map_status(entity: str, raw):
    """-> (mapped_status, known: bool). Empty -> default, known."""
    key = _fold(raw)
    if not key:
        return STATUS_DEFAULT[entity], True
    m = STATUS_MAPS[entity].get(key)
    return (m, True) if m else (STATUS_DEFAULT[entity], False)


# ── Row normalisation ─────────────────────────────────────────────────────────

_MONEY = {"total", "paid", "price"}
_DATES = {"date", "scheduled", "due_date", "paid_date", "start_date", "end_date"}


def normalize_row(entity: str, row: dict, mapping: dict) -> dict:
    """Apply the mapping to a raw CSV row -> clean JSON-safe dict (cents, ISO dates, E.164 phone)."""
    def raw(field):
        h = mapping.get(field)
        return (row.get(h) or "").strip() if h else ""

    n = {f: raw(f) for f in FIELDS[entity] if raw(f)}
    out = {"_raw_status": n.get("status", "")}
    for f, v in n.items():
        if f in _MONEY:
            out[f] = parse_cents(v)
        elif f in _DATES:
            out[f] = parse_date(v)
        elif f == "phone":
            out[f] = normalize_phone(v)
        elif f == "email":
            out[f] = clean_email(v)
        else:
            out[f] = v
    if entity in ("customers", "leads"):
        first, last = out.get("first_name"), out.get("last_name")
        if not first and out.get("name"):
            first, last = split_name(out["name"])
        elif first:
            first, last = titlecase_name(first), titlecase_name(last or "") or None
        out["first_name"], out["last_name"] = first, last
        out.pop("name", None)
    else:
        if entity == "service_plans" and not out.get("name"):
            out["name"] = "Plan de service"
        if entity != "service_plans" and out.get("customer_name"):
            out["customer_name"] = titlecase_name(out["customer_name"])
    if entity == "service_plans" and "frequency" in out:
        out["frequency"] = FREQUENCY.get(_fold(out["frequency"]), "yearly")
    if "visits" in out:
        out["visits"] = int(re.sub(r"\D", "", out["visits"]) or 0) or None
    out["status"], out["_status_known"] = map_status(entity, n.get("status"))
    # input validation hints
    for f in _MONEY | _DATES | {"phone", "email"}:
        if f in n and out.get(f) is None:
            out.setdefault("_bad", []).append(f)
    return out


def normalize_rows(entity, rows, mapping):
    return [normalize_row(entity, r, mapping) for r in rows]


def _row_ref(entity, n, row_raw):
    """external_ref: the Blue work id, else a stable hash of the row (re-import still idempotent)."""
    ext = (n.get("external_id") or "").strip()
    if ext:
        return f"bw:{ext}"
    if entity in ("quotes", "invoices") and (n.get("number") or "").strip():
        return f"bw:#{n['number'].strip()}"   # Blue work document number is stable too
    if entity in ("customers", "leads"):
        return None   # matched by phone / email / name instead
    key = "|".join(str(row_raw.get(k, "")) for k in sorted(row_raw))
    return f"bw:h:{hashlib.sha1(f'{entity}|{key}'.encode()).hexdigest()[:16]}"


# ── Matching helpers ──────────────────────────────────────────────────────────

def _contact_ref(kind, ext):
    return f"bw:{kind}:{ext}"


def _digits_match(c, e164):
    return normalize_phone(c.phone or "") == e164


def find_contact(db, *, ext_id=None, phone=None, email=None, first=None, last=None, address=None):
    q = db.query(models.Contact).filter(models.Contact.deleted_at.is_(None))
    if ext_id:
        for ref in (_contact_ref("c", ext_id), _contact_ref("l", ext_id), f"bw:{ext_id}"):
            c = q.filter(models.Contact.external_ref == ref).first()
            if c:
                return c
    if phone:
        tail = phone[-10:]
        for c in q.filter(models.Contact.phone.like(f"%{tail[-4:]}%")).all():
            if _digits_match(c, phone):
                return c
    if email:
        c = q.filter(models.Contact.email.ilike(email)).first()
        if c:
            return c
    if first and not phone and not email:
        cands = q.filter(models.Contact.first_name.ilike(first)).all()
        for c in cands:
            if (c.last_name or "").lower() == (last or "").lower() and (
                    not address or not c.address or address.lower() in c.address.lower()
                    or c.address.lower() in address.lower()):
                return c
    return None


def _add_tag(contact, tag):
    tags = [t.strip() for t in (contact.tags or "").split(",") if t.strip()]
    if tag not in tags:
        tags.append(tag)
    contact.tags = ",".join(tags)


def _slug(s):
    return re.sub(r"[\s,]+", "-", (s or "").strip().lower())


def _full_address(n):
    parts = [p for p in (n.get("address"), n.get("city")) if p]
    if n.get("address") and n.get("city") and n["city"].lower() in n["address"].lower():
        parts = [n["address"]]
    s = ", ".join(parts)
    if n.get("postal_code") and n["postal_code"].lower() not in s.lower():
        s = f"{s} {n['postal_code']}".strip()
    return s or None


def _ensure_property(db, contact, n):
    street = n.get("address")
    if not street:
        return
    existing = db.query(models.Property).filter(models.Property.contact_id == contact.id).all()
    if any((p.address or "").strip().lower() == street.strip().lower() for p in existing):
        return
    db.add(models.Property(contact_id=contact.id, address=street, city=n.get("city"),
                           postal_code=n.get("postal_code"), is_primary=not existing))


# ── Upserts. Each returns "created" | "updated" | "skipped" or raises RowError ─

class RowError(Exception):
    pass


def upsert_contact(db, entity, n, row_raw=None):
    kind = "l" if entity == "leads" else "c"
    ext = (n.get("external_id") or "").strip()
    if not (n.get("first_name") or n.get("phone") or n.get("email")):
        raise RowError("no name, phone or email")
    first = n.get("first_name") or (n.get("email") or n.get("phone") or "").split("@")[0] or "Inconnu"
    c = find_contact(db, ext_id=ext, phone=n.get("phone"), email=n.get("email"),
                     first=n.get("first_name"), last=n.get("last_name"), address=n.get("address"))
    created = c is None
    if created:
        c = models.Contact(first_name=first, status=STATUS_DEFAULT[entity], source=SOURCE)
        db.add(c)
    for f in ("last_name", "phone", "email", "notes"):
        if n.get(f):
            setattr(c, f, n[f])
    if n.get("first_name"):
        c.first_name = n["first_name"]
    addr = _full_address(n)
    if addr:
        c.address = addr
    if ext and (created or not c.external_ref):
        c.external_ref = _contact_ref(kind, ext)
    new_status = n["status"]
    if entity == "customers" or created or c.status in (None, "lead", "prospect"):
        c.status = new_status
    if n.get("_raw_status"):
        c.tags = ",".join(t for t in (c.tags or "").split(",") if t.strip() and not t.startswith("bw:"))
        _add_tag(c, f"bw:{_slug(n['_raw_status'])}")
    for t in (n.get("tags") or "").replace(";", ",").split(","):
        if t.strip():
            _add_tag(c, t.strip())
    if not c.source:
        c.source = SOURCE
    db.flush()
    _ensure_property(db, c, n)
    db.flush()
    return "created" if created else "updated"


def _resolve_contact(db, n):
    c = find_contact(db, ext_id=n.get("customer_id"), phone=n.get("phone"), email=n.get("email"),
                     **dict(zip(("first", "last"), split_name(n.get("customer_name") or ""))))
    if not c:
        who = n.get("customer_id") or n.get("customer_name") or n.get("phone") or n.get("email") or "?"
        raise RowError(f"customer not found ({who}) — import Customers first")
    return c


def _by_ref(db, model, ref):
    return db.query(model).filter(model.external_ref == ref).first() if ref else None


def _set_total_with_item(db, doc, parent_type, total_cents, name):
    """Blue work totals are tax-inclusive: back out TPS/TVQ and keep one LineItem marked 'bw-import'."""
    if total_cents is None:
        return
    sub = round(total_cents / (1 + TPS_RATE + TVQ_RATE))
    tps = round(sub * TPS_RATE)
    doc.subtotal_cents, doc.tps_cents, doc.total_cents = sub, tps, total_cents
    doc.tvq_cents = total_cents - sub - tps
    doc.discount_cents = 0
    items = db.query(models.LineItem).filter_by(parent_type=parent_type, parent_id=doc.id).all()
    if not items:
        db.add(models.LineItem(parent_type=parent_type, parent_id=doc.id, name=name or "Importé de Blue work",
                               description="bw-import", qty=1, unit_price_cents=sub, taxable=True))
    elif len(items) == 1 and items[0].description == "bw-import":
        items[0].unit_price_cents = sub
        if name:
            items[0].name = name


def _unique_number(db, model, prefix, wanted):
    if wanted:
        wanted = wanted.strip()
        if not wanted.upper().startswith(prefix + "-"):
            wanted = f"{prefix}-{wanted.lstrip('#')}"
        if not db.query(model).filter(model.number == wanted).first():
            return wanted
    return next_number(db, model, prefix)


def upsert_quote(db, n, row_raw):
    ref = _row_ref("quotes", n, row_raw)
    contact = _resolve_contact(db, n)
    q = _by_ref(db, models.Quote, ref)
    created = q is None
    if created:
        q = models.Quote(contact_id=contact.id, token=new_token(), require_signature=True,
                         number=_unique_number(db, models.Quote, "Q", n.get("number")), external_ref=ref)
        db.add(q)
    q.contact_id = contact.id
    q.status = n["status"]
    if n.get("title"):
        q.title = n["title"]
    d = _dt(n.get("date"))
    if d and created:
        q.created_at = d
    if q.status != "draft":
        q.sent_at = q.sent_at or d
    if q.status in ("viewed", "accepted"):
        q.viewed_at = q.viewed_at or d
    if q.status == "accepted":
        q.accepted_at = q.accepted_at or d
    if q.status == "declined":
        q.declined_at = q.declined_at or d
    db.flush()
    _set_total_with_item(db, q, "quote", n.get("total"), n.get("title"))
    db.flush()
    return "created" if created else "updated"


def upsert_invoice(db, n, row_raw):
    ref = _row_ref("invoices", n, row_raw)
    contact = _resolve_contact(db, n)
    inv = _by_ref(db, models.Invoice, ref)
    created = inv is None
    if created:
        inv = models.Invoice(contact_id=contact.id, token=new_token(), external_ref=ref,
                             number=_unique_number(db, models.Invoice, "F", n.get("number")))
        db.add(inv)
    inv.contact_id = contact.id
    status = n["status"]
    inv.issue_date = _dt(n.get("date")) or inv.issue_date or datetime.utcnow()
    if n.get("due_date"):
        inv.due_date = _dt(n["due_date"])
    db.flush()
    _set_total_with_item(db, inv, "invoice", n.get("total"), None)
    total = inv.total_cents or 0
    paid = n.get("paid")
    if paid is None:
        paid = total if status in ("paid", "refunded") else 0
    if status in ("sent", "viewed", "draft") and 0 < paid < total:
        status = "partial"
    elif status in ("sent", "viewed", "draft") and paid >= total > 0:
        status = "paid"
    if status == "partial" and paid >= total > 0:
        status = "paid"
    inv.status, inv.paid_cents = status, paid
    if status != "draft":
        inv.sent_at = inv.sent_at or inv.issue_date
    if status == "viewed":
        inv.viewed_at = inv.viewed_at or inv.issue_date
    if status in ("paid", "refunded"):
        inv.paid_at = _dt(n.get("paid_date")) or inv.paid_at or inv.issue_date
    if n.get("_raw_status") and _fold(n["_raw_status"]) in ("failed", "echoue", "partial refund",
                                                              "partially refunded"):
        inv.notes = f"Blue work: {n['_raw_status']}"
    db.flush()
    pay_ref = f"{ref}:pay"
    pay = _by_ref(db, models.Payment, pay_ref)
    if paid > 0:
        if pay is None:
            pay = models.Payment(invoice_id=inv.id, amount_cents=paid, method="other", external_ref=pay_ref)
            db.add(pay)
        pay.amount_cents = paid
        pay.paid_at = inv.paid_at or inv.issue_date
        pay.refunded_cents = paid if status == "refunded" else 0
        pay.notes = "Importé de Blue work"
    elif pay is not None:
        db.delete(pay)
    db.flush()
    return "created" if created else "updated"


def upsert_job(db, n, row_raw):
    ref = _row_ref("jobs", n, row_raw)
    contact = _resolve_contact(db, n)
    d = _by_ref(db, models.Deal, ref)
    created = d is None
    if created:
        d = models.Deal(title=n.get("title") or "Job Blue work", external_ref=ref, contact_id=contact.id)
        db.add(d)
    d.contact_id = contact.id
    if n.get("title"):
        d.title = n["title"]
    if n.get("total") is not None:
        d.value = n["total"] / 100
    if n.get("scheduled"):
        d.expected_close_date = _dt(n["scheduled"])
    d.job_status = n["status"]
    d.stage = JOB_STAGE[d.job_status]
    if d.job_status == "done" and not d.marked_done_at:
        d.marked_done_at = _dt(n.get("scheduled")) or datetime.utcnow()
    notes = [x for x in ((n.get("notes") or "").strip(),
                         f"Technicien (Blue work): {n['technician']}" if n.get("technician") else "") if x]
    if notes:
        d.notes = "\n".join(notes)
    db.flush()
    return "created" if created else "updated"


def upsert_plan(db, n, row_raw):
    ref = _row_ref("service_plans", n, row_raw)
    contact = _resolve_contact(db, n)
    p = _by_ref(db, models.ServicePlan, ref)
    created = p is None
    if created:
        p = models.ServicePlan(contact_id=contact.id, name=n["name"], token=new_token(), external_ref=ref)
        db.add(p)
    p.contact_id, p.name, p.status = contact.id, n["name"], n["status"]
    if n.get("price") is not None:
        p.price_cents = n["price"]
    if n.get("frequency"):
        p.billing_frequency = n["frequency"]
    if n.get("visits"):
        p.visits_per_year = n["visits"]
    if n.get("start_date"):
        p.start_date = _dt(n["start_date"])
    if n.get("end_date"):
        p.end_date = _dt(n["end_date"])
    db.flush()
    return "created" if created else "updated"


def _dispatch(db, entity, n, raw):
    if entity in ("customers", "leads"):
        return upsert_contact(db, entity, n, raw)
    return {"jobs": upsert_job, "quotes": upsert_quote, "invoices": upsert_invoice,
            "service_plans": upsert_plan}[entity](db, n, raw)


# ── Orchestration ─────────────────────────────────────────────────────────────

def run_import(db, entity: str, rows: list, mapping: dict, dry_run: bool = True) -> dict:
    """Upsert all rows. dry_run -> everything is rolled back at the end (same code path, same counts).
    Returns {created, updated, skipped, errors:[{row, reason}], warnings:[{row, reason}], dry_run}."""
    if entity not in FIELDS:
        raise ValueError(f"unknown entity {entity!r}")
    report = {"entity": entity, "created": 0, "updated": 0, "skipped": 0, "errors": [], "warnings": [],
              "dry_run": bool(dry_run)}
    missing = [g for g in REQUIRED[entity] if not any(f in mapping and mapping[f] for f in g)]
    if missing:
        report["errors"].append({"row": 0, "reason": "mapping needs one of: " + ", ".join(missing[0])})
        report["skipped"] = len(rows)
        return report
    try:
        # pysqlite only opens a real transaction on DML; without this, the first SAVEPOINT would start (and
        # its RELEASE would commit) the transaction, breaking dry-run rollback. Harmless on PostgreSQL.
        db.execute(text("DELETE FROM app_settings WHERE 1=0"))
        for i, raw in enumerate(rows, start=2):   # row 1 is the header
            n = normalize_row(entity, raw, mapping)
            if n.get("_bad"):
                report["warnings"].append({"row": i, "reason": "unreadable value ignored: " + ", ".join(n["_bad"])})
            if not n["_status_known"]:
                report["warnings"].append({"row": i, "reason": f"unknown status {n['_raw_status']!r} "
                                                              f"-> default {n['status']!r}"})
            try:
                with db.begin_nested():
                    res = _dispatch(db, entity, n, raw)
                report[res] += 1
            except RowError as e:
                report["skipped"] += 1
                report["errors"].append({"row": i, "reason": str(e)})
            except Exception as e:  # noqa: BLE001 - one bad row must not sink the batch
                report["skipped"] += 1
                report["errors"].append({"row": i, "reason": f"{type(e).__name__}: {e}"})
        if dry_run:
            db.rollback()
        else:
            db.commit()
    except Exception:
        db.rollback()
        raise
    return report


TABLES = {"contacts": models.Contact, "deals (jobs)": models.Deal, "quotes": models.Quote,
          "invoices": models.Invoice, "payments": models.Payment, "service_plans": models.ServicePlan}


def bridged_counts(db) -> dict:
    return {name: db.query(m).filter(m.external_ref.isnot(None)).count() for name, m in TABLES.items()}
