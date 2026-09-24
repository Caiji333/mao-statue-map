#!/usr/bin/env python3
import json, math, urllib.request
from pathlib import Path

GEOJSON = Path("public/statues.geojson")
PB = "https://www.u2463609.nyat.app:25649"
ready = json.loads(Path("data/import-ready.json").read_text(encoding="utf-8"))

def dist_m(lng1, lat1, lng2, lat2):
    x = (lng2 - lng1) * 111320 * math.cos(math.radians((lat1 + lat2) / 2))
    y = (lat2 - lat1) * 110540
    return math.hypot(x, y)

existing = json.loads(GEOJSON.read_text(encoding="utf-8"))
exist_pts = [(f["geometry"]["coordinates"][0], f["geometry"]["coordinates"][1], f["properties"].get("name", "")) for f in existing["features"]]
exist_ext = {f["properties"].get("id") for f in existing["features"]}

new_features = []
skipped_exist = 0
for i, rec in enumerate(ready, 1):
    b = rec["best"]
    lng, lat = b["lng"], b["lat"]
    name = (b.get("name") or rec["raw"])[:80]
    if any(dist_m(lng, lat, elng, elat) <= 50 for elng, elat, _ in exist_pts):
        skipped_exist += 1
        rec["skip"] = "near_existing"
        continue
    ext = f"list-{i:04d}"
    while ext in exist_ext:
        i += 1
        ext = f"list-{i:04d}"
    exist_ext.add(ext)
    exist_pts.append((lng, lat, name))
    feat = {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lng, lat]},
        "properties": {
            "id": ext,
            "name": name,
            "province": (rec.get("province") or b.get("pname") or "")[:30],
            "city": (rec.get("city") or b.get("cityname") or rec.get("city") or "")[:30],
            "address": (b.get("address") or rec["raw"])[:160],
            "desc": f"来源：全国雕像清单。原文：{rec['raw']}",
            "source": "全国雕像清单导入",
            "verificationStatus": "amap_unverified",
            "contributors": [],
        },
    }
    rec["external_id"] = ext
    new_features.append((feat, rec))

existing["features"].extend(f for f, _ in new_features)
GEOJSON.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"geojson +{len(new_features)} skip_exist={skipped_exist} total={len(existing['features'])}")

def pb(method, path, token, body=None):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(PB + "/api" + path, data=data, method=method, headers={
        "Content-Type": "application/json; charset=utf-8",
        **({"Authorization": token} if token else {}),
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        return json.loads(raw) if raw else {}

auth = pb("POST", "/collections/_superusers/auth-with-password", None, {
    "identity": "deqiangli23@gmail.com", "password": "dqdq6666"
})
token = auth["token"]
lst = pb("GET", "/collections/statues/records?perPage=500", token)
by_ext = {it.get("external_id"): it["id"] for it in lst.get("items", []) if it.get("external_id")}
pb_created = pb_updated = pb_fail = 0
for feat, rec in new_features:
    p = feat["properties"]
    body = {
        "external_id": p["id"],
        "name": p["name"],
        "province": p["province"],
        "city": p["city"],
        "address": p["address"],
        "longitude": feat["geometry"]["coordinates"][0],
        "latitude": feat["geometry"]["coordinates"][1],
        "desc": p["desc"],
        "source": p["source"],
        "verification_status": "amap_unverified",
        "status": "approved",
        "contributor_names": [],
    }
    try:
        if p["id"] in by_ext:
            pb("PATCH", f"/collections/statues/records/{by_ext[p['id']]}", token, body)
            pb_updated += 1
        else:
            made = pb("POST", "/collections/statues/records", token, body)
            by_ext[p["id"]] = made["id"]
            pb_created += 1
    except Exception as e:
        pb_fail += 1
        if pb_fail <= 3:
            print("pb fail", p["name"], e)

Path("data/import-ready.json").write_text(json.dumps([r for _, r in new_features], ensure_ascii=False, indent=2), encoding="utf-8")
print(f"pocketbase created={pb_created} updated={pb_updated} fail={pb_fail}")
print("DONE")
