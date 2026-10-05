## What's new in 1.1.2

Marketplace distribution: this repository is now public and can be added as a plugin marketplace inside ZCode. Installing the "ZCode Skin Center" plugin ships the installer-guiding skill, so ZCode can complete the one-time engine install for you on request. The wallpaper library scan now prunes wallpapers deleted from disk (index re-verification plus live-disk preview probing, with an all-fail safety net), and both cards on the wallpaper tab share the same full page width.

## ZCode skins 1.1.0

Composer and summary glass now obey transparency/frost settings. Native rounded menus use a single translucent surface. Includes Hermes 1.3.5 cursor/X-ray/shake and renderer lifecycle fixes, versioned scene caches and verified recoverable ZCode installation. See [feature parity and acceptance](docs/PARITY-1.1.0.zh.md).

# ZCode Skin Center (zcode-skins)

A desktop beautification and theme plugin tailored for **ZCode Desktop**: featuring six built-in aesthetic themes, a custom theme studio, and native Steam Wallpaper Engine integration.

Adapted from `hermes-skins` for the ZCode Desktop environment. Independent repository, with zero modifications to the upstream Hermes plugin.

---

## Key Features

- **Six Built-in Themes**: Original art assets, covering anime aesthetics, cyberpunk, deep dark, and elegant light styles.
- **Auto Appearance Adaptation**: Smart contrast veils and CSS tokens ensure crisp text readability across both light and dark modes.
- **Steam Wallpaper Engine Integration**: Live playback for video, WebGL scenes, and sandboxed web wallpapers.
- **Glassmorphism Translucency**: Unified transparency and frosted glass blur behind ZCode chat, sidebars, and input cards.
- **Custom Theme Studio**: Customize accent colors, blur intensity, and opacity; save as local custom skins or export to JSON.
- **Settings Sidebar Entry & Global Shortcut**: The "Skin Center" item below Appearance in ZCode's settings sidebar opens an inline panel in the settings content pane (identical to native sections); `Ctrl+Shift+S` still opens the standalone modal anywhere.
- **Local File Bridge**: Reuses ZCode's own directory-picker and path APIs to build a renderer-side file index, so Wallpaper Engine library import and video/web wallpaper playback work out of the box.

---

## Quick Start

### Option 1: Plugin Marketplace (Recommended)

1. Open ZCode's **Plugin Marketplace → Add → Add Plugin Marketplace**;
2. Paste this repository (`https://github.com/CaptainMusX/zcode-skins`) as the marketplace source. If your ZCode version only accepts local directories, `git clone` this repo first and paste the cloned folder;
3. Under **Personal**, find "ZCode Skin Center" and click **Install** — the marketplace ships the plugin package plus an installer-guiding skill;
4. Then just ask ZCode to "install the skin engine" — it follows the skill to download the latest Release archive and run the one-time host patch (Node.js 22+ required).

### Option 2: Direct Engine Install

```sh
npm install
npm run install:zcode
```

ZCode restarts automatically and the beautification loads on every launch. To restore the pristine official state:

```sh
npm run restore:official
```

---

## License

See [LICENSING.md](LICENSING.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
