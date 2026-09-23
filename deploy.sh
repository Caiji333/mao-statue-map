#!/usr/bin/env bash
# 部署脚本：停旧服务 → 拉代码 → 构建 → 后台启动静态站
# 用法：在项目目录执行  bash deploy.sh
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-5173}"
LOG="$APP_DIR/serve.log"
PID_FILE="$APP_DIR/serve.pid"

cd "$APP_DIR"
echo "== 项目目录: $APP_DIR"

# 1. 停止现有服务（按端口 / 旧 pid / serve 进程）
echo "== 停止现有服务 :$PORT"
if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
    kill -9 "$OLD_PID" 2>/dev/null || true
    echo "   已停止 pid=$OLD_PID"
  fi
  rm -f "$PID_FILE"
fi

# 兜底：杀掉占用该端口的进程
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then
  lsof -ti tcp:"$PORT" | xargs -r kill 2>/dev/null || true
else
  pkill -f "serve dist -l $PORT" 2>/dev/null || true
fi
sleep 1

# 2. 拉取代码
echo "== 拉取代码"
git fetch origin
git pull --ff-only origin main

# 3. 构建（静态站需要 dist 最新）
echo "== 构建 npm run build"
if [ -f package-lock.json ] || [ -f pnpm-lock.yaml ]; then
  npm run build
else
  npm install && npm run build
fi

# 4. 后台启动
echo "== 后台启动 serve dist -l $PORT"
: > "$LOG"
nohup npx serve dist -l "$PORT" > "$LOG" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"
sleep 2

if kill -0 "$NEW_PID" 2>/dev/null; then
  echo "== 成功  pid=$NEW_PID"
  echo "== 日志  $LOG"
  echo "== 访问  http://127.0.0.1:$PORT/"
  echo "== 停止  kill \$(cat $PID_FILE)"
else
  echo "== 启动失败，最近日志："
  tail -n 30 "$LOG" || true
  exit 1
fi
