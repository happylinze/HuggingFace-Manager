"""
Settings View - Application configuration interface.
Includes mirror switching, download preferences, and cache settings.
"""
from __future__ import annotations

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QComboBox, QCheckBox, QGroupBox, QLineEdit, QSpinBox,
    QFormLayout, QFrame, QMessageBox, QFileDialog
)
from PySide6.QtCore import Qt, Signal, QThread

from ..core.mirror_manager import get_mirror_manager, MirrorInfo
from ..core.auth_manager import get_auth_manager
from ..utils.config import get_config
from ..utils.system import get_cache_dir, is_hf_transfer_available


class MirrorTestThread(QThread):
    """Background thread for testing mirror connection."""
    result = Signal(str, dict)  # mirror_key, result
    
    def __init__(self, mirror_manager, mirror_key: str):
        super().__init__()
        self.mirror_manager = mirror_manager
        self.mirror_key = mirror_key
    
    def run(self):
        result = self.mirror_manager.test_mirror_connection(self.mirror_key)
        self.result.emit(self.mirror_key, result)


class MirrorCard(QFrame):
    """Card displaying mirror info with test button."""
    
    selected = Signal(str)  # mirror_key
    
    def __init__(self, mirror: MirrorInfo, is_current: bool = False, parent=None):
        super().__init__(parent)
        self.mirror = mirror
        self.setObjectName("card")
        self.setFixedHeight(80)
        
        layout = QHBoxLayout(self)
        
        # Info section
        info_layout = QVBoxLayout()
        
        name_label = QLabel(mirror.name)
        name_label.setStyleSheet("font-weight: bold; font-size: 14px;")
        info_layout.addWidget(name_label)
        
        url_label = QLabel(mirror.url)
        url_label.setStyleSheet("color: #a0a0a0; font-size: 11px;")
        info_layout.addWidget(url_label)
        
        layout.addLayout(info_layout, 1)
        
        # Status/latency label
        self.status_label = QLabel()
        self.status_label.setFixedWidth(100)
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.status_label)
        
        # Test button
        self.test_btn = QPushButton("测试")
        self.test_btn.setObjectName("secondary")
        self.test_btn.setFixedWidth(70)
        layout.addWidget(self.test_btn)
        
        # Select button
        self.select_btn = QPushButton("使用")
        self.select_btn.setFixedWidth(70)
        self.select_btn.clicked.connect(lambda: self.selected.emit(mirror.key))
        layout.addWidget(self.select_btn)
        
        if is_current:
            self.set_current()
    
    def set_current(self):
        """Mark this mirror as currently selected."""
        self.setStyleSheet("QFrame#card { border: 2px solid #e94560; }")
        self.select_btn.setEnabled(False)
        self.select_btn.setText("当前")
    
    def set_test_result(self, result: dict):
        """Display test result."""
        if result.get('success'):
            latency = result.get('latency_ms', 0)
            self.status_label.setText(f"✓ {latency:.0f}ms")
            self.status_label.setStyleSheet("color: #4ade80;")
        else:
            self.status_label.setText("✗ 失败")
            self.status_label.setStyleSheet("color: #ef4444;")
            self.status_label.setToolTip(result.get('error', 'Unknown error'))
    
    def set_testing(self):
        """Show testing state."""
        self.status_label.setText("测试中...")
        self.status_label.setStyleSheet("color: #a0a0a0;")


class SettingsView(QWidget):
    """Application settings interface."""
    
    mirror_changed = Signal(str)  # new mirror key
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.config = get_config()
        self.mirror_manager = get_mirror_manager()
        self._test_threads: dict[str, MirrorTestThread] = {}
        
        self._setup_ui()
    
    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(20)
        layout.setContentsMargins(20, 20, 20, 20)
        
        # Header
        header = QLabel("设置")
        header.setObjectName("title")
        layout.addWidget(header)
        
        # Account settings (HuggingFace login)
        account_group = QGroupBox("🤗 Hugging Face 账户")
        account_layout = QVBoxLayout(account_group)
        
        self.auth_manager = get_auth_manager()
        
        # Status row
        status_row = QHBoxLayout()
        self.login_status_label = QLabel()
        self.login_status_label.setStyleSheet("font-size: 13px;")
        status_row.addWidget(self.login_status_label)
        status_row.addStretch()
        
        self.logout_btn = QPushButton("退出登录")
        self.logout_btn.setObjectName("secondary")
        self.logout_btn.clicked.connect(self._logout)
        status_row.addWidget(self.logout_btn)
        
        account_layout.addLayout(status_row)
        
        # Token input row (shown when not logged in)
        self.token_widget = QWidget()
        token_layout = QVBoxLayout(self.token_widget)
        token_layout.setContentsMargins(0, 10, 0, 0)
        
        token_desc = QLabel(
            "登录后可下载需要授权的模型和数据集。请在 Hugging Face 网站生成 Token。"
        )
        token_desc.setStyleSheet("color: #a0a0a0;")
        token_desc.setWordWrap(True)
        token_layout.addWidget(token_desc)
        
        token_input_row = QHBoxLayout()
        self.token_input = QLineEdit()
        self.token_input.setPlaceholderText("输入您的 HF Access Token (hf_xxxxx)")
        self.token_input.setEchoMode(QLineEdit.EchoMode.Password)
        token_input_row.addWidget(self.token_input)
        
        get_token_btn = QPushButton("🔗 获取Token")
        get_token_btn.setObjectName("secondary")
        get_token_btn.clicked.connect(self._open_token_page)
        token_input_row.addWidget(get_token_btn)
        
        self.login_btn = QPushButton("登录")
        self.login_btn.clicked.connect(self._login)
        token_input_row.addWidget(self.login_btn)
        
        token_layout.addLayout(token_input_row)
        account_layout.addWidget(self.token_widget)
        
        layout.addWidget(account_group)
        
        # Update login status display
        self._update_login_status()
        
        # Mirror settings
        mirror_group = QGroupBox("镜像源设置")
        mirror_layout = QVBoxLayout(mirror_group)
        
        mirror_desc = QLabel(
            "切换下载源以获得更快的下载速度。国内用户推荐使用 HF-Mirror。"
        )
        mirror_desc.setStyleSheet("color: #a0a0a0;")
        mirror_desc.setWordWrap(True)
        mirror_layout.addWidget(mirror_desc)
        
        # Mirror cards
        self.mirror_cards: dict[str, MirrorCard] = {}
        current_mirror = self.mirror_manager.get_current_mirror()
        
        for mirror in self.mirror_manager.get_available_mirrors():
            card = MirrorCard(
                mirror, 
                is_current=(mirror.key == current_mirror.key)
            )
            card.selected.connect(self._on_mirror_selected)
            card.test_btn.clicked.connect(lambda checked, k=mirror.key: self._test_mirror(k))
            
            self.mirror_cards[mirror.key] = card
            mirror_layout.addWidget(card)
        
        # Test all button
        test_all_btn = QPushButton("测试所有镜像")
        test_all_btn.setObjectName("secondary")
        test_all_btn.clicked.connect(self._test_all_mirrors)
        mirror_layout.addWidget(test_all_btn)
        
        layout.addWidget(mirror_group)
        
        # Download settings
        download_group = QGroupBox("下载设置")
        download_layout = QFormLayout(download_group)
        
        # hf_transfer option
        self.hf_transfer_check = QCheckBox("启用 hf_transfer 加速下载")
        self.hf_transfer_check.setChecked(self.config.get('use_hf_transfer', True))
        
        if is_hf_transfer_available():
            self.hf_transfer_check.setToolTip("已安装 hf_transfer，启用后可显著提升下载速度")
        else:
            self.hf_transfer_check.setEnabled(False)
            self.hf_transfer_check.setToolTip("未安装 hf_transfer，请运行 pip install hf_transfer")
        
        self.hf_transfer_check.toggled.connect(
            lambda v: self.config.set('use_hf_transfer', v)
        )
        download_layout.addRow("", self.hf_transfer_check)
        
        # Max concurrent downloads
        self.concurrent_spin = QSpinBox()
        self.concurrent_spin.setRange(1, 5)
        self.concurrent_spin.setValue(self.config.get('max_concurrent_downloads', 3))
        self.concurrent_spin.valueChanged.connect(
            lambda v: self.config.set('max_concurrent_downloads', v)
        )
        download_layout.addRow("最大并发下载数:", self.concurrent_spin)
        
        # Custom download directory
        download_dir_layout = QHBoxLayout()
        self.download_dir_input = QLineEdit()
        self.download_dir_input.setPlaceholderText("使用默认 HuggingFace 缓存目录")
        self.download_dir_input.setText(self.config.get('download_dir', ''))
        self.download_dir_input.textChanged.connect(
            lambda v: self.config.set('download_dir', v)
        )
        download_dir_layout.addWidget(self.download_dir_input)
        
        browse_btn = QPushButton("浏览")
        browse_btn.setObjectName("secondary")
        browse_btn.clicked.connect(self._browse_download_dir)
        download_dir_layout.addWidget(browse_btn)
        
        download_layout.addRow("下载目录:", download_dir_layout)
        
        layout.addWidget(download_group)
        
        # Cache settings
        cache_group = QGroupBox("缓存设置")
        cache_layout = QVBoxLayout(cache_group)
        
        cache_path_layout = QHBoxLayout()
        cache_path_label = QLabel(f"缓存目录: {get_cache_dir()}")
        cache_path_label.setStyleSheet("color: #a0a0a0;")
        cache_path_layout.addWidget(cache_path_label)
        cache_layout.addLayout(cache_path_layout)
        
        self.auto_clean_check = QCheckBox("自动清理损坏的下载记录")
        self.auto_clean_check.setChecked(self.config.get('auto_clean_incomplete', False))
        self.auto_clean_check.toggled.connect(
            lambda v: self.config.set('auto_clean_incomplete', v)
        )
        cache_layout.addWidget(self.auto_clean_check)
        
        layout.addWidget(cache_group)
        
        # About section
        about_group = QGroupBox("关于")
        about_layout = QVBoxLayout(about_group)
        
        about_text = QLabel(
            "<b>HFManager</b> v0.1.1<br><br>"
            "一个简单易用的 Hugging Face 模型下载与缓存管理工具。<br><br>"
            "功能特性:<br>"
            "• 缓存可视化管理<br>"
            "• 镜像源一键切换<br>"
            "• 智能文件筛选下载<br>"
            "• hf_transfer 加速支持"
        )
        about_text.setWordWrap(True)
        about_layout.addWidget(about_text)
        
        layout.addWidget(about_group)
        
        layout.addStretch()
    
    def _on_mirror_selected(self, mirror_key: str):
        """Handle mirror selection."""
        if self.mirror_manager.switch_mirror(mirror_key):
            # Update UI
            for key, card in self.mirror_cards.items():
                if key == mirror_key:
                    card.set_current()
                else:
                    card.setStyleSheet("")
                    card.select_btn.setEnabled(True)
                    card.select_btn.setText("使用")
            
            mirror = self.mirror_manager.MIRRORS.get(mirror_key)
            QMessageBox.information(
                self, "镜像已切换",
                f"已切换到 {mirror.name}\n\n"
                f"下载地址: {mirror.url}"
            )
            
            self.mirror_changed.emit(mirror_key)
    
    def _test_mirror(self, mirror_key: str):
        """Test a single mirror."""
        card = self.mirror_cards.get(mirror_key)
        if not card:
            return
        
        card.set_testing()
        
        thread = MirrorTestThread(self.mirror_manager, mirror_key)
        thread.result.connect(self._on_mirror_test_result)
        thread.start()
        
        self._test_threads[mirror_key] = thread
    
    def _test_all_mirrors(self):
        """Test all mirrors."""
        for mirror_key in self.mirror_cards:
            self._test_mirror(mirror_key)
    
    def _on_mirror_test_result(self, mirror_key: str, result: dict):
        """Handle mirror test result."""
        card = self.mirror_cards.get(mirror_key)
        if card:
            card.set_test_result(result)
    
    def _browse_download_dir(self):
        """Browse for download directory."""
        path = QFileDialog.getExistingDirectory(
            self,
            "选择下载目录",
            self.download_dir_input.text() or str(get_cache_dir())
        )
        if path:
            self.download_dir_input.setText(path)
    
    # ========== Account/Login Methods ==========
    
    def _update_login_status(self):
        """Update the login status display."""
        if self.auth_manager.is_logged_in():
            user = self.auth_manager.get_user_info()
            if user:
                self.login_status_label.setText(f"✅ 已登录: {user.fullname} (@{user.username})")
                self.login_status_label.setStyleSheet("color: #4ade80; font-size: 13px;")
            else:
                self.login_status_label.setText("✅ 已登录")
                self.login_status_label.setStyleSheet("color: #4ade80; font-size: 13px;")
            
            self.token_widget.hide()
            self.logout_btn.show()
        else:
            self.login_status_label.setText("⚪ 未登录")
            self.login_status_label.setStyleSheet("color: #a0a0a0; font-size: 13px;")
            
            self.token_widget.show()
            self.logout_btn.hide()
    
    def _login(self):
        """Login with the provided token."""
        token = self.token_input.text().strip()
        if not token:
            QMessageBox.warning(self, "错误", "请输入 Token")
            return
        
        self.login_btn.setEnabled(False)
        self.login_btn.setText("登录中...")
        
        success, message = self.auth_manager.login_with_token(token)
        
        self.login_btn.setEnabled(True)
        self.login_btn.setText("登录")
        
        if success:
            self.token_input.clear()
            self._update_login_status()
            QMessageBox.information(self, "成功", message)
        else:
            QMessageBox.warning(self, "登录失败", message)
    
    def _logout(self):
        """Logout the current user."""
        reply = QMessageBox.question(
            self, "确认退出",
            "确定要退出登录吗？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            success, message = self.auth_manager.logout_user()
            self._update_login_status()
            if not success:
                QMessageBox.warning(self, "错误", message)
    
    def _open_token_page(self):
        """Open the HF token page in browser."""
        self.auth_manager.open_token_page()
