"""
HFManager Entry Point for PyInstaller
This file uses absolute imports to work when bundled.
"""
import sys
import os

# When running as bundled exe, add the bundle dir to path
if getattr(sys, 'frozen', False):
    # Running as bundled exe
    bundle_dir = sys._MEIPASS
    sys.path.insert(0, bundle_dir)

# Now import and run
from hfmanager.main import main

if __name__ == "__main__":
    main()
