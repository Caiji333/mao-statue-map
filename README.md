# 全国教员雕像点位地图

基于 React 18、TypeScript、Tailwind CSS 和 MapLibre GL JS 的地图应用。点位数据来自 `public/statues.geojson` 与 PocketBase 协作库，支持聚合、模糊搜索、省份筛选和详情查看。登录、贡献与审核由 PocketBase 提供。

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

当前 GeoJSON 包含原始示范数据和高德地图 Web 服务检索候选。高德新增点位带有 `verificationStatus: "amap_unverified"`，页面会显示“待人工核验”，正式发布前需要结合现场信息和权威来源逐条确认。所有坐标字段必须为 GCJ-02 数字坐标；格式不合法或超出中国范围的点位会在加载时自动过滤。PocketBase 中的 `statues` 会与本地 GeoJSON 合并展示。

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

## 登录、贡献与审核

协作功能使用 PocketBase。未配置时游客地图仍可正常浏览，但登录和贡献功能不会启用。

1. 部署 PocketBase，创建超级管理员。
2. 在 `.env.local` 配置服务地址：

```env
VITE_POCKETBASE_URL=https://your-pocketbase-host
```

3. 运行 `npm run migrate:pocketbase` 导入点位。迁移用户和投稿时请额外提供 Supabase `service_role` 密钥（见 `scripts/migrate-supabase-to-pocketbase.mjs` 头部注释）。
4. 在 PocketBase 后台把需要的账号 `role` 设为 `admin`，即可使用应用内审核工作台。

权限与审核规则：

- 游客只能查看已经发布的点位。
- 登录用户可以提交新点位和修改建议，并查看自己的审核状态。
- 管理员可以通过或驳回；通过后公开地图立即读取更新。
- 新点位与已发布或待审核点位相距 50 米以内时，前端会拒绝重复提交。
- 每个账号每天最多提交 5 次、上传 5 张图片；单张图片最大 5MB，仅允许 JPG、PNG、WebP。
- 当前前端使用邮箱 + 密码注册/登录。
- 管理员工作台的用户管理支持按邮箱/用户名搜索，并可将账号密码重置为 `mao123456`；重置前会再次弹窗确认。
- 点位之间切换使用保持当前缩放级别的平滑移动；聚合数字点击后会同步展示该聚合内的全部点位列表。
- 新投稿会在提交前查询 50 米内的待审核投稿并展示只读详情；附近存在待审核投稿时仍会阻止重复提交。
- 电脑端可在地图空白处右键选择坐标并进入贡献表单；新增表单也支持解析包含坐标的高德官方分享链接（短链受浏览器跨域限制时，请改贴含坐标的长链接）。
- 管理员投稿审核支持待审核、已审核记录切换；记录按提交时间倒序排列，每页展示 10 条。
- 注册账号需要填写用户名；已审核记录展示审核时间和审核管理员，旧账号未设置用户名时回退显示邮箱。
- 点位详情、待审核投稿和审核记录中的图片均可点击放大查看原图。

本地 GeoJSON 修改后运行 `npm run migrate:pocketbase`，可增量同步到 PocketBase。

PocketBase 集合：

| 集合 | 用途 |
|---|---|
| `users` | 邮箱登录、用户名、`role`（user/admin） |
| `statues` | 已公开点位 |
| `contributions` | 投稿与审核记录 |
