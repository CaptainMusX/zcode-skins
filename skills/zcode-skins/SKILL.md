---
name: zcode-skins
description: ZCode 皮肤中心与外观定制：安装/更新桌面美化引擎，查看内置主题画廊、更换自定义壁纸或 Steam Wallpaper Engine 动态壁纸、调节毛玻璃模糊与透明度。当用户提到皮肤、主题、壁纸、美化、毛玻璃、透明度、Wallpaper Engine 时使用。
---

# ZCode 皮肤中心 (ZCode Skins)

本插件为 ZCode Desktop 提供主题美化与视觉增强：主题画廊、自定义壁纸（图片/视频/Web/Steam Wallpaper Engine 动态壁纸）、玻璃拟态毛玻璃。

**重要**：ZCode 的插件市场只分发本技能与元数据；界面美化引擎需要一次性注入宿主（对 `app.asar` 做二进制补丁，附带官方备份与还原脚本）。用户在市场安装本插件后，请按下面步骤引导完成引擎安装。

## 引擎安装（用户请求"安装/开启/更新皮肤美化"时执行）

前置条件：Windows + ZCode Desktop（默认安装于 `D:\Program Files\ZCode`，其他位置先设置 `ZCODE_DIR` 环境变量）+ Node.js 22+。

**方式 A：Release 离线包（推荐，无需 git）**

```powershell
# 1. 查询最新 Release 中的离线包
$rel = Invoke-RestMethod https://api.github.com/repos/CaptainMusX/zcode-skins/releases/latest
$asset = $rel.assets | Where-Object name -like 'zcode-skins-v*-windows.zip' | Select-Object -First 1
# 2. 下载并解压到临时目录
Invoke-WebRequest $asset.browser_download_url -OutFile "$env:TEMP\zcode-skins.zip"
Expand-Archive "$env:TEMP\zcode-skins.zip" -DestinationPath "$env:TEMP\zcode-skins" -Force
# 3. 运行安装器（幂等：已安装则原地更新；完成后 ZCode 自动重启）
node "$env:TEMP\zcode-skins\scripts\install-permanent.mjs" --restart --skip-build
```

**方式 B：从源码安装（需 git + Node.js 22+）**

```sh
git clone https://github.com/CaptainMusX/zcode-skins.git
cd zcode-skins && npm install && npm run install:zcode
```

安装说明：
- 安装器会校验宿主版本与官方备份、保留当前运行版作为回滚档，重启 ZCode 后生效；此后每次启动自动生效。
- 若 ZCode 正在运行且未带 `--restart`，安装器会拒绝执行；始终以仓库最新 Release 为准。

## 验证与还原

- 验证：ZCode 重启后，「设置 → 外观 → 皮肤中心」出现皮肤中心入口；`Ctrl+Shift+S`（或 `Alt+S`）呼出独立面板。
- 还原官方界面：在源码目录运行 `npm run restore:official`，或离线包目录运行 `node scripts\restore-official.mjs --restart`。

## 使用指引（安装完成后可向用户介绍）

- 「设置 → 外观 → 皮肤中心」三个分页：皮肤画廊（试穿/应用）、壁纸与背景控制（壁纸源/模糊/透光/毛玻璃滑杆）、主题工坊（自定义主题）；
- 壁纸：本地图片/视频/Web 壁纸直接填路径；Wallpaper Engine 壁纸在「从 Wallpaper Engine 导入」中点击「选择壁纸库目录」，选择 Steam 库根目录或 WE 的 projects 目录扫描导入（场景项目需后端解包）；
- 快捷键：`Ctrl+Shift+S` / `Alt+S` 全局呼出，右下角 🎨 调色盘胶囊可快速打开；
- 毛玻璃：界面透光控制输入框与摘要胶囊底色，输入框磨砂/界面磨砂分别控制模糊程度，0 为关闭。
