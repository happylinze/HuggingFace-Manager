import os
import sys
import shutil
import subprocess
import time
from pathlib import Path

try:
    import psutil
except ImportError:
    psutil = None

def run_command(cmd, cwd=None, shell=True):
    """Run a shell command and exit on failure."""
    print(f"🚀 Running: {cmd}")
    try:
        subprocess.check_call(cmd, cwd=cwd, shell=shell)
    except subprocess.CalledProcessError:
        print(f"❌ Command failed: {cmd}")
        sys.exit(1)

def kill_running_process(process_name):
    """Kill process by name if running."""
    print(f"🔪 Attempting to kill {process_name}...")
    
    # Method 1: Windows Taskkill (Most reliable on Windows)
    if os.name == 'nt':
        try:
            subprocess.run(
                ["taskkill", "/F", "/IM", process_name, "/T"], 
                capture_output=True, 
                check=False
            )
            # Give it a moment to die
            time.sleep(1)
        except Exception as e:
            print(f"⚠️ Taskkill failed: {e}")

    # Method 2: psutil (Cross-platform)
    if psutil:
        killed = False
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                if proc.info['name'] == process_name:
                    print(f"⚠️ Found running instance {process_name} (PID {proc.info['pid']}). Terminating...")
                    proc.kill()
                    killed = True
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        
        if killed:
            print(f"⏳ Waiting for {process_name} to release locks...")
            time.sleep(2)


def main():
    # 1. Setup Paths
    project_root = Path(__file__).parent.parent.absolute()
    frontend_dir = project_root / "frontend"
    dist_dir = project_root / "dist"
    
    # 2. Build Frontend
    print("\n📦 Building Frontend...")
    if not (frontend_dir / "node_modules").exists():
        run_command("npm install", cwd=frontend_dir)
    run_command("npm run build", cwd=frontend_dir)
    
    # Verify Frontend Build
    if not (frontend_dir / "dist" / "index.html").exists():
        print("❌ Frontend build failed: index.html not found!")
        sys.exit(1)
        
    # 3. Clean previous build
    print("\n🧹 Cleaning previous build...")
    
    # Kill existing instances first to release file locks
    kill_running_process("HFManager.exe")
    
    if dist_dir.exists():
        # Retry logic for rmtree
        for i in range(3):
            try:
                shutil.rmtree(dist_dir)
                break
            except PermissionError:
                print(f"⚠️ Permission denied cleaning dist ({i+1}/3). Retrying in 1s...")
                time.sleep(1)
        else:
             print("❌ Failed to clean dist directory. Is the app still open?")
             sys.exit(1)

    if (project_root / "build").exists():
        try:
            shutil.rmtree(project_root / "build")
        except:
            pass

    # 4. Build Backend (PyInstaller)
    print("\n🐍 Building Backend with PyInstaller...")
    # Ensure aria2 binary exists in resources (Mock check)
    aria2_res = project_root / "src" / "hfmanager" / "resources" / "bin"
    aria2_res.mkdir(parents=True, exist_ok=True)
    
    # Note: User is responsible for putting aria2c.exe there if they want it bundled,
    # or the script could download it. GitHub Actions does downloads.
    # For local dev, we assume the user has set it up or it's empty (app will use specific path logic).
    
    run_command("pyinstaller hfmanager.spec", cwd=project_root)
    
    print("\n✅ Build Complete!")
    print(f"📂 Output: {dist_dir / 'HFManager'}")
    print("👉 You can now run the executable inside 'dist/HFManager'")

if __name__ == "__main__":
    main()
