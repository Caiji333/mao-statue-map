#!/usr/bin/env python3
"""从高德 POI 图片为无图点位补雕塑图（严格过滤非雕像 POI）。"""
import json
import math
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

KEY = "b3043716946c14480adee0574f4df888"
GEOJSON = Path("public/statues.geojson")
IMG_DIR = Path("public/images")
PB = "https://www.u2463609.nyat.app:25649"
SLEEP = 0.4

MAO = re.compile(r"(毛泽东|毛主席|毛)")
STATUE = re.compile(r"(雕像|塑像|雕塑|铜像|石像|像|塑|雕)")
BAD = re.compile(r"(站|寄存|展馆|商店|餐厅|厕所|公交|地铁|停车|酒店|宾馆|医院|银行)")


def http_json(url):
    with urllib.request.urlopen(url, timeout=25) as r:
        return json.loads(r.read().decode("utf-8"))


def dist_m(lng1, lat1, lng2, lat2):
    x = (lng2 - lng1) * 111320 * math.cos(math.radians((lat1 + lat2) / 2))
    y = (lat2 - lat1) * 110540
    return math.hypot(x, y)


def is_statue_poi(name: str) -> bool:
    n = name or ""
    if BAD.search(n) and not STATUE.search(n):
        return False
    return bool(MAO.search(n) and STATUE.search(n))


def search_pois(lng, lat, name, city=""):
    kws = [
        f"{name} 雕像",
        f"{name} 塑像",
        "毛泽东雕像",
        "毛主席塑像",
    ]
    found = []
    for kw in kws:
        params = {
            "keywords": kw,
            "key": KEY,
            "location": f"{lng},{lat}",
            "radius": 3000,
            "offset": 5,
            "extensions": "all",
        }
        url = "https://restapi.amap.com/v3/place/around?" + urllib.parse.urlencode(params)
        try:
            d = http_json(url)
        except Exception:
            d = {}
        time.sleep(SLEEP)
        if d.get("status") != "1":
            continue
        for p in d.get("pois") or []:
            pn = p.get("name") or ""
            if not is_statue_poi(pn):
                continue
            loc = p.get("location") or ""
            try:
                plng, plat = map(float, loc.split(","))
            except Exception:
                continue
            if dist_m(lng, lat, plng, plat) > 2500:
                continue
            photos = []
            for ph in p.get("photos") or []:
                u = ph.get("url") if isinstance(ph, dict) else None
                if u:
                    photos.append(u)
            if not photos and p.get("id"):
                try:
                    det = http_json(
                        "https://restapi.amap.com/v3/place/detail?"
                        + urllib.parse.urlencode({"id": p["id"], "key": KEY, "extensions": "all"})
                    )
                    time.sleep(SLEEP)
                    for item in det.get("pois") or []:
                        for ph in item.get("photos") or []:
                            u = ph.get("url") if isinstance(ph, dict) else None
                            if u:
                                photos.append(u)
                except Exception:
                    pass
            found.append({"name": pn, "lng": plng, "lat": plat, "photos": photos, "poi_id": p.get("id")})
        if found:
            break
    found.sort(key=lambda x: dist_m(lng, lat, x["lng"], x["lat"]))
    return found


def download(url, dest: Path):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 statue-map"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    if len(data) < 2000:
        raise RuntimeError("image too small")
    dest.write_bytes(data)


def pb(method, path, token, body=None):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        PB + "/api" + path,
        data=data,
        method=method,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            **({"Authorization": token} if token else {}),
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        return json.loads(raw) if raw else {}


def main():
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    gj = json.loads(GEOJSON.read_text(encoding="utf-8"))
    need = [f for f in gj["features"] if not (f.get("properties") or {}).get("image")]
    print("need image", len(need), "of", len(gj["features"]))

    attached = 0
    no_statue = 0
    no_photo = 0
    fail = 0
    report = []

    for i, feat in enumerate(need, 1):
        props = feat["properties"]
        lng, lat = feat["geometry"]["coordinates"]
        name = props.get("name") or ""
        cands = search_pois(lng, lat, name)
        if not cands:
            no_statue += 1
            report.append({"id": props.get("id"), "name": name, "status": "no_statue_poi"})
            continue
        best = cands[0]
        if not best.get("photos"):
            no_photo += 1
            report.append({"id": props.get("id"), "name": name, "status": "statue_no_photo", "poi": best["name"]})
            continue
        fname = f"{props.get('id') or i}-amap-1.jpg"
        dest = IMG_DIR / fname
        ok = False
        for photo_url in best["photos"][:3]:
            try:
                download(photo_url if photo_url.startswith("http") else "https:" + photo_url, dest)
                ok = True
                break
            except Exception:
                continue
        if not ok:
            fail += 1
            report.append({"id": props.get("id"), "name": name, "status": "download_fail", "poi": best["name"]})
            continue
        rel = f"images/{fname}"
        props["image"] = rel
        props["image_source"] = f"高德POI:{best['name']}"
        props["image_poi"] = best["poi_id"]
        attached += 1
        report.append({"id": props.get("id"), "name": name, "status": "ok", "poi": best["name"], "file": rel})
        if i % 20 == 0:
            print(f"  ... {i}/{len(need)} attached={attached}")

    GEOJSON.write_text(json.dumps(gj, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"attached={attached} no_statue={no_statue} no_photo={no_photo} fail={fail}")

    # PB sync for attached
    auth = pb("POST", "/collections/_superusers/auth-with-password", None, {
        "identity": "deqiangli23@gmail.com", "password": "dqdq6666"
    })
    token = auth["token"]
    lst = pb("GET", "/collections/statues/records?perPage=500", token)
    by_ext = {it.get("external_id"): it for it in lst.get("items", []) if it.get("external_id")}
    pb_ok = pb_fail = 0
    for feat in gj["features"]:
        props = feat["properties"]
        if not props.get("image") or props.get("image_source") != props.get("image_source"):
            pass
        if not str(props.get("image_source") or "").startswith("高德POI"):
            continue
        rec = by_ext.get(props.get("id"))
        if not rec:
            continue
        try:
            pb("PATCH", f"/collections/statues/records/{rec['id']}", token, {
                "image_url": props.get("image"),
                "source": (props.get("source") or "") + " | 图片:" + str(props.get("image_source") or ""),
            })
            pb_ok += 1
        except Exception as e:
            pb_fail += 1
            if pb_fail <= 3:
                print("pb", e)
    print(f"pocketbase image_url updated={pb_ok} fail={pb_fail}")

    Path("data/image-import-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("DONE")


if __name__ == "__main__":
    main()
