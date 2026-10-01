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

### 方式一：CDP 零侵入免改动热启动（强烈推荐）

无需改动 ZCode 官方任何二进制或代码文件，永不与官方更新冲突：

```sh
# 1. 安装构建依赖并打包
npm run build

# 2. 启动并自动注入皮肤
npm run start:zcode
```

运行后将启动 ZCode 并在主窗口中即刻激活皮肤中心。按 `Ctrl+Shift+S` 即可随时唤出画廊。

### 方式二：常驻文件注入

如果希望每次正常直接打开桌面 ZCode 快捷方式也能自动加载：

```sh
npm run inject:zcode
```

如需还原到官方纯净状态：

```sh
npm run restore:zcode
```

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
│   ├── build.js                 # 编译打包单文件 plugin.js
│   ├── start-zcode.js           # CDP 安全免侵入启动注入器
│   ├── inject-zcode.js          # 本地文件注入器
│   └── restore-zcode.js         # 一键还原脚本
└── plugin.js                    # 构建输出的自包含单文件插件
```

---

## 版权与致谢

- 本项目由 CaptainMusX 开发并维护；
- 原版插画与素材版权归原作者所有，本项目仅做适配呈现，不包含商业重绘或模型漂移修改；
- 第三方 WebGL 播放器与壁纸垫片来自开源生态支持，详见 `THIRD-PARTY-NOTICES.md` 与 `LICENSING.md`。
