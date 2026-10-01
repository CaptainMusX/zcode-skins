# ZCode 皮肤中心 (zcode-skins)

为 **ZCode Desktop** 深度适配的美化增强插件：六款精选内置主题、自定义主题工坊，以及 Steam Wallpaper Engine 本地壁纸库集成与实时渲染。

本项目在 `hermes-skins` 基础上独立改进与适配，针对 ZCode 桌面端的 Electron + React 架构、Tailwind 视觉系统与 DOM 结构进行了深度定制，完全不影响 Hermes 插件的独立使用。

---

## 核心特性

- **六款精选内置主题**：保留原版插画与视觉素材的原汁原味，涵盖艺术插画、角色美学、深色深邃与雅致浅色风格；
- **深浅色模式自适应（Auto Appearance）**：通过智能自适应遮罩与 CSS 变量实时适配暗色与亮色模式，保障文字与代码的高可读性；
- **Wallpaper Engine 动态壁纸深度集成**：自动发现本机 Steam Wallpaper Engine 库，原生支持视频（MP4/WebM）、WebGL 动态场景（Scene）与 HTML5 网页（Web）壁纸在 ZCode 背后平滑渲染；
- **玻璃拟态透光质感（Glassmorphism）**：智能透光算法统一驱动 ZCode 侧边栏、主对话区与卡片背景，并辅以高精度毛玻璃磨砂（Backdrop Blur）；
- **自定义主题工坊（Custom Theme Studio）**：可自由调整主色调、背景模糊度、遮罩透明度与卡片质感，支持一键保存为专属皮肤或导出/导入 JSON 配置；
- **全局快捷呼出与悬浮徽章**：在 ZCode 界面右下角提供精致的悬浮调色盘徽章 🎨，并支持按下 `Ctrl+Shift+S` 全局呼出/隐藏皮肤中心弹窗与试穿横幅。

---

## 快速使用

### 一次安装，永久生效

```sh
npm install
npm run install:zcode
```

执行后 ZCode 会自动重启并加载美化插件。**此后每次从桌面图标、开始菜单或任务栏直接打开 ZCode 都会自动生效**，无需再运行任何命令，也无需保持调试端口或后台进程。

如需彻底还原到 ZCode 官方纯净状态：

```sh
npm run restore:official
```

### 在 ZCode 中使用

- 界面右下角常驻 🎨 悬浮徽章，点击即可打开皮肤中心；
- 或随时按下 `Ctrl+Shift+S`（亦可 `Alt+S`）唤出/隐藏面板；
- 面板内可切换「皮肤画廊」「壁纸与背景控制」「主题工坊」三个分页。

---

## 实现说明

### 为何不采用 ZCode 原生插件机制

ZCode 的插件系统（`.zcode-plugin/plugin.json`）仅支持 `agents` / `commands` / `skills` / `hooks` / `mcpServers` 五类组件，**不具备任何界面外观或主题定制能力**，因此无法通过标准插件渠道实现皮肤美化。

### 渲染隔离（Shadow DOM）

ZCode 的 Tailwind 产物**缺少本插件依赖的大量工具类**（如 `bg-neutral-900/90`、`rounded-2xl`、`shadow-2xl`、`z-[99990]`、`max-w-5xl` 等）。若直接依赖宿主样式表，面板背景会退化为完全透明，导致壁纸上的文字透过面板与卡片文案重叠。

因此插件在宿主页面上挂载一个 **Shadow Root**，并自带一份完整样式表（`src/styles/zcode-skins.css`）。该样式表优先复用 ZCode 自身的主题变量（`--color-card`、`--color-border` 等），在变量缺失时回退到内置调色板，从而在深浅两种模式下都能正确呈现。

### 持久化机制

`npm run install:zcode` 会对 ZCode 的 `app.asar` 做**二进制补丁**：

1. 在归档中追加 `out/renderer/zcode-skins.bundle.js`；
2. 在 `out/renderer/index.html` 末尾插入一行 `<script src="./zcode-skins.bundle.js"></script>`；
3. 重写归档头（含各文件 SHA-256 完整性校验值），其余约 320 MB 数据区**逐字节原样复制**，不重新打包。

由于只改动归档头与两个渲染层文件，`app.asar.unpacked` 下的原生模块（`node-pty`、`ssh2` 等）与全部文件完整性校验均保持不变。安装前会自动备份原始 `app.asar`，`restore:official` 可逐字节还原。

---

## 项目结构

```text
F:\ZCode UI增强\
├── src/
│   ├── adapter/
│   │   ├── zcode-sdk-shim.js    # ZCode 独立轻量 SDK 适配层
│   │   └── zcode-modal-host.js  # ZCode 模态画廊与悬浮唤出宿主
│   ├── catalog/
│   │   └── builtin-skins.js     # 六款原汁原味内置经典主题
│   ├── engine/
│   │   ├── backdrop-manager.js  # 壁纸与背景引擎
│   │   ├── glass-controller.js  # ZCode 玻璃拟态与毛玻璃透光控制器
│   │   ├── skin-controller.js   # 核心皮肤状态与主题变量同步器
│   │   ├── storage-manager.js   # 本地配置与持久化存储
│   │   ├── theme-watcher.js     # 明暗模式自适应检测
│   │   └── we-library.js        # Wallpaper Engine 本地库发现
│   └── ui/                      # 皮肤画廊、工坊与试穿横幅组件
├── scripts/
│   ├── build.js                 # 编译自包含单文件 plugin.js 与注入包
│   ├── patch-asar.mjs           # app.asar 二进制补丁器
│   ├── install-permanent.mjs    # 一键持久化安装
│   └── restore-official.mjs     # 一键还原官方状态
└── plugin.js                    # 构建输出的自包含单文件插件
```

---

## 版权与致谢

- 本项目由 CaptainMusX 开发并维护；
- 原版插画与素材版权归原作者所有，本项目仅做适配呈现，不包含商业重绘或模型漂移修改；
- 第三方 WebGL 播放器与壁纸垫片来自开源生态支持，详见 `THIRD-PARTY-NOTICES.md` 与 `LICENSING.md`。
