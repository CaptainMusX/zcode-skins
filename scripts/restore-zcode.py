# Restore original official ZCode Desktop
import os, sys, time, shutil, subprocess

zcode_dir = "D:/Program Files/ZCode"
resources_dir = os.path.join(zcode_dir, "resources")
asar_path = os.path.join(resources_dir, "app.asar")
original_asar = os.path.join(resources_dir, "app.asar.original")

if not os.path.exists(original_asar):
    print("[restore] No original backup found. ZCode appears to be in official state.")
    sys.exit(0)

def is_zcode_running():
    try:
        out = subprocess.check_output(["tasklist"], text=True)
        return "ZCode.exe" in out
    except:
        return False

auto_restart = "--restart" in sys.argv

if is_zcode_running():
    if auto_restart:
        print("[restore] Closing ZCode.exe...")
        subprocess.run(["taskkill", "/F", "/IM", "ZCode.exe"], capture_output=True)
        time.sleep(1.5)
    else:
        print("[restore] ZCode is currently running. Please close ZCode first, or run with --restart.")
        sys.exit(2)

print("[restore] Restoring original app.asar...")
shutil.copy2(original_asar, asar_path)
print("[restore] ✨ ZCode Desktop has been fully restored to official clean state.")

if auto_restart:
    exe_path = os.path.join(zcode_dir, "ZCode.exe")
    print(f"[restore] Relaunching ZCode...")
    subprocess.Popen([exe_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
