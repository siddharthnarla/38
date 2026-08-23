"""
NPI Workforce Check — The 38 Initiative
Runs weekly via GitHub Actions. Queries the CMS NPI registry for
gastroenterologists in Washington State, diffs against the verified
tier dataset in counties.json, and appends flagged changes to changelog.json.

NPI is used as a TRIP-WIRE only. It flags potential changes for manual
review. Tiers in counties.json are only updated by a human after
verification, because NPI systematically undercounts rural GIs through
hospital-owned clinic billing, circuit specialists, and critical-access
hospitals (see white paper methodology).
"""

import json, requests, datetime, os

def load_counties():
    with open("counties.json") as f:
        return json.load(f)

def query_npi(county_name, state="WA"):
    url = "https://npiregistry.cms.hhs.gov/api/"
    params = {
        "version": "2.1",
        "taxonomy_description": "Gastroenterology",
        "state": state,
        "limit": 200,
    }
    try:
        r = requests.get(url, params=params, timeout=20)
        r.raise_for_status()
        results = r.json().get("results", [])
        # filter to this county by address
        hits = []
        for p in results:
            for addr in p.get("addresses", []):
                if addr.get("state") == state:
                    city = (addr.get("city") or "").lower()
                    hits.append(city)
        return results
    except Exception as e:
        print(f"  NPI query failed: {e}")
        return None

def load_changelog():
    if os.path.exists("changelog.json"):
        with open("changelog.json") as f:
            return json.load(f)
    return {"last_run": None, "npi_counts": {}, "entries": []}

def main():
    today = datetime.date.today().isoformat()
    print(f"NPI workforce check — {today}")

    dataset = load_counties()
    counties = dataset["counties"]
    changelog = load_changelog()
    prev_counts = changelog.get("npi_counts", {})
    new_counts = {}
    new_entries = []

    # One statewide query, then bucket by city
    print("Querying NPI registry for Washington gastroenterologists...")
    all_results = query_npi(None)
    if all_results is None:
        print("NPI unreachable — aborting without changes.")
        return

    # Build city -> count map
    city_counts = {}
    for p in all_results:
        for addr in p.get("addresses", []):
            if addr.get("address_purpose") == "LOCATION" and addr.get("state") == "WA":
                city = (addr.get("city") or "").strip().lower()
                if city:
                    city_counts[city] = city_counts.get(city, 0) + 1

    print(f"Found {len(all_results)} WA gastroenterologist records across {len(city_counts)} cities.\n")

    for fips, d in counties.items():
        town = d["town"].strip().lower()
        count = city_counts.get(town, 0)
        new_counts[fips] = count
        prev = prev_counts.get(fips)

        if prev is not None and count != prev:
            delta = count - prev
            tier = d["tier"]
            if tier == 6 and delta > 0:
                severity, status = "high", "unverified"
                note = (f"NPI registry now lists {count} gastroenterologist record(s) in "
                        f"{d['town']}, {d['name']} County — a verified medical desert. "
                        f"Previously {prev}. Requires manual verification: NPI may be counting "
                        f"a billing address or a visiting provider rather than resident care.")
            elif delta < 0 and tier <= 5:
                severity, status = "moderate", "unverified"
                note = (f"NPI records for {d['town']}, {d['name']} County dropped from {prev} to {count}. "
                        f"County is currently Tier {tier}. If a provider has left, tier may need review.")
            else:
                severity, status = "low", "unverified"
                note = (f"NPI count for {d['name']} County changed from {prev} to {count}. "
                        f"No tier change expected — logged for the record.")

            new_entries.append({
                "date": today, "county": d["name"], "fips": fips,
                "type": "npi_change", "severity": severity,
                "prev_npi": prev, "new_npi": count, "verified_tier": tier,
                "note": note, "status": status
            })
            print(f"  FLAGGED {d['name']}: {prev} -> {count}")

    changelog["last_run"] = today
    changelog["npi_counts"] = new_counts
    if new_entries:
        changelog["entries"] = new_entries + changelog.get("entries", [])
        print(f"\n{len(new_entries)} change(s) flagged for verification.")
    else:
        print("\nNo changes detected since last run.")

    with open("changelog.json", "w") as f:
        json.dump(changelog, f, indent=2)
    print("changelog.json updated.")

if __name__ == "__main__":
    main()
