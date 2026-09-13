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

## 登录、贡献与审核

协作功能使用 Supabase。未配置时游客地图仍可正常浏览，但登录和贡献功能不会启用。

1. 创建 Supabase 项目，在 SQL Editor 中先执行 `supabase/migrations/202609130001_contributions.sql`，再执行 `supabase/seed.sql`。
2. 在 Authentication > URL Configuration 中填写正式站点地址和允许的回调地址。
3. 在 `.env.local` 或部署平台配置 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`。
4. 使用邮箱魔法链接登录一次，从 Authentication > Users 复制用户 UUID。
5. 在 SQL Editor 中执行以下语句，将首个账号设为管理员：

```sql
update public.profiles set role = 'admin' where id = '你的用户UUID';
```

权限与审核规则：

- 游客只能查看已经发布的点位。
- 登录用户可以提交新点位和修改建议，并查看自己的审核状态。
- 管理员可以通过或驳回；通过后公开地图立即读取更新。
- 新点位与已发布或待审核点位相距 50 米以内时，服务端拒绝重复提交。
- 每个账号每天最多提交 5 次、上传 5 张图片；单张图片最大 5MB，仅允许 JPG、PNG、WebP。
- 正式使用邮件登录前，建议在 Supabase 配置自有 SMTP，避免默认邮件服务的低额度限制。

本地 GeoJSON 修改后运行 `npm run seed:supabase`，可重新生成数据库初始化种子文件。
