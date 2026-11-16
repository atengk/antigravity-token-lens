#!/usr/bin/env bash
# Token Lens (token-lens) Antigravity 插件 macOS / Linux 一键安装与更新脚本。
#
# 支持在本地仓库目录直接安装，以及通过 curl | bash 远程单行自动拉取安装/更新。
# @author Ateng
# @since 2026-11-16

set -euo pipefail

REPO_URL="https://github.com/atengk/antigravity-token-lens.git"
TAR_URL="https://github.com/atengk/antigravity-token-lens/archive/refs/heads/main.tar.gz"
TARGET_DIR="${HOME}/.gemini/config/plugins/token-lens"

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "[WARN] 未检测到 Node.js，请确保已安装 Node.js >= 20。" >&2
    return
  fi
  local ver major
  ver="$(node -v)"
  major="${ver#v}"
  major="${major%%.*}"
  if [ "${major:-0}" -lt 20 ] 2>/dev/null; then
    echo "[WARN] 当前 Node.js 版本为 ${ver}，建议使用 Node.js >= 20。" >&2
  else
    echo "[OK] Node.js ${ver}"
  fi
}

copy_payload() {
  local src_dir="$1"
  local dst_dir="$2"
  mkdir -p "$dst_dir"

  local abs_src abs_dst
  abs_src="$(cd "$src_dir" && pwd -P)"
  abs_dst="$(cd "$dst_dir" && pwd -P)"
  if [ "$abs_src" = "$abs_dst" ]; then
    echo "[INFO] 当前已在插件目标目录内，跳过文件复制。"
    return
  fi

  for item in plugin.json assets skills sidecars README.md README.en.md LICENSE; do
    if [ ! -e "${abs_src}/${item}" ]; then
      continue
    fi
    rm -rf "${abs_dst:?}/${item}"
    cp -R "${abs_src}/${item}" "${abs_dst}/${item}"
  done
}

echo "=== Token Lens 插件安装 / 更新 ==="
check_node

SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
fi

if [ -n "$SCRIPT_DIR" ] && [ -f "${SCRIPT_DIR}/plugin.json" ]; then
  echo "[INFO] 从本地仓库安装: ${SCRIPT_DIR}"
  copy_payload "$SCRIPT_DIR" "$TARGET_DIR"
elif command -v git >/dev/null 2>&1; then
  if [ -d "${TARGET_DIR}/.git" ]; then
    echo "[INFO] 检测到已有 Git 插件目录，执行更新: ${TARGET_DIR}"
    git -C "$TARGET_DIR" pull --ff-only
  elif [ ! -e "$TARGET_DIR" ]; then
    echo "[INFO] 使用 Git 克隆插件至: ${TARGET_DIR}"
    mkdir -p "$(dirname "$TARGET_DIR")"
    git clone --depth 1 "$REPO_URL" "$TARGET_DIR"
  else
    echo "[INFO] 目标目录已存在非 Git 副本，拉取最新版本覆盖核心文件..."
    TMP_DIR="$(mktemp -d)"
    trap 'rm -rf "$TMP_DIR"' EXIT
    git clone --depth 1 "$REPO_URL" "$TMP_DIR/repo"
    copy_payload "$TMP_DIR/repo" "$TARGET_DIR"
  fi
else
  echo "[INFO] 未检测到 Git，使用压缩包下载安装..."
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  curl -fsSL "$TAR_URL" -o "$TMP_DIR/repo.tar.gz"
  tar -xzf "$TMP_DIR/repo.tar.gz" -C "$TMP_DIR"
  EXTRACTED_DIR="$(find "$TMP_DIR" -maxdepth 2 -name plugin.json -exec dirname {} \; | head -n 1)"
  if [ -z "$EXTRACTED_DIR" ]; then
    echo "[ERROR] 解压后未找到 plugin.json，安装中止。" >&2
    exit 1
  fi
  copy_payload "$EXTRACTED_DIR" "$TARGET_DIR"
fi

echo ""
echo "[DONE] token-lens 已安装至: ${TARGET_DIR}"
echo "使用方式：在 Antigravity 对话框输入 /token-lens 即可打开实时面板（无需修改客户端文件）。"
