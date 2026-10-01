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
- **Floating Pill & Global Shortcut**: Access the Skin Center anytime with a discrete floating button or `Ctrl+Shift+S`.

---

## Quick Start

### CDP Live Launch (Zero-touch, Recommended)

```sh
npm run build
npm run start:zcode
```

### Static Injection

```sh
npm run inject:zcode
# To restore official state:
npm run restore:zcode
```

---

## License

See [LICENSING.md](LICENSING.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
