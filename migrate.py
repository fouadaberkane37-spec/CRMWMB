"""
Migration script: Blueworks CRM → new CRM
Imports 27 contacts + 14 scheduled appointments as activities.
"""
import urllib.request
import urllib.error
import json

BASE = "https://crmwmb-production.up.railway.app/api"


def post(path, payload, token=None):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json",
                 **({"Authorization": f"Bearer {token}"} if token else {})},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


# ── 1. Login ──────────────────────────────────────────────────────────────────
print("Logging in...")
# The auth endpoint expects form data
import urllib.parse
login_data = urllib.parse.urlencode({"username": "admin", "password": "admin123"}).encode()
req = urllib.request.Request(
    f"{BASE}/auth/login",
    data=login_data,
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    method="POST",
)
with urllib.request.urlopen(req) as r:
    token_resp = json.loads(r.read())
TOKEN = token_resp["access_token"]
print(f"  Token obtained.")


# ── 2. Contacts ───────────────────────────────────────────────────────────────
contacts_data = [
    {"first_name": "Amina",        "last_name": "Chellai",        "phone": "+15149174156", "notes": "487 Anémone, Laval, Canada",                          "status": "customer"},
    {"first_name": "Chris",        "last_name": "Stamires",        "phone": "+15146794910", "notes": "277 Montreuil, Laval, Canada",                         "status": "customer"},
    {"first_name": "Mark",         "last_name": "Fernandes",       "phone": "+15149997986", "email": "mark.al.fernandes2016@gmail.com", "notes": "324 rue des Anémones, Laval, Canada", "status": "customer"},
    {"first_name": "Prateek",      "last_name": "Sur",             "phone": "+15147462700", "email": "prateek138@hotmail.ca",           "notes": "333 rue des Anémones, Laval, Canada", "status": "customer"},
    {"first_name": "Raynald",      "last_name": "Langlois",        "phone": "+15793683607", "notes": "16230 rue de l'Esplanade, Laval, Canada",              "status": "customer"},
    {"first_name": "Perry",        "last_name": "Kioussis",        "phone": "+15148231191", "notes": "265 Montreuil, Laval, Canada",                         "status": "customer"},
    {"first_name": "José",         "last_name": "Drapeau",         "phone": "+15142462401", "notes": "684 Cornouille, Laval, Canada",                        "status": "customer"},
    {"first_name": "Marc",         "last_name": "Grégoire",        "phone": "+15149092139", "notes": "380 place Charmante, Laval, Canada",                   "status": "customer"},
    {"first_name": "Alain",        "last_name": "Poirier",         "phone": "+15149680123", "notes": "11940 rue Rubis, Laval, Canada",                       "status": "customer"},
    {"first_name": "Magalie",      "last_name": "",                "phone": "+14388718857", "notes": "45 Terrasses d'Auteuil, Laval, Canada",                "status": "customer"},
    {"first_name": "Diane",        "last_name": "Roy",             "phone": "+15149421157", "notes": "1296 Garden, Laval, Canada",                           "status": "customer"},
    {"first_name": "Jimmy",        "last_name": "Argyriou",        "phone": "+15148933929", "notes": "91 chemin de la Galène Bleue, Laval, Canada",           "status": "customer"},
    {"first_name": "Tammy",        "last_name": "Zacard",          "phone": "+15149266953", "notes": "16805 rue des Saphires, Laval, Canada",                "status": "customer"},
    {"first_name": "Louis Philipe","last_name": "Giguere",         "phone": "+15149281455", "notes": "11630 rue du Platine, Laval, Canada",                  "status": "customer"},
    {"first_name": "Vincent",      "last_name": "Bernier",         "phone": "+14189978725", "notes": "17190 rue des Orchidées, Laval, Canada",               "status": "customer"},
    {"first_name": "Genevieve",    "last_name": "",                "phone": "+15147955593", "notes": "378 chemin de l'Héritage, Laval, Canada",              "status": "customer"},
    {"first_name": "Frederic",     "last_name": "Bergeron",        "phone": "+15142675488", "notes": "100 rue Saint-Pierre Est, Saint-Sauveur, Canada",      "status": "customer"},
    {"first_name": "Dominic",      "last_name": "David",           "phone": "+15142200127", "notes": "120 place Gravie, Laval, Canada",                      "status": "customer"},
    {"first_name": "Bernard",      "last_name": "Chiasson",        "phone": "+15147554876", "notes": "682 chenonsson, Laval, Canada",                        "status": "customer"},
    {"first_name": "Sébastien",    "last_name": "Isabelle",        "phone": "+14505126439", "notes": "479 rue des Villas, Laval, Canada",                    "status": "customer"},
    {"first_name": "Chrystian",    "last_name": "",                "phone": "+15147545542", "notes": "525 rue Bayard, Laval, Canada",                        "status": "customer"},
    {"first_name": "Francois",     "last_name": "Giroux",          "phone": "+15149104322", "notes": "590 rue Bayard, Laval, Canada",                        "status": "customer"},
    {"first_name": "Jean",         "last_name": "",                "phone": "+15149289227", "notes": "705 Rue la Bruyère, Laval, H7H 1X2, Canada",           "status": "customer"},
    {"first_name": "David",        "last_name": "",                "phone": "+18198205096", "notes": "8180 Rue des Bungalows, Laval, H7H 1X4, Canada",       "status": "customer"},
    {"first_name": "Arman",        "last_name": "Puzantyan",       "phone": "+15142368223", "notes": "5850 Boul des Rossignols, Laval, Canada",              "status": "customer"},
    {"first_name": "Jean",         "last_name": "Lortie",          "phone": "+15142321088", "email": "lortiejj@gmail.com",              "notes": "2311 rue de Prague, Laval, Canada",   "status": "customer"},
    {"first_name": "Marie-Claude", "last_name": "Lemonde",         "phone": "+15149450536", "notes": "2400 Rue du Passerin, Laval, QC H7L 6G7, Canada",     "status": "customer"},
]

print(f"\nImporting {len(contacts_data)} contacts...")
contact_id_map = {}  # name -> id

for c in contacts_data:
    payload = {k: v for k, v in c.items() if v != ""}
    result = post("/contacts/", payload, TOKEN)
    key = f"{c['first_name']} {c.get('last_name', '')}".strip()
    contact_id_map[key] = result["id"]
    print(f"  OK {key} (id={result['id']})")


# ── 3. Scheduled appointments as activities ────────────────────────────────────
appointments = [
    {"contact": "Prateek Sur",        "date": "2026-04-04T10:00:00", "duration": 180, "price": "CA$300.00"},
    {"contact": "Mark Fernandes",     "date": "2026-04-06T11:00:00", "duration": 180, "price": None},
    {"contact": "Chris Stamires",     "date": "2026-04-11T10:00:00", "duration": 180, "price": None},
    {"contact": "Amina Chellai",      "date": "2026-04-11T14:00:00", "duration": None, "price": "CA$350.00"},
    {"contact": "David",              "date": "2026-04-19T09:00:00", "duration": None, "price": "CA$350.00"},
    {"contact": "Francois Giroux",    "date": "2026-04-20T09:00:00", "duration": None, "price": "CA$400.01"},
    {"contact": "Raynald Langlois",   "date": "2026-04-21T10:00:00", "duration": None, "price": "CA$500.00"},
    {"contact": "Jean",               "date": "2026-04-22T09:00:00", "duration": None, "price": "CA$350.00"},
    {"contact": "Jean Lortie",        "date": "2026-04-23T09:00:00", "duration": None, "price": "CA$315.00"},
    {"contact": "Chrystian",          "date": "2026-04-24T09:00:00", "duration": None, "price": None},
    {"contact": "Louis Philipe Giguere", "date": "2026-04-25T09:00:00", "duration": None, "price": None},
    {"contact": "Alain Poirier",      "date": "2026-04-25T12:00:00", "duration": None, "price": None},
    {"contact": "Tammy Zacard",       "date": "2026-04-25T15:00:00", "duration": None, "price": None},
    {"contact": "Vincent Bernier",    "date": "2026-04-26T14:00:00", "duration": None, "price": None},
]

print(f"\nImporting {len(appointments)} scheduled appointments as activities...")

for appt in appointments:
    contact_name = appt["contact"]
    contact_id = contact_id_map.get(contact_name)
    if not contact_id:
        print(f"  WARNCould not find contact: {contact_name}")
        continue

    desc_parts = []
    if appt["duration"]:
        desc_parts.append(f"Duration: {appt['duration']} min")
    if appt["price"]:
        desc_parts.append(f"Price: {appt['price']}")

    payload = {
        "type": "meeting",
        "title": f"Window cleaning appointment",
        "description": " | ".join(desc_parts) if desc_parts else None,
        "contact_id": contact_id,
        "due_date": appt["date"],
        "completed": False,
    }
    payload = {k: v for k, v in payload.items() if v is not None}
    result = post("/activities/", payload, TOKEN)
    print(f"  OK {contact_name} -> {appt['date']} (id={result['id']})")

print("\nDONE: Migration complete!")
