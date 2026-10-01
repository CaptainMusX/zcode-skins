# Apply persistent patch to ZCode Desktop
import os, sys, time, shutil, subprocess

zcode_dir = "D:/Program Files/ZCode"
resources_dir = os.path.join(zcode_dir, "resources")
asar_path = os.path.join(resources_dir, "app.asar")
original_asar = os.path.join(resources_dir, "app.asar.original")
patched_asar = os.path.join(resources_dir, "app.asar.patched")

if not os.path.exists(patched_asar):
    print("Error: app.asar.patched not found. Run patch generator first.")
    sys.exit(1)

# 检查是否有 ZCode 进程在运行
def is_zcode_running():
    try:
        out = subprocess.check_output(["tasklist"], text=True)
        return "ZCode.exe" in out
    except:
        return False

auto_restart = "--restart" in sys.argv or "-r" in sys.argv

if is_zcode_running():
    if auto_restart:
        print("[apply] Closing running ZCode.exe...")
        subprocess.run(["taskkill", "/F", "/IM", "ZCode.exe"], capture_output=True)
        time.sleep(1.5)
    else:
        print("[apply] ZCode is currently running. Please close ZCode first, or run with --restart.")
        sys.exit(2)

# 备份原版
if not os.path.exists(original_asar):
    print(f"[apply] Creating original backup: {original_asar}")
    shutil.copy2(asar_path, original_asar)
else:
    print(f"[apply] Backup already exists: {original_asar}")

# 替换
print(f"[apply] Replacing app.asar with patched version...")
shutil.move(patched_asar, asar_path)
print("[apply] ✨ Successfully patched ZCode Desktop!")
print("[apply] zcode-skins is now permanently installed. It will automatically load every time ZCode starts.")

if auto_restart:
    exe_path = os.path.join(zcode_dir, "ZCode.exe")
    print(f"[apply] Relaunching ZCode: {exe_path}")
    subprocess.Popen([exe_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("[apply] ZCode restarted!")
