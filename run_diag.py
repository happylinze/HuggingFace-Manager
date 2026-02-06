import sys
import os
import requests
import socket
import json
from pathlib import Path

# Add src to path
current_dir = Path(__file__).parent.absolute()
src_dir = current_dir / 'src'
sys.path.insert(0, str(src_dir))

def run_diagnostics():
    print("\n" + "="*50)
    print("HFManager Network Diagnostics")
    print("="*50 + "\n")

    # 1. Environment Variables
    print("[1] Checking Environment Variables:")
    for key in ['HF_ENDPOINT', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'HF_HUB_DISABLE_SSL_VERIFY']:
        val = os.environ.get(key)
        print(f"  {key}: {val}")

    # 2. Config File Check
    print("\n[2] Checking Application Config:")
    try:
        from hfmanager.utils.config import get_config
        config = get_config()
        print(f"  Config Dir: {config.config_dir}")
        print(f"  Mirror Setting: {config.get('mirror')}")
        print(f"  Proxy Setting: {config.get('proxy_url')}")
    except Exception as e:
        print(f"  FAILED to load config: {e}")

    # 3. DNS Resolution
    print("\n[3] Checking DNS Resolution:")
    targets = {
        "huggingface.co": "Official",
        "hf-mirror.com": "Mirror",
        "google.com": "Proxy Test"
    }
    for host, label in targets.items():
        try:
            ip = socket.gethostbyname(host)
            print(f"  {label} ({host}) -> {ip}")
            # Detect fake-IP (common in Clash)
            if ip.startswith("198.18."):
                print(f"    -> Detected Clash/Fake-IP!")
        except Exception as e:
            print(f"  {label} ({host}) -> FAILED: {e}")

    # 4. HTTP Connectivity (Requests)
    print("\n[4] Checking HTTP Connectivity:")
    
    # Construct proxy dict from env or config manual
    proxies = {}
    if os.environ.get('HTTP_PROXY'):
        proxies['http'] = os.environ.get('HTTP_PROXY')
    if os.environ.get('HTTPS_PROXY'):
        proxies['https'] = os.environ.get('HTTPS_PROXY')
    
    print(f"  Using Proxies for Test: {proxies}")

    endpoints = [
        ("https://huggingface.co/api/models", "Official API"),
        ("https://hf-mirror.com/api/models", "Mirror API"),
    ]

    for url, label in endpoints:
        print(f"  Testing {label}...")
        try:
            # Test direct (session respects env vars by default)
            resp = requests.head(url, timeout=5)
            print(f"    [Direct/Env] Status: {resp.status_code}, Latency: {resp.elapsed.total_seconds()*1000:.1f}ms")
        except Exception as e:
            print(f"    [Direct/Env] FAILED: {e}")

    # 5. HfApi Test
    print("\n[5] Checking huggingface_hub Library:")
    try:
        from huggingface_hub import HfApi
        api = HfApi()
        print(f"  HfApi Endpoint: {api.endpoint}")
        
        # Try a simple call
        print("  Calling list_models(limit=1)...")
        models = list(api.list_models(limit=1))
        print(f"  SUCCESS! Found model: {models[0].modelId}")
    except Exception as e:
        print(f"  FAILED: {e}")

    print("\n" + "="*50)
    print("Diagnostics Complete")
    print("="*50 + "\n")

if __name__ == "__main__":
    run_diagnostics()
