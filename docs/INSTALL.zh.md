# ZCode skins 安装

目标宿主：ZCode Desktop 3.14.4；需要 Node.js 22+。

## 离线包

解压 GitHub 最新 Release 提供的 zcode-skins-v*-windows.zip，运行 install.cmd。安装会验证当前宿主和官方备份、保留当前运行版、注入新的单文件皮肤并重启 ZCode。壁纸、字体和用户设置保留。

安装位置默认 D:/Program Files/ZCode；其他位置请先设置 ZCODE_DIR 环境变量。

## 从源码安装

运行 npm install，再运行 npm run build 和 npm run install:zcode。安装脚本会重新构建渲染 bundle，防止安装旧产物。

## 恢复官方界面

运行 npm run restore:official。脚本保留恢复前的皮肤归档，并验证官方备份与当前宿主版本匹配后还原。ZCode 自身升级后如果官方备份不匹配，脚本会停止而不会覆盖新宿主。

## 使用

设置 → 外观下方 → 皮肤中心；Ctrl+Shift+S 或 Alt+S 可打开独立面板。界面透光度控制输入框与摘要胶囊底色；输入框磨砂和界面磨砂分别控制其模糊程度，0 表示关闭。菜单保留原生圆角，提供独立的浮层底色以保证文字可读。
