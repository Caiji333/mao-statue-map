# 全国教员雕像点位地图

基于 React 18、TypeScript、Tailwind CSS 和 MapLibre GL JS 的纯前端地图应用。点位数据来自 `public/statues.geojson`，支持聚合、模糊搜索、省份筛选和详情查看。

## 本地运行

```bash
npm install
copy .env.example .env.local
npm run dev
```

底图按运行环境自动选择：

- `npm run dev` 默认使用免 Key 的高德历史瓦片，便于本地开发预览。
- `npm run build` 默认使用天地图；正式发布前需要配置天地图浏览器端 Key。

如需显式指定，可在 `.env.local` 或部署平台环境变量中配置：

```env
VITE_MAP_PROVIDER=amap_legacy
```

正式环境推荐创建 `.env.production`：

```env
VITE_MAP_PROVIDER=tianditu
VITE_TIANDITU_TOKEN=你的天地图Key
```

天地图浏览器端 Key 可在天地图控制台申请，并应配置允许访问的域名。`amap_legacy` 使用的是非正式高德历史瓦片地址，仅适合开发与个人预览，不建议作为生产服务依赖。天地图未配置 Key 时，应用会使用基础底色展示点位，其他功能仍然可用。

## 数据说明

当前 GeoJSON 包含原始示范数据和高德地图 Web 服务检索候选。高德新增点位带有 `verificationStatus: "amap_unverified"`，页面会显示“待人工核验”，正式发布前需要结合现场信息和权威来源逐条确认。所有坐标字段必须为 GCJ-02 数字坐标；格式不合法或超出中国范围的点位会在加载时自动过滤。

采集结果和审核记录分别保存在：

- `data/amap-poi-candidates.json`：全国关键词检索后的候选 POI 和采集元数据。
- `data/amap-poi-review.json`：疑似重复、明确排除和低可信候选。

需要重新采集时，使用高德“Web 服务”类型 Key，通过进程环境变量传入，不要写入项目文件：

```powershell
$env:AMAP_WEB_SERVICE_KEY='你的Web服务Key'
npm run collect:amap
npm run merge:amap
Remove-Item Env:AMAP_WEB_SERVICE_KEY
```

## 构建

```bash
npm run build
```

Vite 的 `base` 已配置为相对路径，可部署到 GitHub Pages、Vercel、Netlify 或任意静态服务器的二级目录。
