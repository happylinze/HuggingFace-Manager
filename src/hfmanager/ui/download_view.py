"""
Download View - Interface for downloading models and datasets.
Supports filtering, queue management, and progress tracking.
"""
from __future__ import annotations

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QLineEdit, QComboBox, QGroupBox, QCheckBox, QFrame,
    QTableWidget, QTableWidgetItem, QHeaderView, QProgressBar,
    QSplitter, QTextEdit, QMessageBox, QFileDialog
)
from PySide6.QtCore import Qt, Signal, QThread
from PySide6.QtGui import QFont

from ..core.downloader import HFDownloader, DownloadTask, DownloadStatus
from ..core.mirror_manager import get_mirror_manager
from ..utils.system import format_size


class DownloadThread(QThread):
    """Background thread for downloads."""
    progress_updated = Signal(object)  # DownloadTask
    completed = Signal(str, str)  # task_id, result_path
    failed = Signal(str, str)  # task_id, error
    
    def __init__(self, downloader: HFDownloader, task_id: str):
        super().__init__()
        self.downloader = downloader
        self.task_id = task_id
    
    def run(self):
        self.downloader.start_download(self.task_id)
        
        # Poll for completion
        import time
        while True:
            task = self.downloader.get_task(self.task_id)
            if not task:
                break
            
            if task.status == DownloadStatus.COMPLETED:
                self.completed.emit(self.task_id, task.result_path or "")
                break
            elif task.status == DownloadStatus.FAILED:
                self.failed.emit(self.task_id, task.error_message or "Unknown error")
                break
            elif task.status == DownloadStatus.CANCELLED:
                break
            elif task.status == DownloadStatus.PAUSED:
                # Exit polling loop when paused, thread will be restarted on resume
                break
            
            self.progress_updated.emit(task)
            time.sleep(0.2)  # More frequent polling for smoothness


class SearchThread(QThread):
    """Background thread for repository search."""
    results_found = Signal(list)  # List of (repo_id, repo_type) tuples
    error = Signal(str)
    
    def __init__(self, query: str):
        super().__init__()
        self.query = query
    
    def run(self):
        try:
            from huggingface_hub import HfApi
            api = HfApi()
            
            results = []
            
            # Check if query looks like a full repo ID (contains '/')
            if '/' in self.query:
                # Might be a full ID, try to fetch directly first
                try:
                    # Try as model
                    model_info = api.model_info(self.query)
                    results.append((self.query, 'model'))
                except:
                    pass
                    
                try:
                    # Try as dataset
                    dataset_info = api.dataset_info(self.query)
                    results.append((self.query, 'dataset'))
                except:
                    pass
            
            # Also do fuzzy search if no exact match or always for partial queries
            if len(results) == 0 or '/' not in self.query:
                # Search models
                try:
                    model_results = api.list_models(search=self.query, limit=5, sort="downloads", direction=-1)
                    for r in model_results:
                        if (r.id, 'model') not in results:
                            results.append((r.id, 'model'))
                except:
                    pass
                
                # Search datasets
                try:
                    dataset_results = api.list_datasets(search=self.query, limit=5, sort="downloads", direction=-1)
                    for r in dataset_results:
                        if (r.id, 'dataset') not in results:
                            results.append((r.id, 'dataset'))
                except:
                    pass
            
            self.results_found.emit(results)
        except Exception as e:
            self.error.emit(str(e))


class FilterPresetButton(QPushButton):
    """Checkbox-style button for filter presets."""
    
    def __init__(self, text: str, preset_key: str, parent=None):
        super().__init__(text, parent)
        self.preset_key = preset_key
        self.setCheckable(True)
        self.setObjectName("secondary")


class DownloadView(QWidget):
    """Main download interface."""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.downloader = HFDownloader()
        self.mirror_manager = get_mirror_manager()
        self._download_threads: dict[str, DownloadThread] = {}
        
        self._setup_ui()
        
        # Load saved queue
        loaded_count = self.downloader.load_queue()
        if loaded_count > 0:
            # Add loaded tasks to UI
            for task in self.downloader.get_all_tasks():
                self._add_task_to_table(task.id)
    
    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        layout.setContentsMargins(20, 20, 20, 20)
        
        # Header
        header = QLabel("模型下载")
        header.setObjectName("title")
        layout.addWidget(header)
        
        # Main content
        splitter = QSplitter(Qt.Orientation.Vertical)
        
        # Top: Input section
        input_widget = QWidget()
        input_layout = QVBoxLayout(input_widget)
        input_layout.setContentsMargins(0, 0, 0, 0)
        
        # Repository input
        repo_group = QGroupBox("仓库信息")
        repo_layout = QVBoxLayout(repo_group)
        
        # Search/Input row
        search_row = QHBoxLayout()
        search_label = QLabel("搜索/输入:")
        search_label.setFixedWidth(80)
        search_row.addWidget(search_label)
        
        self.repo_input = QLineEdit()
        self.repo_input.setPlaceholderText("输入仓库ID (如: meta-llama/Llama-2-7b-hf) 或 关键词搜索")
        self.repo_input.returnPressed.connect(self._search_repos)
        search_row.addWidget(self.repo_input)
        
        self.repo_type_combo = QComboBox()
        self.repo_type_combo.addItems(["模型", "数据集", "Space"])
        self.repo_type_combo.setFixedWidth(100)
        search_row.addWidget(self.repo_type_combo)
        
        self.search_btn = QPushButton("🔍 搜索")
        self.search_btn.setObjectName("secondary")
        self.search_btn.clicked.connect(self._search_repos)
        search_row.addWidget(self.search_btn)
        
        repo_layout.addLayout(search_row)
        
        # Revision input
        rev_row = QHBoxLayout()
        rev_label = QLabel("分支/版本:")
        rev_label.setFixedWidth(80)
        rev_row.addWidget(rev_label)
        
        self.revision_input = QLineEdit()
        self.revision_input.setPlaceholderText("main (默认)")
        self.revision_input.setText("main")
        rev_row.addWidget(self.revision_input)
        
        # Fetch files button
        self.fetch_btn = QPushButton("获取文件列表")
        self.fetch_btn.setObjectName("secondary")
        self.fetch_btn.clicked.connect(self._fetch_files)
        rev_row.addWidget(self.fetch_btn)
        
        repo_layout.addLayout(rev_row)
        input_layout.addWidget(repo_group)
        
        # Filter options
        filter_group = QGroupBox("文件筛选 (快速预设)")
        filter_layout = QVBoxLayout(filter_group)
        
        presets_row = QHBoxLayout()
        
        self.preset_safetensors = FilterPresetButton("仅 Safetensors", "safetensors_only")
        self.preset_gguf = FilterPresetButton("仅 GGUF", "gguf_only")
        self.preset_no_pytorch = FilterPresetButton("排除 PyTorch", "no_pytorch")
        self.preset_config = FilterPresetButton("仅配置文件", "config_only")
        
        presets_row.addWidget(self.preset_safetensors)
        presets_row.addWidget(self.preset_gguf)
        presets_row.addWidget(self.preset_no_pytorch)
        presets_row.addWidget(self.preset_config)
        presets_row.addStretch()
        
        filter_layout.addLayout(presets_row)
        
        # Custom patterns
        custom_row = QHBoxLayout()
        custom_row.addWidget(QLabel("包含:"))
        self.include_input = QLineEdit()
        self.include_input.setPlaceholderText("*.safetensors, *.json (逗号分隔)")
        custom_row.addWidget(self.include_input)
        
        custom_row.addWidget(QLabel("排除:"))
        self.exclude_input = QLineEdit()
        self.exclude_input.setPlaceholderText("*.bin, *.ckpt (逗号分隔)")
        custom_row.addWidget(self.exclude_input)
        
        filter_layout.addLayout(custom_row)
        input_layout.addWidget(filter_group)
        
        # Download options
        options_row = QHBoxLayout()
        
        self.hf_transfer_check = QCheckBox("启用 hf_transfer 加速")
        self.hf_transfer_check.setChecked(True)
        options_row.addWidget(self.hf_transfer_check)
        
        options_row.addStretch()
        
        # Download button
        self.download_btn = QPushButton("⬇️ 开始下载")
        self.download_btn.setFixedWidth(160)
        self.download_btn.clicked.connect(self._start_download)
        options_row.addWidget(self.download_btn)
        
        input_layout.addLayout(options_row)
        
        splitter.addWidget(input_widget)
        
        # Bottom: Download queue
        queue_widget = QWidget()
        queue_layout = QVBoxLayout(queue_widget)
        queue_layout.setContentsMargins(0, 0, 0, 0)
        
        queue_header = QHBoxLayout()
        queue_header.addWidget(QLabel("下载队列"))
        
        clear_btn = QPushButton("清除已完成")
        clear_btn.setObjectName("secondary")
        clear_btn.clicked.connect(self._clear_completed)
        queue_header.addStretch()
        queue_header.addWidget(clear_btn)
        
        queue_layout.addLayout(queue_header)
        
        self.queue_table = QTableWidget()
        self.queue_table.setColumnCount(7)
        self.queue_table.setHorizontalHeaderLabels(["仓库", "状态", "进度", "速度", "大小", "当前文件", "操作"])
        self.queue_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.queue_table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        self.queue_table.horizontalHeader().resizeSection(2, 120)
        self.queue_table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.Fixed)
        self.queue_table.horizontalHeader().resizeSection(3, 100)
        self.queue_table.horizontalHeader().setSectionResizeMode(5, QHeaderView.ResizeMode.Stretch)
        # Action column - fixed width for dual buttons
        self.queue_table.horizontalHeader().setSectionResizeMode(6, QHeaderView.ResizeMode.Fixed)
        self.queue_table.horizontalHeader().resizeSection(6, 150)
        self.queue_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        
        queue_layout.addWidget(self.queue_table)
        
        splitter.addWidget(queue_widget)
        splitter.setSizes([400, 300])
        
        layout.addWidget(splitter, 1)
    
    def _get_repo_type(self) -> str:
        """Get repository type from combo box."""
        index = self.repo_type_combo.currentIndex()
        return ['model', 'dataset', 'space'][index]
    
    def _get_selected_preset(self) -> str:
        """Get selected filter preset."""
        if self.preset_safetensors.isChecked():
            return 'safetensors_only'
        elif self.preset_gguf.isChecked():
            return 'gguf_only'
        elif self.preset_no_pytorch.isChecked():
            return 'no_pytorch'
        elif self.preset_config.isChecked():
            return 'config_only'
        return None
    
    def _parse_patterns(self, text: str) -> list[str]:
        """Parse comma-separated patterns."""
        if not text.strip():
            return []
        return [p.strip() for p in text.split(',') if p.strip()]
    
    def _fetch_files(self):
        """Fetch files for the current repo."""
        repo_id = self.repo_input.text().strip()
        if not repo_id:
            QMessageBox.warning(self, "错误", "请输入仓库 ID")
            return
        
        repo_type = self._get_repo_type()
        revision = self.revision_input.text().strip() or "main"
        
        from .preview_dialog import ModelPreviewDialog
        dialog = ModelPreviewDialog(repo_id, repo_type, revision, self)
        dialog.download_requested.connect(self._on_preview_download_requested)
        dialog.exec()
    
    def _search_repos(self):
        """Search for repositories."""
        query = self.repo_input.text().strip()
        if not query:
            return
        
        self.search_btn.setEnabled(False)
        self.search_btn.setText("🔍 搜索中...")
        
        self._search_thread = SearchThread(query)
        self._search_thread.results_found.connect(self._on_search_results)
        self._search_thread.error.connect(self._on_search_error)
        self._search_thread.start()
    
    def _on_search_results(self, results: list):
        """Handle search results (list of (repo_id, repo_type) tuples)."""
        self.search_btn.setEnabled(True)
        self.search_btn.setText("🔍 搜索")
        
        if not results:
            # If no results but looks like a full ID, just let them fetch
            if '/' in self.repo_input.text():
                self._fetch_files()
            else:
                QMessageBox.information(self, "搜索结果", "未找到匹配的仓库")
            return
            
        # Create a menu of results
        from PySide6.QtWidgets import QMenu
        from PySide6.QtGui import QAction
        
        menu = QMenu(self)
        for repo_id, repo_type in results:
            # Add type indicator to display
            type_icon = "🤖" if repo_type == 'model' else "📁" if repo_type == 'dataset' else "🚀"
            action = QAction(f"{type_icon} {repo_id}", self)
            action.triggered.connect(lambda checked=False, r=repo_id, t=repo_type: self._select_repo(r, t))
            menu.addAction(action)
            
        # Show menu below repo_input
        menu.exec(self.repo_input.mapToGlobal(self.repo_input.rect().bottomLeft()))
    
    def _on_search_error(self, error: str):
        """Handle search error."""
        self.search_btn.setEnabled(True)
        self.search_btn.setText("🔍 搜索")
        QMessageBox.warning(self, "搜索出错", f"无法完成搜索: {error}")
    
    def _select_repo(self, repo_id: str, repo_type: str):
        """Select a repo from search results."""
        self.repo_input.setText(repo_id)
        
        # Auto-select the correct type
        type_map = {'model': 0, 'dataset': 1, 'space': 2}
        if repo_type in type_map:
            self.repo_type_combo.setCurrentIndex(type_map[repo_type])
        
        # Automatically fetch files after selection
        self._fetch_files()
    
    def _on_preview_download_requested(self, repo_id: str, revision: str, include: list, exclude: list):
        """Handle download request from preview dialog."""
        self.repo_input.setText(repo_id)
        self.revision_input.setText(revision)
        # Pass the selected files as include patterns
        self._start_download(include_patterns=include, exclude_patterns=exclude)
    
    def _start_download(self, include_patterns: list = None, exclude_patterns: list = None):
        """Start a new download.
        
        Args:
            include_patterns: Optional include patterns from preview dialog (selected files)
            exclude_patterns: Optional exclude patterns from preview dialog
        """
        repo_id = self.repo_input.text().strip()
        if not repo_id:
            QMessageBox.warning(self, "错误", "请输入仓库 ID")
            return
        
        revision = self.revision_input.text().strip() or 'main'
        repo_type = self._get_repo_type()
        
        # Use passed patterns or fall back to input fields
        if include_patterns is None:
            include_patterns = self._parse_patterns(self.include_input.text())
        if exclude_patterns is None:
            exclude_patterns = self._parse_patterns(self.exclude_input.text())
        preset = self._get_selected_preset()
        
        # Get custom download directory from config
        from ..utils.config import get_config
        config = get_config()
        custom_dir = config.get('download_dir', '').strip()
        local_dir = custom_dir if custom_dir else None
        
        # Queue the download
        task_id = self.downloader.queue_download(
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
            include_patterns=include_patterns,
            exclude_patterns=exclude_patterns,
            preset=preset,
            local_dir=local_dir
        )
        
        # Add to table
        self._add_task_to_table(task_id)
        
        # Start download thread
        thread = DownloadThread(self.downloader, task_id)
        thread.progress_updated.connect(self._on_progress_updated)
        thread.completed.connect(self._on_download_completed)
        thread.failed.connect(self._on_download_failed)
        thread.start()
        
        self._download_threads[task_id] = thread
    
    def _add_task_to_table(self, task_id: str):
        """Add a task to the queue table."""
        task = self.downloader.get_task(task_id)
        if not task:
            return
        
        row = self.queue_table.rowCount()
        self.queue_table.insertRow(row)
        
        # Repo ID - show file count if partial download
        repo_text = task.repo_id
        if task.include_patterns:
            file_count = len(task.include_patterns)
            repo_text = f"{task.repo_id} ({file_count}个文件)"
        repo_item = QTableWidgetItem(repo_text)
        repo_item.setToolTip(f"仓库: {task.repo_id}\n选中文件: {len(task.include_patterns) if task.include_patterns else '全部'}")
        self.queue_table.setItem(row, 0, repo_item)
        
        # Status
        status_item = QTableWidgetItem("等待中")
        self.queue_table.setItem(row, 1, status_item)
        
        # Progress (text percentage instead of bar)
        progress_item = QTableWidgetItem("0%")
        progress_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
        self.queue_table.setItem(row, 2, progress_item)
        
        # Size - show "待计算" instead of "-"
        size_text = "待计算" if not task.include_patterns else f"{len(task.include_patterns)}个文件"
        self.queue_table.setItem(row, 4, QTableWidgetItem(size_text))
        
        # Speed
        self.queue_table.setItem(row, 3, QTableWidgetItem("-"))
        
        # Current File
        self.queue_table.setItem(row, 5, QTableWidgetItem("-"))
        
        # Dual button layout: [Action] [Cancel/Open]
        self._update_task_buttons(row, task)
        
        # Store task_id in first column
        self.queue_table.item(row, 0).setData(Qt.ItemDataRole.UserRole, task_id)
    
    def _find_task_row(self, task_id: str) -> int:
        """Find table row for a task."""
        for row in range(self.queue_table.rowCount()):
            item = self.queue_table.item(row, 0)
            if item and item.data(Qt.ItemDataRole.UserRole) == task_id:
                return row
        return -1
    
    def _on_progress_updated(self, task: DownloadTask):
        """Handle progress update."""
        row = self._find_task_row(task.id)
        if row < 0:
            return
        
        # Status
        self.queue_table.item(row, 1).setText("下载中")
        
        # Progress - show percentage text
        progress_item = self.queue_table.item(row, 2)
        if progress_item:
            if task.progress > 0:
                progress_item.setText(f"{int(task.progress)}%")
            else:
                progress_item.setText("0%")
        
        # Speed - use available data or show "-"
        speed_text = task.speed_formatted if task.speed > 0 else "-"
        self.queue_table.item(row, 3).setText(speed_text)
        
        # Size
        if task.total_size > 0:
            size_text = f"{format_size(task.downloaded_size)} / {format_size(task.total_size)}"
        else:
            size_text = "准备中..."
        self.queue_table.item(row, 4).setText(size_text)
        
        # Current file - show meaningful status
        if task.current_file:
            file_text = task.current_file
        elif task.status == DownloadStatus.DOWNLOADING:
            file_text = "正在下载文件..."
        else:
            file_text = "准备下载..."
        self.queue_table.item(row, 5).setText(file_text)
        
        # Update buttons based on current status
        self._update_task_buttons(row, task)

    def _on_download_completed(self, task_id: str, result_path: str):
        """Handle download completion."""
        row = self._find_task_row(task_id)
        if row < 0:
            return
        
        self.queue_table.item(row, 1).setText("✓ 完成")
        self.queue_table.item(row, 3).setText("-")  # Reset speed
        self.queue_table.item(row, 5).setText("✅ 全部完成")
        
        # Update progress to 100%
        progress_item = self.queue_table.item(row, 2)
        if progress_item:
            progress_item.setText("100%")
        
        # Update buttons to show open button
        task = self.downloader.get_task(task_id)
        if task:
            self._update_task_buttons(row, task)
    
    def _on_download_failed(self, task_id: str, error: str):
        """Handle download failure."""
        row = self._find_task_row(task_id)
        if row < 0:
            return
        
        self.queue_table.item(row, 1).setText("✗ 失败")
        
        # Show error in current file column for debugging
        self.queue_table.item(row, 5).setText(f"错误: {error[:50]}...")
        
        # Show error in tooltip
        self.queue_table.item(row, 1).setToolTip(error)
        
        # Update buttons to show retry button
        task = self.downloader.get_task(task_id)
        if task:
            self._update_task_buttons(row, task)
    
    def _cancel_download(self, task_id: str):
        """Cancel a download."""
        self.downloader.cancel_download(task_id)
        
        row = self._find_task_row(task_id)
        if row >= 0:
            self.queue_table.item(row, 1).setText("已取消")
    
    def _clear_completed(self):
        """Clear completed downloads from queue."""
        self.downloader.clear_completed()
        
        # Remove from table
        rows_to_remove = []
        for row in range(self.queue_table.rowCount()):
            status = self.queue_table.item(row, 1).text()
            if status.startswith("✓") or status.startswith("✗") or status == "已取消":
                rows_to_remove.append(row)
        
        for row in reversed(rows_to_remove):
            self.queue_table.removeRow(row)
    
    def _open_result(self, path: str):
        """Open download result folder."""
        from ..utils.system import open_folder_in_explorer
        from pathlib import Path
        
        if not open_folder_in_explorer(Path(path)):
            QMessageBox.warning(self, "错误", f"无法打开目录: {path}")
    
    def _update_task_buttons(self, row: int, task):
        """Update the buttons based on task status (dual-button layout)."""
        from ..core.downloader import DownloadStatus
        
        # Create container widget with horizontal layout
        container = QWidget()
        layout = QHBoxLayout(container)
        layout.setContentsMargins(2, 2, 2, 2)
        layout.setSpacing(4)
        
        task_id = task.id
        
        # First button: Action (Start/Pause/Resume/Retry)
        if task.status == DownloadStatus.DOWNLOADING:
            action_btn = QPushButton("⏸️暂停")
            action_btn.clicked.connect(lambda: self._pause_download(task_id))
        elif task.status == DownloadStatus.PAUSED:
            action_btn = QPushButton("▶️继续")
            action_btn.clicked.connect(lambda: self._resume_download(task_id))
        elif task.status == DownloadStatus.PENDING:
            action_btn = QPushButton("▶️开始")
            action_btn.clicked.connect(lambda: self._resume_download(task_id))
        elif task.status == DownloadStatus.FAILED:
            action_btn = QPushButton("🔄重试")
            action_btn.clicked.connect(lambda: self._resume_download(task_id))
        elif task.status == DownloadStatus.COMPLETED:
            action_btn = QPushButton("📂打开")
            action_btn.clicked.connect(lambda: self._open_task_result(task_id))
        else:  # CANCELLED
            action_btn = QPushButton("-")
            action_btn.setEnabled(False)
        
        action_btn.setObjectName("secondary")
        action_btn.setMinimumWidth(60)
        layout.addWidget(action_btn)
        
        # Second button: Cancel (hidden for completed/cancelled)
        if task.status in [DownloadStatus.DOWNLOADING, DownloadStatus.PAUSED, DownloadStatus.PENDING, DownloadStatus.FAILED]:
            cancel_btn = QPushButton("❌")
            cancel_btn.setObjectName("secondary")
            cancel_btn.setToolTip("取消下载")
            cancel_btn.setMaximumWidth(30)
            cancel_btn.clicked.connect(lambda: self._cancel_download(task_id))
            layout.addWidget(cancel_btn)
        
        self.queue_table.setCellWidget(row, 6, container)
    
    def _pause_download(self, task_id: str):
        """Pause a download."""
        self.downloader.pause_download(task_id)
        
        row = self._find_task_row(task_id)
        if row >= 0:
            self.queue_table.item(row, 1).setText("⏸️ 已暂停")
            task = self.downloader.get_task(task_id)
            if task:
                self._update_task_buttons(row, task)
    
    def _resume_download(self, task_id: str):
        """Resume/Start a download."""
        success = self.downloader.resume_download(task_id)
        
        if success:
            row = self._find_task_row(task_id)
            if row >= 0:
                self.queue_table.item(row, 1).setText("下载中")
                task = self.downloader.get_task(task_id)
                if task:
                    self._update_task_buttons(row, task)
            
            # Start download thread
            thread = DownloadThread(self.downloader, task_id)
            thread.progress_updated.connect(self._on_progress_updated)
            thread.download_completed.connect(self._on_download_completed)
            thread.download_failed.connect(self._on_download_failed)
            thread.start()
            self._download_threads[task_id] = thread
    
    def _open_task_result(self, task_id: str):
        """Open the download folder for a completed task."""
        task = self.downloader.get_task(task_id)
        if task and task.result_path:
            self._open_result(task.result_path)

