# ZCode skins 1.1.0 installation

Requires Node.js 22+; validated host is ZCode Desktop 3.14.4. Extract the Windows ZIP and run install.cmd. Set ZCODE_DIR for a non-default installation directory.

The installer verifies the host and official archive, saves the current skin installation, applies the renderer bundle and restarts ZCode. User settings, fonts and wallpaper selections remain intact.

From source: npm install, npm run build, npm run install:zcode. Restore with npm run restore:official; mismatched host backups are rejected.

Open Skin Center below Appearance in Settings, or use Ctrl+Shift+S / Alt+S. Composer frost and surface frost obey their values, including zero.
