/// <reference path="../pb_data/main/types.d.ts" />
// 高德分享短链解析（生产用）
// 原理：跟跳转拿最终 URL，从中解析 q=纬度,经度 / lat&lon / position=
// 已验证：surl.amap.com/xxx → 最终含 q=31.96...,118.71...,名称

routerAdd("POST", "/api/resolve-amap-share", (e) => {
  if (!e.auth) {
    return e.json(401, { error: "请先登录后再解析高德分享链接" });
  }

  function inChina(lng, lat) {
    return (
      typeof lng === "number" &&
      typeof lat === "number" &&
      isFinite(lng) &&
      isFinite(lat) &&
      lng >= 73 &&
      lng <= 136 &&
      lat >= 3 &&
      lat <= 54
    );
  }

  function decode(value) {
    try {
      return decodeURIComponent(String(value || "").replace(/\+/g, " "));
    } catch (_) {
      return String(value || "");
    }
  }

  function parseQuery(raw) {
    const text = String(raw || "");
    const qIndex = text.indexOf("?");
    const hashIndex = text.indexOf("#");
    let qs = "";
    if (qIndex >= 0) {
      qs = text.slice(qIndex + 1);
      if (hashIndex > qIndex) qs = qs.slice(0, hashIndex - qIndex - 1);
    } else if (hashIndex >= 0) {
      qs = text.slice(hashIndex + 1);
    }
    const out = {};
    const pairs = qs.split("&");
    for (let i = 0; i < pairs.length; i++) {
      const eq = pairs[i].indexOf("=");
      if (eq <= 0) continue;
      out[decode(pairs[i].slice(0, eq))] = decode(pairs[i].slice(eq + 1));
    }
    return out;
  }

  function makeHit(lng, lat, name) {
    return { longitude: lng, latitude: lat, name: name || "" };
  }

  // q=纬度,经度,名称 | position=经度,纬度 | lat=&lon=
  function extractLocation(raw) {
    const text = String(raw || "");
    const query = parseQuery(text);

    if (query.q) {
      const parts = String(query.q).split(",");
      if (parts.length >= 2) {
        const lat = Number(parts[0]);
        const lng = Number(parts[1]);
        if (inChina(lng, lat)) return makeHit(lng, lat, parts.slice(2).join(",").trim());
      }
    }
    if (query.position) {
      const parts = String(query.position).split(",");
      const lng = Number(parts[0]);
      const lat = Number(parts[1]);
      if (inChina(lng, lat)) return makeHit(lng, lat, query.name || "");
    }
    const lat = Number(query.lat !== undefined ? query.lat : query.latitude);
    const lng = Number(
      query.lon !== undefined ? query.lon : query.lng !== undefined ? query.lng : query.longitude
    );
    if (inChina(lng, lat)) return makeHit(lng, lat, query.poiname || query.name || "");

    const mQ = text.match(/q=([\d.]+)[%2C,]+([\d.]+)/i);
    if (mQ) {
      const lat2 = Number(mQ[1]);
      const lng2 = Number(mQ[2]);
      if (inChina(lng2, lat2)) return makeHit(lng2, lat2, "");
    }
    const mPos = text.match(/position=([\d.]+),([\d.]+)/i);
    if (mPos) {
      const lng2 = Number(mPos[1]);
      const lat2 = Number(mPos[2]);
      if (inChina(lng2, lat2)) return makeHit(lng2, lat2, "");
    }
    const mLat = text.match(/lat=([\d.]+)/i);
    const mLon = text.match(/lon=([\d.]+)/i) || text.match(/lng=([\d.]+)/i);
    if (mLat && mLon) {
      const lat2 = Number(mLat[1]);
      const lng2 = Number(mLon[1]);
      if (inChina(lng2, lat2)) return makeHit(lng2, lat2, "");
    }
    return null;
  }

  function headerGet(headers, name) {
    if (!headers) return "";
    const lower = name.toLowerCase();
    if (typeof headers.get === "function") {
      const v = headers.get(name) || headers.get(lower);
      if (v) return String(Array.isArray(v) ? v[0] : v);
    }
    for (const key in headers) {
      if (String(key).toLowerCase() === lower) {
        const v = headers[key];
        return String(Array.isArray(v) ? v[0] : v);
      }
    }
    return "";
  }

  // 跟跳转拿最终 URL（curl -L -w %{url_effective}）
  function curlFinalUrl(rawUrl) {
    const execs = [];
    if (typeof $os !== "undefined" && $os && typeof $os.exec === "function") execs.push($os.exec);
    if (typeof os !== "undefined" && os && typeof os.exec === "function") execs.push(os.exec);
    for (let i = 0; i < execs.length; i++) {
      try {
        const result = execs[i]("curl", [
          "-sL",
          "-o",
          "/dev/null",
          "-w",
          "%{url_effective}",
          "--max-redirs",
          "8",
          "-A",
          "Mozilla/5.0 (compatible; statue-map/1.0)",
          rawUrl,
        ]);
        const out = result && (result.stdout || result.out || result.output || result);
        const text = typeof out === "string" ? out : String((out && out.stdout) || "");
        if (/^https?:\/\//i.test(text.trim())) return text.trim();
      } catch (_) {}
    }
    return "";
  }

  function httpGet(rawUrl) {
    if (typeof $http === "undefined" || !$http || typeof $http.send !== "function") {
      return null;
    }
    try {
      const res = $http.send({
        url: rawUrl,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; statue-map/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
        timeout: 15,
      });
      const headers = res.headers || {};
      return {
        location: headerGet(headers, "Location"),
        body: String(res.body || ""),
        status: res.statusCode || res.status || 0,
      };
    } catch (_) {
      return null;
    }
  }

  let input = "";
  try {
    const body = e.requestInfo().body || {};
    input = String(body.url || body.text || "");
  } catch (err) {
    return e.json(400, { error: "读取请求失败: " + String(err) });
  }

  const early = extractLocation(input);
  if (early) return e.json(200, early);

  const match = String(input).match(
    /https:\/\/(?:surl\.amap\.com|wb\.amap\.com|m\.amap\.com|uri\.amap\.com|www\.amap\.com|amap\.com)\/[^\s<>\]）)，。]+/i
  );
  if (!match) {
    return e.json(400, { error: "invalid amap url" });
  }

  const start = match[0].replace(/^http:\/\//i, "https://");
  const trail = [];

  try {
    // 1) curl 跟跳转拿最终 URL（已对真实短链验证含坐标）
    const finalUrl = curlFinalUrl(start);
    trail.push("curlFinal=" + finalUrl.slice(0, 200));
    const finalHit = extractLocation(finalUrl);
    if (finalHit) return e.json(200, finalHit);

    // 2) $http：读 Location / 正文
    const res = httpGet(start);
    if (res) {
      trail.push("http status=" + res.status + " loc=" + String(res.location).slice(0, 120));
      const locHit = extractLocation(res.location);
      if (locHit) return e.json(200, locHit);
      const bodyHit = extractLocation(res.body) || extractLocation(String(res.body).slice(0, 4000));
      if (bodyHit) return e.json(200, bodyHit);
    }
  } catch (err) {
    return e.json(400, { error: "解析短链失败: " + String(err), trail: trail });
  }

  return e.json(422, {
    error: "该分享链接中未找到有效坐标",
    trail: trail,
  });
});
