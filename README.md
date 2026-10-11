# 全国教员雕像点位地图

面向公众浏览与协作补充的全国雕像点位地图。前端使用 React、TypeScript、Vite 和 MapLibre GL JS；公开基础点位保存在 GeoJSON，登录、投稿、审核和图片上传由 PocketBase 提供。

## 功能

- 地图聚合、关键字搜索、省份筛选、图片与可信度筛选。
- 点位详情、原图预览、资料修改建议和贡献人展示。
- 登录用户可投稿新点位或补充既有点位资料；新建投稿会做 50 米范围去重。
- 桌面端地图右键、移动端单击空白地图可直接带入坐标发起投稿。
- 支持解析高德地图分享内容，自动填写坐标。
- 管理员可审核投稿、查看位置、管理用户、重置密码和处理待补图/待核验数据。
- 高德检索导入点位使用“高可信 / 待人工核验 / 待补图”等标签区分资料状态。

## 架构

| 层级 | 技术与职责 |
| --- | --- |
| Web 前端 | React 18、TypeScript、Vite、Tailwind CSS、MapLibre GL JS |
| 地图底图 | 默认高德栅格瓦片（GCJ-02）；可选天地图 |
| 公开基础数据 | `public/statues.geojson` 与 `public/images/` |
| 协作数据 | PocketBase：账号、已公开点位、投稿、审核与上传图片 |
| 高德短链解析 | 开发环境使用 Vite 中间件；生产环境使用 `pb_hooks/resolve-amap-share.pb.js` |

运行时不依赖 Supabase。仓库内 `supabase/` 和 `scripts/migrate-supabase-to-pocketbase.mjs` 仅用于历史数据迁移，可在完成迁移后忽略。

## 快速开始

要求：Node.js 20+、npm。仅浏览地图时不需要 PocketBase。

```bash
git clone https://github.com/Caiji333/mao-statue-map.git
cd mao-statue-map
npm install
copy .env.example .env.local
npm run dev
```

默认开发地址为 `http://localhost:5173`。构建生产静态文件：

```bash
npm run build
```

构建输出在 `dist/`。项目使用相对资源路径，可部署到静态服务器或二级目录。

## 前端环境变量

在 `.env.local` 或部署平台的环境变量中配置，文件已被 Git 忽略。

```env
# 地图底图：amap_legacy（默认）或 tianditu
VITE_MAP_PROVIDER=amap_legacy

# 高德 JavaScript/Web 端 Key，用于高德服务解析及控制台统计
VITE_AMAP_KEY=

# 仅在 VITE_MAP_PROVIDER=tianditu 时需要
VITE_TIANDITU_TOKEN=

# PocketBase 公网地址；不配置时网站仅提供游客浏览
VITE_POCKETBASE_URL=https://your-pocketbase-host

# 可管理管理员角色的系统管理员邮箱
VITE_SYSTEM_ADMIN_EMAIL=admin@example.com
```

`VITE_*` 会编译到浏览器代码中，因此只能放允许公开的前端 Key 和服务地址，不能放 PocketBase 超级管理员密码或其他服务端密钥。

## PocketBase 配置

1. 部署 PocketBase 并创建超级管理员。
2. 创建 `users` 认证集合，增加 `username`（文本）和 `role`（单选：`user`、`admin`）字段。
3. 创建 `statues`、`contributions` 两个基础集合，字段以当前应用读写逻辑为准：

| 集合 | 关键字段 |
| --- | --- |
| `users` | `email`、`username`、`role` |
| `statues` | `external_id`、`name`、`province`、`city`、`address`、`longitude`、`latitude`、`desc`、`background`、`year`、`image_url`、`source`、`verification_status`、`status`、`created_by`、`contributor_names` |
| `contributions` | `kind`、`user`、`statue`、`external_id`、点位资料字段、`photo`、`payload`、`status`、`review_comment`、`reviewed_by`、`reviewed_at` |

建议的权限模型：

- `statues`：公开读取；创建和修改仅 `@request.auth.role = 'admin'`。
- `contributions`：登录用户只能创建并查看自己的投稿；管理员可读取、审核、驳回和修改。
- `users`：用户可读取或修改自己；管理员可管理用户。前端还限制只有 `VITE_SYSTEM_ADMIN_EMAIL` 对应账号可以调整其他用户的管理员角色。

4. 将生产短链解析钩子复制到 PocketBase 项目的 `pb_hooks/resolve-amap-share.pb.js`，然后重启 PocketBase。
5. 在前端部署环境设置 `VITE_POCKETBASE_URL`，重新构建并发布静态站点。
6. 在 PocketBase 管理后台将需要审核投稿的账号 `role` 设置为 `admin`。

图片由 PocketBase 的 `contributions.photo` 文件字段保存；公开后的点位保存图片访问地址到 `statues.image_url`。

## 投稿与审核规则

- 游客只能查看公开点位。
- 需要登录后才能提交新点位或修改建议。
- 投稿进入待审核队列；管理员通过后立即写入公开点位数据。
- 新点位在 50 米范围内遇到已公开点位或待审核投稿时会阻止重复提交。
- 每个账号每日最多 5 次投稿和 5 张图片；单张图片不超过 5 MB，仅支持 JPG、PNG、WebP。
- 待审核与已审核列表按时间倒序，每页 10 条；已审核记录显示审核人和审核时间。

## 数据与采集脚本

| 命令或脚本 | 用途 |
| --- | --- |
| `npm run collect:amap` | 通过高德 Web 服务搜索候选 POI，写入 `data/amap-poi-candidates.json` |
| `npm run merge:amap` | 将已确认的候选点位合并进 `public/statues.geojson` |
| `scripts/import_statue_list.py` | 从本地点位清单检索高德候选并导入 PocketBase |
| `scripts/import_ready_to_store.py` | 将准备好的导入记录写入 GeoJSON 和 PocketBase |
| `scripts/fetch_statue_images.py` | 获取高德 POI 图片并同步图片地址 |
| `npm run migrate:pocketbase` | 从历史 Supabase 数据迁移到 PocketBase，一次性工具 |

运行高德采集脚本前，在当前终端设置临时环境变量；不要把 Key 写进代码或 `.env.example`：

```powershell
$env:AMAP_WEB_SERVICE_KEY = 'your-amap-web-service-key'
npm run collect:amap
npm run merge:amap
Remove-Item Env:AMAP_WEB_SERVICE_KEY
```

会访问 PocketBase 超级管理员接口的 Python 脚本还需要：

```powershell
$env:PB_SUPERUSER_EMAIL = 'admin@example.com'
$env:PB_SUPERUSER_PASSWORD = 'your-strong-password'
```

历史迁移脚本还要求显式提供 `PB_URL`、`PB_SUPERUSER_EMAIL`、`PB_SUPERUSER_PASSWORD`。没有本地导出数据时，才额外配置 `SUPABASE_URL` 与相应 Key。

## Linux 开发部署

前端部署为静态站点。服务器中首次执行：

```bash
git clone https://github.com/Caiji333/mao-statue-map.git
cd mao-statue-map
npm install
cp .env.example .env.local
# 编辑 .env.local，填入 VITE_POCKETBASE_URL 和地图配置
npm run build
npx serve dist -l 5173
```

项目附带 `deploy.sh`，用于更新代码、构建并后台启动静态站：

```bash
chmod +x deploy.sh
PORT=5173 bash deploy.sh
```

生产环境建议改用 Nginx/Caddy 托管 `dist/`，并单独以 systemd 或容器运行 PocketBase。静态前端和 PocketBase 需要分别部署与备份。

## 安全说明

- 不要提交 `.env.local`、PocketBase 超级管理员密码、高德 Web 服务 Key、Supabase service role Key 或 SMTP 密码。
- 发现密钥曾提交到 Git 历史时，应先在对应平台轮换密钥，再重写历史；单纯删除当前文件不够。
- 配置高德 Key 的域名/IP 白名单，并对 PocketBase 管理后台、数据库文件和备份设置访问控制。
- PocketBase 管理员密码不得与普通用户密码复用。

## 常用命令

```bash
npm run dev      # 本地开发
npm run build    # 类型检查并构建
npm run preview  # 预览构建产物
npm run lint     # 运行 ESLint
```
