#!/usr/bin/env python3
# 全国毛主席雕像清单 → 高德多路搜索 → 去重打分 → GeoJSON / PocketBase
import json, math, re, time, urllib.parse, urllib.request
from pathlib import Path

KEY = "b3043716946c14480adee0574f4df888"
SRC = Path(r"C:\Users\deqia\Desktop\【全国各地毛主席雕像位置清单】.txt")
OUT_DIR = Path("data")
GEOJSON = Path("public/statues.geojson")
PB_URL = "https://www.u2463609.nyat.app:25649"
PB_EMAIL = "deqiangli23@gmail.com"
PB_PASSWORD = "dqdq6666"
SLEEP = 0.35

PROVINCES = {
    "北京","天津","上海","重庆","河北","山西","辽宁","吉林","黑龙江","江苏","浙江","安徽",
    "福建","江西","山东","河南","湖北","湖南","广东","海南","四川","贵州","云南","陕西",
    "甘肃","青海","台湾","内蒙古","广西","西藏","宁夏","新疆","香港","澳门",
}

Mao = re.compile(r"(毛|澤東|泽东|主席|毛泽东)")
Statue = re.compile(r"(像|塑|雕|铜|石像|塑像|雕像|雕塑|纪念像)")

def http_get(url):
    with urllib.request.urlopen(url, timeout=25) as r:
        return json.loads(r.read().decode("utf-8"))

def parse_list(text):
    items = []
    province = ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("【"):
            continue
        if line in PROVINCES and len(line) <= 5:
            province = line
            continue
        items.append({"province": province, "raw": line})
    return items

def norm_key(s):
    s = re.sub(r"\s+", "", s)
    s = re.sub(r"[省市区县]", "", s)
    return s

def dist_m(lng1, lat1, lng2, lat2):
    x = (lng2 - lng1) * 111320 * math.cos(math.radians((lat1 + lat2) / 2))
    y = (lat2 - lat1) * 110540
    return math.hypot(x, y)

def city_hint(province, raw):
    m = re.match(r"^(.{2,10}?市)", raw)
    return m.group(1) if m else province or raw[:6]

def amap_place(keywords, city=""):
    params = {"keywords": keywords, "key": KEY, "offset": 5, "page": 1, "extensions": "all"}
    if city:
        params["city"] = city
        params["citylimit"] = "true"
    url = "https://restapi.amap.com/v3/place/text?" + urllib.parse.urlencode(params)
    d = http_get(url)
    if d.get("status") != "1":
        return []
    out = []
    for p in d.get("pois") or []:
        loc = p.get("location") or ""
        try:
            lng, lat = map(float, loc.split(","))
        except Exception:
            continue
        out.append({
            "name": p.get("name") or "",
            "lng": lng,
            "lat": lat,
            "address": p.get("address") or "",
            "pname": p.get("pname") or "",
            "cityname": p.get("cityname") or "",
            "adname": p.get("adname") or "",
        })
    return out

def amap_geocode(address, city=""):
    params = {"address": address, "key": KEY}
    if city:
        params["city"] = city
    url = "https://restapi.amap.com/v3/geocode/geo?" + urllib.parse.urlencode(params)
    d = http_get(url)
    if d.get("status") != "1":
        return None
    geos = d.get("geocodes") or []
    if not geos:
        return None
    g = geos[0]
    try:
        lng, lat = map(float, str(g.get("location")).split(","))
    except Exception:
        return None
    return {
        "name": g.get("formatted_address") or address,
        "lng": lng,
        "lat": lat,
        "address": g.get("formatted_address") or address,
        "level": g.get("level") or "",
    }

def score_result(raw, province, hit, kind):
    text = raw
    name = hit.get("name") or ""
    addr = hit.get("address") or hit.get("name") or ""
    s = 0
    if Mao.search(name) and Statue.search(name):
        s += 50
    elif Mao.search(name):
        s += 30
    elif Mao.search(addr):
        s += 15
    if kind == "poi_mao":
        s += 25
    elif kind == "poi_place":
        s += 15
    elif kind == "geocode":
        s += 8
    tokens = [t for t in re.split(r"[市省区县路街道镇乡村]", raw) if len(t) >= 2]
    joined = name + addr
    if any(t in joined for t in tokens):
        s += 15
    if province and (province in (hit.get("pname") or "") or province in joined):
        s += 10
    if hit.get("level") in ("门牌号", "兴趣点", "公交站", "POI"):
        s += 5
    return s

def confidence(score):
    if score >= 55:
        return "A"
    if score >= 35:
        return "B"
    return "C"

def main():
    text = SRC.read_text(encoding="utf-8")
    parsed = parse_list(text)
    # 文本去重
    seen = set()
    rows = []
    for it in parsed:
        k = norm_key(it["raw"])
        if not k or k in seen:
            continue
        seen.add(k)
        rows.append(it)
    print(f"parsed={len(parsed)} unique={len(rows)}")

    results = []
    for i, row in enumerate(rows, 1):
        raw = row["raw"]
        province = row["province"]
        city = city_hint(province, raw)
        rec = {"province": province, "raw": raw, "city": city, "hits": [], "best": None, "score": 0, "conf": "C", "kind": ""}

        strategies = []
        # 1) 名称含雕像关键词 + 地名
        strategies.append(("poi_mao", f"毛泽东雕像 {raw}", city))
        strategies.append(("poi_mao", f"毛主席塑像 {raw}", city))
        # 2) 地名专名
        strategies.append(("poi_place", raw, city))
        strategies.append(("poi_place", raw.replace("内", "").replace("门口", ""), city))

        hits = []
        for kind, kw, c in strategies:
            try:
                found = amap_place(kw, c)
            except Exception as e:
                found = []
            time.sleep(SLEEP)
            for f in found:
                f["kind"] = kind
                f["score"] = score_result(raw, province, f, kind)
                hits.append(f)
            if len(hits) >= 6:
                break

        # 3) geocode
        try:
            g = amap_geocode(raw, city if "市" in raw else province)
        except Exception:
            g = None
        time.sleep(SLEEP)
        if g:
            g["kind"] = "geocode"
            g["score"] = score_result(raw, province, g, "geocode")
            hits.append(g)

        # 4) 附近再搜雕像（用 geocode 中心）
        if g and len(hits) < 2:
            try:
                around = amap_place(f"毛泽东雕像", city)
                for f in around[:3]:
                    d = dist_m(g["lng"], g["lat"], f["lng"], f["lat"])
                    if d <= 2500:
                        f = dict(f)
                        f["kind"] = "poi_near"
                        f["score"] = score_result(raw, province, f, "poi_mao") - (10 if d > 400 else 0)
                        hits.append(f)
            except Exception:
                pass
            time.sleep(SLEEP)

        hits.sort(key=lambda x: x.get("score", 0), reverse=True)
        rec["hits"] = hits[:5]
        rec["best"] = hits[0] if hits else None
        rec["score"] = hits[0].get("score", 0) if hits else 0
        rec["conf"] = confidence(rec["score"])
        rec["kind"] = hits[0].get("kind") if hits else "none"
        results.append(rec)
        if i % 20 == 0:
            print(f"  ... {i}/{len(rows)}")

    # 空间去重（与本批更高分合并）
    kept = []
    for rec in sorted(results, key=lambda r: -r["score"]):
        b = rec.get("best")
        if not b:
            kept.append(rec)
            continue
        dup = False
        for k in kept:
            kb = k.get("best")
            if kb and dist_m(b["lng"], b["lat"], kb["lng"], kb["lat"]) <= 50:
                rec["merged_into"] = k["raw"]
                rec["conf"] = "DUP"
                dup = True
                break
        if not dup:
            kept.append(rec)
        else:
            results[:] = [r if r is not rec else rec for r in results]

    OUT_DIR.mkdir(exist_ok=True)
    out = {
        "total_rows": len(rows),
        "with_coord": sum(1 for r in results if r.get("best")),
        "confA": sum(1 for r in results if r.get("conf") == "A"),
        "confB": sum(1 for r in results if r.get("conf") == "B"),
        "confC": sum(1 for r in results if r.get("conf") == "C"),
        "dups": sum(1 for r in results if r.get("conf") == "DUP"),
        "items": results,
    }
    (OUT_DIR / "import-candidates.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("summary", {k: out[k] for k in out if k != "items"})

    # 生成可入库（A+B，排除 DUP）
    publish = [r for r in results if r.get("best") and r.get("conf") in ("A", "B")]
    (OUT_DIR / "import-ready.json").write_text(
        json.dumps(publish, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("ready", len(publish))

if __name__ == "__main__":
    main()
