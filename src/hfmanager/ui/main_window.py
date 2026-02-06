"""
Main Window - Application's main interface.
Contains tab navigation for Cache, Download, and Settings views.
"""

from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QTabWidget, QLabel, QStatusBar, QPushButton, QFrame
)
from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QFont, QIcon

from .cache_view import CacheView
from .download_view import DownloadView
from .settings_view import SettingsView
from .styles import get_stylesheet
from ..core.mirror_manager import get_mirror_manager


class MainWindow(QMainWindow):
    """Main application window with tabbed interface."""
    
    def __init__(self):
        super().__init__()
        
        self.setWindowTitle("HFManager - Hugging Face 管理工具")
        self.setMinimumSize(1000, 700)
        self.resize(1200, 800)
        
        # Apply stylesheet
        self.setStyleSheet(get_stylesheet())
        
        self._setup_ui()
        self._setup_statusbar()
    
    def _setup_ui(self):
        """Setup the main UI layout."""
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        layout = QVBoxLayout(central_widget)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        
        # Header bar
        header = self._create_header()
        layout.addWidget(header)
        
        # Tab widget
        self.tabs = QTabWidget()
        self.tabs.setDocumentMode(True)
        
        # Create views
        self.cache_view = CacheView()
        self.download_view = DownloadView()
        self.settings_view = SettingsView()
        
        # Add tabs
        self.tabs.addTab(self.download_view, "📥 下载")
        self.tabs.addTab(self.cache_view, "🗂️ 缓存管理")
        self.tabs.addTab(self.settings_view, "⚙️ 设置")
        
        layout.addWidget(self.tabs)
        
        # Connect signals
        self.settings_view.mirror_changed.connect(self._on_mirror_changed)
    
    def _create_header(self) -> QFrame:
        """Create the application header bar."""
        header = QFrame()
        header.setFixedHeight(60)
        header.setStyleSheet("""
            QFrame {
                background-color: #0f0f23;
                border-bottom: 1px solid #2a2a4a;
            }
        """)
        
        layout = QHBoxLayout(header)
        layout.setContentsMargins(20, 0, 20, 0)
        
        # Logo/Title
        title = QLabel("🤗 HFManager")
        title.setStyleSheet("font-size: 20px; font-weight: bold; color: #e94560;")
        layout.addWidget(title)
        
        layout.addStretch()
        
        # Current mirror indicator
        mirror_manager = get_mirror_manager()
        current = mirror_manager.get_current_mirror()
        
        self.mirror_label = QLabel(f"镜像: {current.name}")
        self.mirror_label.setStyleSheet("color: #a0a0a0; font-size: 12px;")
        layout.addWidget(self.mirror_label)
        
        return header
    
    def _setup_statusbar(self):
        """Setup the status bar."""
        self.statusbar = QStatusBar()
        self.setStatusBar(self.statusbar)
        
        # Version info
        version_label = QLabel("v0.1.1")
        self.statusbar.addPermanentWidget(version_label)
        
        # Initial status
        self.statusbar.showMessage("就绪")
    
    def _on_mirror_changed(self, mirror_key: str):
        """Handle mirror change."""
        mirror_manager = get_mirror_manager()
        current = mirror_manager.get_current_mirror()
        self.mirror_label.setText(f"镜像: {current.name}")
        self.statusbar.showMessage(f"已切换到 {current.name}", 3000)
    
    def show_status_message(self, message: str, timeout: int = 5000):
        """Show a message in the status bar."""
        self.statusbar.showMessage(message, timeout)
    
    def closeEvent(self, event):
        """Handle application close - save download queue."""
        # Save the download queue before closing
        self.download_view.downloader.save_queue()
        event.accept()
