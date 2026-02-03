"""
Model Preview Dialog - Shows model metadata and README before download.
"""
from __future__ import annotations

from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QFrame, QScrollArea, QWidget, QTextBrowser, QSplitter,
    QTableWidget, QTableWidgetItem, QHeaderView, QProgressBar,
    QMessageBox, QTabWidget, QMenu, QTreeWidget, QTreeWidgetItem
)
from PySide6.QtCore import Qt, Signal, QThread, QSize
from PySide6.QtGui import QFont, QAction

from ..core.metadata_parser import get_metadata_parser, ModelMetadata
from ..core.downloader import get_single_file_downloader, FileDownloadStatus


class FetchMetadataThread(QThread):
    """Background thread for fetching metadata."""
    success = Signal(object)  # ModelMetadata
    error = Signal(str)
    
    def __init__(self, repo_id: str, repo_type: str = 'model'):
        super().__init__()
        self.repo_id = repo_id
        self.repo_type = repo_type
    
    def run(self):
        try:
            parser = get_metadata_parser()
            if self.repo_type == 'dataset':
                metadata = parser.get_dataset_metadata(self.repo_id)
            else:
                metadata = parser.get_model_metadata(self.repo_id)
            self.success.emit(metadata)
        except Exception as e:
            self.error.emit(str(e))


class FetchFilesThread(QThread):
    """Background thread for fetching file list with download status."""
    success = Signal(list)
    error = Signal(str)
    
    def __init__(self, repo_id: str, repo_type: str = 'model', revision: str = 'main'):
        super().__init__()
        self.repo_id = repo_id
        self.repo_type = repo_type
        self.revision = revision
    
    def run(self):
        try:
            # Use SingleFileDownloader to get file status
            downloader = get_single_file_downloader()
            file_infos = downloader.get_file_download_status(
                self.repo_id, self.repo_type, self.revision
            )
            self.success.emit(file_infos)
        except Exception as e:
            self.error.emit(str(e))


class DownloadSingleFileThread(QThread):
    """Background thread for downloading a single file."""
    finished = Signal(str)
    failed = Signal(str)
    
    def __init__(self, repo_id: str, file_path: str, repo_type: str, revision: str, local_dir: str = None, force: bool = False):
        super().__init__()
        self.repo_id = repo_id
        self.file_path = file_path
        self.repo_type = repo_type
        self.revision = revision
        self.local_dir = local_dir
        self.force = force
    
    def run(self):
        try:
            downloader = get_single_file_downloader()
            local_path = downloader.download_single_file(
                repo_id=self.repo_id,
                file_path=self.file_path,
                repo_type=self.repo_type,
                revision=self.revision,
                local_dir=self.local_dir,
                force=self.force
            )
            self.finished.emit(local_path)
        except Exception as e:
            self.failed.emit(str(e))


class InfoRow(QFrame):
    """A single row of info label + value."""
    
    def __init__(self, label: str, value: str = "", parent=None):
        super().__init__(parent)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 4, 0, 4)
        
        self.label = QLabel(f"<b>{label}:</b>")
        self.label.setFixedWidth(100)
        layout.addWidget(self.label)
        
        self.value = QLabel(value)
        self.value.setWordWrap(True)
        self.value.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        layout.addWidget(self.value, 1)
    
    def set_value(self, value: str):
        self.value.setText(value)


class ModelPreviewDialog(QDialog):
    """Dialog showing model/dataset preview before download."""
    
    download_requested = Signal(str, str, list, list)  # repo_id, revision, include, exclude
    
    def __init__(self, repo_id: str, repo_type: str = 'model', revision: str = 'main', parent=None):
        super().__init__(parent)
        self.repo_id = repo_id
        self.repo_type = repo_type
        self.revision = revision
        self.metadata: ModelMetadata = None
        self.files: list = []
        
        # Tree state tracking
        self._updating_tree = False
        self._path_to_item = {}
        self._file_path_to_info = {}
        
        self._fetch_thread: FetchMetadataThread = None
        self._files_thread: FetchFilesThread = None
        
        self.setWindowTitle(f"模型预览 - {repo_id}")
        self.setMinimumSize(900, 700)
        self.resize(1000, 750)
        
        self._setup_ui()
        self._fetch_metadata()
    
    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(12)
        
        # Header
        header_layout = QHBoxLayout()
        
        self.title_label = QLabel(f"<h2>{self.repo_id}</h2>")
        header_layout.addWidget(self.title_label)
        
        header_layout.addStretch()
        
        self.loading_label = QLabel("正在加载...")
        header_layout.addWidget(self.loading_label)
        
        layout.addLayout(header_layout)
        
        # Stats row
        stats_layout = QHBoxLayout()
        stats_layout.setSpacing(20)
        
        self.downloads_label = QLabel("⬇️ --")
        self.likes_label = QLabel("❤️ --")
        self.files_label = QLabel("📁 --")
        self.size_label = QLabel("💾 --")
        
        for lbl in [self.downloads_label, self.likes_label, self.files_label, self.size_label]:
            lbl.setStyleSheet("font-size: 14px;")
            stats_layout.addWidget(lbl)
        
        stats_layout.addStretch()
        layout.addLayout(stats_layout)
        
        # Tabs
        self.tabs = QTabWidget()
        
        # Tab 1: Info
        info_widget = QWidget()
        info_layout = QVBoxLayout(info_widget)
        
        self.pipeline_row = InfoRow("Pipeline")
        self.library_row = InfoRow("框架")
        self.license_row = InfoRow("许可证")
        self.base_model_row = InfoRow("基础模型")
        self.languages_row = InfoRow("语言")
        self.tags_row = InfoRow("标签")
        
        for row in [self.pipeline_row, self.library_row, self.license_row, 
                    self.base_model_row, self.languages_row, self.tags_row]:
            info_layout.addWidget(row)
        
        info_layout.addStretch()
        self.tabs.addTab(info_widget, "📋 信息")
        
        # Tab 2: README
        readme_widget = QWidget()
        readme_layout = QVBoxLayout(readme_widget)
        readme_layout.setContentsMargins(0, 0, 0, 0)
        
        self.readme_browser = QTextBrowser()
        self.readme_browser.setOpenExternalLinks(True)
        self.readme_browser.setStyleSheet("""
            QTextBrowser {
                background-color: #16213e;
                border: none;
                padding: 16px;
            }
        """)
        readme_layout.addWidget(self.readme_browser)
        self.tabs.addTab(readme_widget, "📖 README")
        
        # Tab 3: Files (Tree View)
        files_widget = QWidget()
        files_layout = QVBoxLayout(files_widget)
        files_layout.setContentsMargins(0, 0, 0, 0)
        
        # Selection controls
        controls_row = QHBoxLayout()
        
        self.select_all_btn = QPushButton("全选")
        self.select_all_btn.setObjectName("secondary")
        self.select_all_btn.clicked.connect(self._select_all_files)
        controls_row.addWidget(self.select_all_btn)
        
        self.deselect_all_btn = QPushButton("取消全选")
        self.deselect_all_btn.setObjectName("secondary")
        self.deselect_all_btn.clicked.connect(self._deselect_all_files)
        controls_row.addWidget(self.deselect_all_btn)
        
        self.selection_label = QLabel("已选择: 0 个文件")
        self.selection_label.setStyleSheet("color: #a0a0a0;")
        controls_row.addWidget(self.selection_label)
        controls_row.addStretch()
        
        files_layout.addLayout(controls_row)
        
        # Tree widget
        self.files_tree = QTreeWidget()
        self.files_tree.setHeaderLabels(["文件/文件夹", "大小", "状态"])
        self.files_tree.setColumnWidth(0, 400)
        self.files_tree.setColumnWidth(1, 100)
        self.files_tree.setColumnWidth(2, 80)
        self.files_tree.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.files_tree.customContextMenuRequested.connect(self._show_file_context_menu)
        self.files_tree.itemChanged.connect(self._on_tree_item_changed)
        
        files_layout.addWidget(self.files_tree)
        self.tabs.addTab(files_widget, "📁 文件列表")
        
        layout.addWidget(self.tabs, 1)
        
        # Bottom buttons
        buttons_layout = QHBoxLayout()
        
        self.refresh_btn = QPushButton("🔄 刷新")
        self.refresh_btn.setObjectName("secondary")
        self.refresh_btn.clicked.connect(self._fetch_metadata)
        buttons_layout.addWidget(self.refresh_btn)
        
        buttons_layout.addStretch()
        
        cancel_btn = QPushButton("取消")
        cancel_btn.setObjectName("secondary")
        cancel_btn.clicked.connect(self.reject)
        buttons_layout.addWidget(cancel_btn)
        
        self.download_btn = QPushButton("⬇️ 下载")
        self.download_btn.setEnabled(False)
        self.download_btn.clicked.connect(self._on_download)
        buttons_layout.addWidget(self.download_btn)
        
        layout.addLayout(buttons_layout)
    
    def _fetch_metadata(self):
        """Fetch metadata in background."""
        self.loading_label.setText("正在加载元数据...")
        self.loading_label.show()
        
        self._fetch_thread = FetchMetadataThread(self.repo_id, self.repo_type)
        self._fetch_thread.success.connect(self._on_metadata_loaded)
        self._fetch_thread.error.connect(self._on_metadata_error)
        self._fetch_thread.start()
        
        # Also fetch files
        self._files_thread = FetchFilesThread(self.repo_id, self.repo_type, self.revision)
        self._files_thread.success.connect(self._on_files_loaded)
        self._files_thread.error.connect(self._on_files_error)
        self._files_thread.start()
    
    def _on_metadata_loaded(self, metadata: ModelMetadata):
        """Handle metadata loaded."""
        self.metadata = metadata
        self.loading_label.hide()
        self.download_btn.setEnabled(True)
        
        # Update stats
        self.downloads_label.setText(f"⬇️ {self._format_number(metadata.downloads)}")
        self.likes_label.setText(f"❤️ {metadata.likes}")
        self.files_label.setText(f"📁 {metadata.files_count} 文件")
        self.size_label.setText(f"💾 {metadata.size_formatted}")
        
        # Update info
        self.pipeline_row.set_value(metadata.pipeline_tag or "-")
        self.library_row.set_value(metadata.library_name or "-")
        self.license_row.set_value(metadata.license or "-")
        self.base_model_row.set_value(metadata.base_model or "-")
        self.languages_row.set_value(", ".join(metadata.languages) if metadata.languages else "-")
        self.tags_row.set_value(", ".join(metadata.tags[:10]) if metadata.tags else "-")
        
        # Update README
        if metadata.readme_html:
            self.readme_browser.setHtml(f"""
                <style>
                    body {{ color: #eaeaea; font-family: 'Segoe UI', sans-serif; }}
                    h1, h2, h3 {{ color: #e94560; }}
                    a {{ color: #4ade80; }}
                    code {{ background-color: #2a2a4a; padding: 2px 6px; border-radius: 4px; }}
                    pre {{ background-color: #2a2a4a; padding: 12px; border-radius: 8px; overflow-x: auto; }}
                    table {{ border-collapse: collapse; }}
                    th, td {{ border: 1px solid #3a3a5a; padding: 8px; }}
                </style>
                {metadata.readme_html}
            """)
        else:
            self.readme_browser.setPlainText("无 README 内容")
    
    def _on_metadata_error(self, error: str):
        """Handle metadata fetch error."""
        self.loading_label.setText(f"加载失败: {error}")
        self.loading_label.setStyleSheet("color: #ef4444;")
    
    def _on_files_error(self, error: str):
        """Handle file list fetch error."""
        # Show error in files tree area
        from PySide6.QtWidgets import QTreeWidgetItem
        self.files_tree.clear()
        error_item = QTreeWidgetItem(self.files_tree)
        error_item.setText(0, f"❌ 加载文件列表失败: {error}")
        error_item.setForeground(0, Qt.GlobalColor.red)
        print(f"File list error: {error}")  # Debug output
    
    
    def _on_files_loaded(self, files: list):
        """Handle files list loaded with download status - build tree structure."""
        self.files = files
        self._updating_tree = True  # Prevent cascade during building
        self.files_tree.clear()
        
        # Build tree structure: {path: {'item': QTreeWidgetItem, 'children': {...}}}
        self._path_to_item = {}  # Maps file path to tree item
        self._file_path_to_info = {}  # Maps file path to file_info
        
        for file_info in files:
            self._file_path_to_info[file_info.path] = file_info
            parts = file_info.path.split('/')
            current_parent = None
            current_path = ""
            
            for i, part in enumerate(parts):
                current_path = '/'.join(parts[:i+1])
                is_file = (i == len(parts) - 1)
                
                if current_path not in self._path_to_item:
                    # Create new tree item
                    item = QTreeWidgetItem()
                    item.setFlags(item.flags() | Qt.ItemFlag.ItemIsUserCheckable)
                    item.setCheckState(0, Qt.CheckState.Unchecked)
                    
                    if is_file:
                        # It's a file
                        icon = "📄"
                        status_icon = self._get_status_icon(file_info.status)
                        item.setText(0, f"{icon} {part}")
                        item.setText(1, file_info.size_formatted)
                        item.setText(2, status_icon)
                        item.setData(0, Qt.ItemDataRole.UserRole, file_info.path)  # Store file path
                    else:
                        # It's a folder
                        item.setText(0, f"📁 {part}")
                        item.setText(1, "")  # Folder has no direct size
                        item.setText(2, "")
                        item.setData(0, Qt.ItemDataRole.UserRole, None)  # No file path for folders
                    
                    if current_parent is None:
                        self.files_tree.addTopLevelItem(item)
                    else:
                        current_parent.addChild(item)
                    
                    self._path_to_item[current_path] = item
                    current_parent = item
                else:
                    current_parent = self._path_to_item[current_path]
        
        # Expand all items
        self.files_tree.expandAll()
        self._updating_tree = False
        self._update_selection_label()
    
    def _on_tree_item_changed(self, item, column):
        """Handle checkbox state changes with parent-child cascade."""
        if self._updating_tree:
            return
        
        if column == 0:  # Checkbox column
            self._updating_tree = True
            check_state = item.checkState(0)
            
            # Cascade to children
            self._set_children_state(item, check_state)
            
            # Update parent state
            parent = item.parent()
            while parent:
                self._update_parent_state(parent)
                parent = parent.parent()
            
            self._updating_tree = False
            self._update_selection_label()
    
    def _set_children_state(self, item, state):
        """Recursively set check state for all children."""
        for i in range(item.childCount()):
            child = item.child(i)
            child.setCheckState(0, state)
            self._set_children_state(child, state)
    
    def _update_parent_state(self, parent):
        """Update parent state based on children states."""
        checked_count = 0
        unchecked_count = 0
        partial_count = 0
        
        for i in range(parent.childCount()):
            child_state = parent.child(i).checkState(0)
            if child_state == Qt.CheckState.Checked:
                checked_count += 1
            elif child_state == Qt.CheckState.Unchecked:
                unchecked_count += 1
            else:
                partial_count += 1
        
        if partial_count > 0 or (checked_count > 0 and unchecked_count > 0):
            parent.setCheckState(0, Qt.CheckState.PartiallyChecked)
        elif checked_count > 0:
            parent.setCheckState(0, Qt.CheckState.Checked)
        else:
            parent.setCheckState(0, Qt.CheckState.Unchecked)
    
    def _select_all_files(self):
        """Select all files in the tree."""
        self._updating_tree = True
        for i in range(self.files_tree.topLevelItemCount()):
            item = self.files_tree.topLevelItem(i)
            item.setCheckState(0, Qt.CheckState.Checked)
            self._set_children_state(item, Qt.CheckState.Checked)
        self._updating_tree = False
        self._update_selection_label()
    
    def _deselect_all_files(self):
        """Deselect all files in the tree."""
        self._updating_tree = True
        for i in range(self.files_tree.topLevelItemCount()):
            item = self.files_tree.topLevelItem(i)
            item.setCheckState(0, Qt.CheckState.Unchecked)
            self._set_children_state(item, Qt.CheckState.Unchecked)
        self._updating_tree = False
        self._update_selection_label()
    
    def _get_selected_files(self) -> list:
        """Get list of selected file paths."""
        selected = []
        
        def collect_checked(item):
            file_path = item.data(0, Qt.ItemDataRole.UserRole)
            if file_path and item.checkState(0) == Qt.CheckState.Checked:
                selected.append(file_path)
            for i in range(item.childCount()):
                collect_checked(item.child(i))
        
        for i in range(self.files_tree.topLevelItemCount()):
            collect_checked(self.files_tree.topLevelItem(i))
        
        return selected
    
    def _update_selection_label(self):
        """Update the selection count label."""
        selected = self._get_selected_files()
        count = len(selected)
        total_size = sum(
            self._file_path_to_info[path].size 
            for path in selected 
            if path in self._file_path_to_info
        )
        
        # Format size
        if total_size < 1024:
            size_str = f"{total_size} B"
        elif total_size < 1024 * 1024:
            size_str = f"{total_size / 1024:.1f} KB"
        elif total_size < 1024 * 1024 * 1024:
            size_str = f"{total_size / (1024*1024):.1f} MB"
        else:
            size_str = f"{total_size / (1024*1024*1024):.2f} GB"
        
        self.selection_label.setText(f"已选择: {count} 个文件 ({size_str})")
    
    def _get_status_icon(self, status: FileDownloadStatus) -> str:
        """Get icon for file download status."""
        icons = {
            FileDownloadStatus.NOT_STARTED: "⭕",
            FileDownloadStatus.DOWNLOADING: "⏳",
            FileDownloadStatus.COMPLETED: "✅",
            FileDownloadStatus.FAILED: "❌",
            FileDownloadStatus.INCOMPLETE: "⚠️"
        }
        return icons.get(status, "❓")
    
    def _show_file_context_menu(self, position):
        """Show context menu for file operations."""
        item = self.files_tree.itemAt(position)
        if not item:
            return
        
        # Get file path from item data
        file_path = item.data(0, Qt.ItemDataRole.UserRole)
        if not file_path or file_path not in self._file_path_to_info:
            return  # It's a folder, not a file
        
        file_info = self._file_path_to_info[file_path]
        menu = QMenu(self)
        
        # Download single file action
        if file_info.status == FileDownloadStatus.NOT_STARTED:
            download_action = QAction("⬇️ 下载此文件", self)
            download_action.triggered.connect(lambda: self._download_single_file(file_info))
            menu.addAction(download_action)
        
        # Re-download action
        if file_info.status in [FileDownloadStatus.COMPLETED, FileDownloadStatus.INCOMPLETE, FileDownloadStatus.FAILED]:
            redownload_action = QAction("🔄 重新下载", self)
            redownload_action.triggered.connect(lambda: self._download_single_file(file_info, force=True))
            menu.addAction(redownload_action)
        
        # Open local file action
        if file_info.status == FileDownloadStatus.COMPLETED and file_info.local_path:
            open_action = QAction("📂 打开文件位置", self)
            open_action.triggered.connect(lambda: self._open_file_location(file_info.local_path))
            menu.addAction(open_action)
        
        if menu.actions():
            menu.exec(self.files_tree.viewport().mapToGlobal(position))
    
    def _download_single_file(self, file_info, force=False):
        """Download a single file asynchronously."""
        reply = QMessageBox.question(
            self, "确认下载",
            f"确认{'重新' if force else ''}下载文件:\n{file_info.path}\n\n大小: {file_info.size_formatted}",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            # Get custom download directory from config
            from ..utils.config import get_config
            config = get_config()
            custom_dir = config.get('download_dir', '').strip()
            local_dir = custom_dir if custom_dir else None
            
            # Show non-blocking progress notification
            self.loading_label.setText(f"正在下载 {file_info.name}...")
            self.loading_label.show()
            self.setEnabled(False)  # Disable dialog during background download
            
            self._download_thread = DownloadSingleFileThread(
                repo_id=self.repo_id,
                file_path=file_info.path,
                repo_type=self.repo_type,
                revision=self.revision,
                local_dir=local_dir,
                force=force
            )
            self._download_thread.finished.connect(lambda path: self._on_single_download_finished(path, file_info.name))
            self._download_thread.failed.connect(self._on_single_download_failed)
            self._download_thread.start()
            
    def _on_single_download_finished(self, local_path: str, filename: str):
        """Handle single file download success."""
        self.setEnabled(True)
        self.loading_label.hide()
        QMessageBox.information(self, "下载完成", f"文件 {filename} 已下载到:\n{local_path}")
        
        # Refresh file list
        self._files_thread = FetchFilesThread(self.repo_id, self.repo_type, self.revision)
        self._files_thread.success.connect(self._on_files_loaded)
        self._files_thread.start()
        
    def _on_single_download_failed(self, error: str):
        """Handle single file download failure."""
        self.setEnabled(True)
        self.loading_label.hide()
        QMessageBox.critical(self, "下载失败", f"文件下载失败: {error}")
    
    def _open_file_location(self, file_path: str):
        """Open file location in explorer."""
        import subprocess
        import platform
        from pathlib import Path
        
        folder = str(Path(file_path).parent)
        
        system = platform.system()
        if system == 'Windows':
            subprocess.Popen(['explorer', '/select,', file_path])
        elif system == 'Darwin':  # macOS
            subprocess.Popen(['open', '-R', file_path])
        else:  # Linux
            subprocess.Popen(['xdg-open', folder])
    
    def _format_number(self, num: int) -> str:
        """Format large numbers with K/M suffix."""
        if num >= 1_000_000:
            return f"{num / 1_000_000:.1f}M"
        elif num >= 1_000:
            return f"{num / 1_000:.1f}K"
        return str(num)
    
    def _on_download(self):
        """Handle download button click - download selected or all files."""
        selected_files = self._get_selected_files()
        
        if selected_files:
            # Download only selected files using allow_patterns
            self.download_requested.emit(self.repo_id, self.revision, selected_files, [])
        else:
            # No selection, ask if user wants to download all
            reply = QMessageBox.question(
                self, "下载确认",
                "未选择任何文件。是否下载全部文件？",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
            )
            if reply == QMessageBox.StandardButton.Yes:
                self.download_requested.emit(self.repo_id, self.revision, [], [])
            else:
                return  # Don't close dialog
        
        self.accept()
