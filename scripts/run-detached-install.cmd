@echo off
rem Detached launcher: survives ZCode shutdown, runs the installer outside the agent shell.
cd /d "F:\ZCode UI增强"
"C:\Program Files\nodejs\node.exe" "F:\ZCode UI增强\scripts\install-detached.mjs" > "F:\ZCode UI增强\install-detached.out.log" 2>&1
