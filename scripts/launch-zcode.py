import os
import sys
import time
import subprocess

ZCODE_DIR = "D:/Program Files/ZCode"
EXE_PATH = os.path.join(ZCODE_DIR, "ZCode.exe")
BUNDLE_PATH = "F:/ZCode UI增强/dist/zcode-skins.bundle.js"

# 检查当前是否已经在运行
def is_running():
    try:
        out = subprocess.check_output(["powershell.exe", "-NoProfile", "-Command", "Get-Process -Name ZCode -ErrorAction SilentlyContinue"], text=True)
        return "ZCode" in out
    except:
        return False

# 如果未运行，启动 ZCode
if not is_running():
    print("Launching ZCode Desktop...")
    subprocess.Popen([EXE_PATH], cwd=ZCODE_DIR)
    time.sleep(3)
else:
    print("ZCode is already running.")

print("ZCode is ready!")
