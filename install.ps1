<#
.SYNOPSIS
    Token Lens (token-lens) Antigravity 插件 Windows 一键安装与更新脚本。

    支持在本地仓库目录直接安装，以及通过 `irm ... | iex` 远程单行自动拉取安装/更新。
    @author Ateng
    @since 2026-11-16
#>

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RepoUrl = 'https://github.com/atengk/antigravity-token-lens.git'
$ZipUrl = 'https://github.com/atengk/antigravity-token-lens/archive/refs/heads/main.zip'
$PluginId = 'token-lens'
$TargetDir = Join-Path $HOME '.gemini\config\plugins\token-lens'

function Test-NodeVersion {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        Write-Warning '未检测到 Node.js，请确保系统已安装 Node.js >= 20，否则 Sidecar 无法启动。'
        return
    }
    $verText = (& node -v 2>$null).Trim()
    if ($verText -match '^v(\d+)') {
        $major = [int]$Matches[1]
        if ($major -lt 20) {
            Write-Warning "当前 Node.js 版本为 $verText，建议使用 Node.js >= 20。"
        } else {
            Write-Host "[OK] Node.js $verText" -ForegroundColor Green
        }
    }
}

function Copy-PluginPayload {
    param(
        [Parameter(Mandatory = $true)][string]$SourceDir,
        [Parameter(Mandatory = $true)][string]$DestDir
    )

    $resolvedSrc = (Resolve-Path $SourceDir).Path.TrimEnd('\', '/')
    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
    $resolvedDst = (Resolve-Path $DestDir).Path.TrimEnd('\', '/')

    if ($resolvedSrc -ieq $resolvedDst) {
        Write-Host '[INFO] 当前已在插件目标目录内，跳过文件复制。' -ForegroundColor Yellow
        return
    }

    $items = @('plugin.json', 'assets', 'skills', 'sidecars', 'README.md', 'README.en.md', 'LICENSE')
    foreach ($item in $items) {
        $srcPath = Join-Path $resolvedSrc $item
        if (-not (Test-Path $srcPath)) { continue }
        $dstPath = Join-Path $resolvedDst $item
        if (Test-Path $srcPath -PathType Container) {
            # 逐文件覆盖而不删除目录本身，避免 Windows 下 Sidecar 进程占用工作目录句柄导致失败
            Get-ChildItem -Path $srcPath -Recurse -File | ForEach-Object {
                $rel = $_.FullName.Substring($srcPath.Length).TrimStart('\', '/')
                $targetFile = Join-Path $dstPath $rel
                New-Item -ItemType Directory -Force -Path (Split-Path -Parent $targetFile) | Out-Null
                Copy-Item -Path $_.FullName -Destination $targetFile -Force
            }
        } else {
            Copy-Item -Path $srcPath -Destination $dstPath -Force
        }
    }
}

Write-Host '=== Token Lens 插件安装 / 更新 ===' -ForegroundColor Cyan
Test-NodeVersion

$scriptDir = $PSScriptRoot
if ($scriptDir -and (Test-Path (Join-Path $scriptDir 'plugin.json'))) {
    Write-Host "[INFO] 从本地仓库安装: $scriptDir" -ForegroundColor Cyan
    Copy-PluginPayload -SourceDir $scriptDir -DestDir $TargetDir
} elseif (Get-Command git -ErrorAction SilentlyContinue) {
    if (Test-Path (Join-Path $TargetDir '.git')) {
        Write-Host "[INFO] 检测到已有 Git 插件目录，执行更新: $TargetDir" -ForegroundColor Cyan
        & git -C $TargetDir pull --ff-only
        if ($LASTEXITCODE -ne 0) {
            throw 'git pull 更新失败，请检查本地是否有未提交改动或网络连接。'
        }
    } elseif (-not (Test-Path $TargetDir)) {
        Write-Host "[INFO] 使用 Git 克隆插件至: $TargetDir" -ForegroundColor Cyan
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $TargetDir) | Out-Null
        & git clone --depth 1 $RepoUrl $TargetDir
        if ($LASTEXITCODE -ne 0) {
            throw 'git clone 失败，请检查网络或代理设置。'
        }
    } else {
        Write-Host '[INFO] 目标目录已存在非 Git 副本，拉取最新版本覆盖核心文件...' -ForegroundColor Cyan
        $tmpClone = Join-Path ([System.IO.Path]::GetTempPath()) "token-lens-install-$([guid]::NewGuid().ToString('N').Substring(0,8))"
        try {
            & git clone --depth 1 $RepoUrl $tmpClone
            if ($LASTEXITCODE -ne 0) { throw 'git clone 失败。' }
            Copy-PluginPayload -SourceDir $tmpClone -DestDir $TargetDir
        } finally {
            if (Test-Path $tmpClone) { Remove-Item -Path $tmpClone -Recurse -Force }
        }
    }
} else {
    Write-Host '[INFO] 未检测到 Git，使用压缩包下载安装...' -ForegroundColor Cyan
    $tmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) "token-lens-zip-$([guid]::NewGuid().ToString('N').Substring(0,8))"
    $zipFile = Join-Path $tmpRoot 'token-lens.zip'
    try {
        New-Item -ItemType Directory -Force -Path $tmpRoot | Out-Null
        Invoke-WebRequest -Uri $ZipUrl -OutFile $zipFile -UseBasicParsing
        Expand-Archive -Path $zipFile -DestinationPath $tmpRoot -Force
        $extracted = Get-ChildItem -Path $tmpRoot -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'plugin.json') } | Select-Object -First 1
        if (-not $extracted) {
            throw '解压后未找到 plugin.json，安装中止。'
        }
        Copy-PluginPayload -SourceDir $extracted.FullName -DestDir $TargetDir
    } finally {
        if (Test-Path $tmpRoot) { Remove-Item -Path $tmpRoot -Recurse -Force }
    }
}

Write-Host ''
Write-Host "[DONE] $PluginId 已安装至: $TargetDir" -ForegroundColor Green
Write-Host '使用方式：在 Antigravity 对话框输入 /token-lens 即可打开实时面板（无需修改客户端文件）。' -ForegroundColor Gray
