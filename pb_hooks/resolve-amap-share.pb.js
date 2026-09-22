/// <reference path="../pb_data/main/types.d.ts" />
// 高德分享短链解析（服务端跟随跳转，无 CORS）
// 部署：放到 PocketBase 根目录的 pb_hooks/ 下，然后重启 PocketBase。

routerAdd("POST", "/api/resolve-amap-share", (e) => {
  if (!e.auth) {
    return e.json(401, { error: "请先登录后再解析高德分享链接" });
  }

  const allowedHosts = new Set([
    "surl.amap.com",
    "wb.amap.com",
    "uri.amap.com",
    "www.amap.com",
    "amap.com",
  ]);

  const inChina = (longitude, latitude) =>
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= 73 &&
    longitude <= 136 &&
    latitude >= 3 &&
    latitude <= 54;

  const extractLocation = (url) => {
    const query = url.searchParams.get("q");
    if (query) {
      const [latitudeText, longitudeText, ...nameParts] = query.split(",");
      const latitude = Number(latitudeText);
      const longitude = Number(longitudeText);
      if (inChina(longitude, latitude)) {
        return { longitude, latitude, name: nameParts.join(",").trim() };
      }
    }
    const position = url.searchParams.get("position");
    if (position) {
      const [longitudeText, latitudeText] = position.split(",");
      const longitude = Number(longitudeText);
      const latitude = Number(latitudeText);
      if (inChina(longitude, latitude)) {
        return { longitude, latitude, name: "" };
      }
    }
    return null;
  };

  let input = "";
  try {
    const body = e.requestInfo().body || {};
    input = String(body.url || body.text || "");
  } catch (_) {}

  const match = String(input).match(
    /https:\/\/(?:surl\.amap\.com|wb\.amap\.com|uri\.amap\.com|www\.amap\.com|amap\.com)\/[^\s<>\]）)，。]+/i
  );
  if (!match) {
    return e.json(400, { error: "invalid amap url" });
  }

  try {
    let current = new URL(match[0]);
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      if (current.protocol !== "https:" || !allowedHosts.has(current.hostname.toLowerCase())) {
        return e.json(400, { error: "仅支持高德地图官方分享链接" });
      }

      const hit = extractLocation(current);
      if (hit) return e.json(200, hit);

      const res = $http.send({
        url: current.toString(),
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        timeout: 15,
      });

      const locationHeader =
        (res.headers && (res.headers["Location"] || res.headers["location"])) || "";
      const next = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;

      if (next) {
        current = new URL(String(next), current);
        if (current.protocol === "http:") current.protocol = "https:";
        continue;
      }

      const bodyText = String(res.body || "");
      const pos =
        bodyText.match(/position=([\d.]+),([\d.]+)/i) ||
        bodyText.match(/"longitude"\s*:\s*([\d.]+)[\s\S]*?"latitude"\s*:\s*([\d.]+)/i);
      if (pos) {
        const longitude = Number(pos[1]);
        const latitude = Number(pos[2]);
        if (inChina(longitude, latitude)) {
          return e.json(200, { longitude, latitude, name: "" });
        }
      }
      break;
    }
  } catch (err) {
    return e.json(400, { error: "高德分享链接格式不正确" });
  }

  return e.json(422, { error: "该分享链接中未找到有效坐标" });
});
