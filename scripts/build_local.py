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


def get_version(project_root):
    """Read version from pyproject.toml."""
    try:
        import tomllib # Python 3.11+
    except ImportError:
        try:
            import tomli as tomllib # Fallback
        except ImportError:
            # Simple regex fallback if no toml parser
            import re
            toml_path = project_root / "pyproject.toml"
            if toml_path.exists():
                with open(toml_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    match = re.search(r'version\s*=\s*"([^"]+)"', content)
                    if match:
                        return match.group(1)
            return "unknown"

    toml_path = project_root / "pyproject.toml"
    if toml_path.exists():
        with open(toml_path, "rb") as f:
            data = tomllib.load(f)
            return data.get("project", {}).get("version", "unknown")
    return "unknown"

def main():
    # 1. Setup Paths
    project_root = Path(__file__).parent.parent.absolute()
    frontend_dir = project_root / "frontend"
    dist_dir = project_root / "dist"
    
    version = get_version(project_root)
    print(f"📌 Project Version: {version}")

    # 2. Build Frontend
    print("\n📦 Building Frontend...")
    frontend_dist = frontend_dir / "dist" / "index.html"
    
    try:
        if not (frontend_dir / "node_modules").exists():
            # Use subprocess directly to catch the error (run_command exits on fail)
            subprocess.run("npm install", cwd=frontend_dir, shell=True, check=True)
        subprocess.run("npm run build", cwd=frontend_dir, shell=True, check=True)
    except Exception as e:
        print(f"⚠️ Frontend build command failed: {e}")
        if frontend_dist.exists():
            print("✅ Found existing frontend build. Continuing...")
        else:
            print("❌ Frontend build failed and no existing dist found!")
            sys.exit(1)
            
    # Verify Frontend Build
    if not frontend_dist.exists():
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
    # Ensure aria2 binary exists in resources
    aria2_res = project_root / "src" / "hfmanager" / "resources" / "bin"
    aria2_res.mkdir(parents=True, exist_ok=True)
    
    run_command("pyinstaller hfmanager.spec", cwd=project_root)
    
    # 5. Packaging (Zip)
    print("\n🗜️ Packaging Application...")
    output_name = f"HFManager_v{version}_Win_x64"
    app_dist = dist_dir / "HFManager"
    zip_path = dist_dir / output_name
    
    if app_dist.exists():
        try:
            # shutil.make_archive adds .zip extension automatically
            zip_file = shutil.make_archive(str(zip_path), 'zip', app_dist)
            print(f"🎁 Created Zip: {zip_file}")
        except Exception as e:
            print(f"❌ Failed to create zip: {e}")
    else:
        print("❌ App dist not found, skipping zip.")

    print("\n✅ Build Complete!")
    print(f"📂 Output Folder: {app_dist}")
    print(f"📦 Release Package: {zip_path}.zip")
    print(f"👉 You can now run the executable inside 'dist/HFManager' or share the ZIP.")

if __name__ == "__main__":
    main()
