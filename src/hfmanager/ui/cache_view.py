"""
Cache View - Visual cache management interface.
Displays cached models/datasets with size info and deletion controls.
"""
from __future__ import annotations

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTreeWidget, QTreeWidgetItem, QHeaderView, QFrame,
    QProgressBar, QMessageBox, QSplitter, QGroupBox
)
from PySide6.QtCore import Qt, Signal, QThread
from PySide6.QtGui import QIcon

from ..core.cache_manager import CacheManager, RepoInfo, CacheSummary
from ..utils.system import open_folder_in_explorer, get_cache_dir


class ScanThread(QThread):
    """Background thread for cache scanning."""
    finished = Signal(object, object)  # repos, summary
    
    def __init__(self, cache_manager: CacheManager):
        super().__init__()
        self.cache_manager = cache_manager
    
    def run(self):
        try:
            repos = self.cache_manager.get_repos_list()
            summary = self.cache_manager.get_summary()
            self.finished.emit(repos, summary)
        except Exception as e:
            self.finished.emit([], None)


class StatCard(QFrame):
    """Small card showing a statistic."""
    
    def __init__(self, title: str, value: str = "0", parent=None):
        super().__init__(parent)
        self.setObjectName("card")
        self.setFixedHeight(100)
        
        layout = QVBoxLayout(self)
        layout.setSpacing(4)
        
        self.value_label = QLabel(value)
        self.value_label.setObjectName("stat-value")
        self.value_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        self.title_label = QLabel(title)
        self.title_label.setObjectName("stat-label")
        self.title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        layout.addStretch()
        layout.addWidget(self.value_label)
        layout.addWidget(self.title_label)
        layout.addStretch()
    
    def set_value(self, value: str):
        self.value_label.setText(value)


class CacheView(QWidget):
    """Main cache management view."""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.cache_manager = CacheManager()
        self.repos: list[RepoInfo] = []
        self._scan_thread: ScanThread = None
        
        self._setup_ui()
        self.refresh_cache()
    
    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        layout.setContentsMargins(20, 20, 20, 20)
        
        # Header
        header_layout = QHBoxLayout()
        
        title = QLabel("缓存管理器")
        title.setObjectName("title")
        header_layout.addWidget(title)
        
        header_layout.addStretch()
        
        # Open folder button
        open_btn = QPushButton("📂 打开缓存目录")
        open_btn.setObjectName("secondary")
        open_btn.clicked.connect(self._open_cache_folder)
        header_layout.addWidget(open_btn)
        
        # Refresh button
        refresh_btn = QPushButton("🔄 刷新")
        refresh_btn.setObjectName("secondary")
        refresh_btn.clicked.connect(self.refresh_cache)
        header_layout.addWidget(refresh_btn)
        
        layout.addLayout(header_layout)
        
        # Stats cards
        stats_layout = QHBoxLayout()
        stats_layout.setSpacing(12)
        
        self.total_size_card = StatCard("总占用空间")
        self.models_card = StatCard("模型数量")
        self.datasets_card = StatCard("数据集数量")
        self.revisions_card = StatCard("版本总数")
        
        stats_layout.addWidget(self.total_size_card)
        stats_layout.addWidget(self.models_card)
        stats_layout.addWidget(self.datasets_card)
        stats_layout.addWidget(self.revisions_card)
        
        layout.addLayout(stats_layout)
        
        # Main content splitter
        splitter = QSplitter(Qt.Orientation.Horizontal)
        
        # Left: Tree view
        left_widget = QWidget()
        left_layout = QVBoxLayout(left_widget)
        left_layout.setContentsMargins(0, 0, 0, 0)
        
        tree_header = QLabel("已缓存的仓库")
        tree_header.setObjectName("section-header")
        left_layout.addWidget(tree_header)
        
        self.tree = QTreeWidget()
        self.tree.setHeaderLabels(["仓库", "类型", "大小", "版本数", "最后访问"])
        self.tree.setRootIsDecorated(True)
        self.tree.setAlternatingRowColors(False)
        self.tree.setSelectionMode(QTreeWidget.SelectionMode.ExtendedSelection)
        
        # Adjust column widths
        header = self.tree.header()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Fixed)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.Fixed)
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.Fixed)
        header.resizeSection(1, 80)
        header.resizeSection(2, 100)
        header.resizeSection(3, 80)
        header.resizeSection(4, 150)
        
        left_layout.addWidget(self.tree)
        
        # Action buttons
        actions_layout = QHBoxLayout()
        
        self.delete_btn = QPushButton("🗑️ 删除选中")
        self.delete_btn.setObjectName("danger")
        self.delete_btn.clicked.connect(self._delete_selected)
        self.delete_btn.setEnabled(False)
        actions_layout.addWidget(self.delete_btn)
        
        actions_layout.addStretch()
        
        self.clear_old_btn = QPushButton("清理旧版本")
        self.clear_old_btn.setObjectName("secondary")
        self.clear_old_btn.setToolTip("保留最新版本，删除其他所有旧版本")
        self.clear_old_btn.clicked.connect(self._clear_old_versions)
        actions_layout.addWidget(self.clear_old_btn)
        
        left_layout.addLayout(actions_layout)
        
        splitter.addWidget(left_widget)
        
        # Right: Details panel
        right_widget = QGroupBox("详细信息")
        right_layout = QVBoxLayout(right_widget)
        
        self.detail_label = QLabel("选择一个仓库查看详情")
        self.detail_label.setWordWrap(True)
        self.detail_label.setAlignment(Qt.AlignmentFlag.AlignTop)
        right_layout.addWidget(self.detail_label)
        
        splitter.addWidget(right_widget)
        splitter.setSizes([600, 300])
        
        layout.addWidget(splitter, 1)
        
        # Connect signals
        self.tree.itemSelectionChanged.connect(self._on_selection_changed)
        self.tree.itemDoubleClicked.connect(self._on_item_double_clicked)
    
    def refresh_cache(self):
        """Refresh cache data in background."""
        if self._scan_thread and self._scan_thread.isRunning():
            return
        
        self.tree.clear()
        self.detail_label.setText("正在扫描缓存...")
        
        self._scan_thread = ScanThread(self.cache_manager)
        self._scan_thread.finished.connect(self._on_scan_finished)
        self._scan_thread.start()
    
    def _on_scan_finished(self, repos: list, summary: CacheSummary):
        """Handle scan completion."""
        self.repos = repos
        
        if summary:
            self.total_size_card.set_value(summary.total_size_formatted)
            self.models_card.set_value(str(summary.models_count))
            self.datasets_card.set_value(str(summary.datasets_count))
            self.revisions_card.set_value(str(summary.total_revisions))
        
        self._populate_tree()
        self.detail_label.setText("选择一个仓库查看详情" if repos else "缓存为空")
    
    def _populate_tree(self):
        """Populate tree with repo data."""
        from datetime import datetime
        
        self.tree.clear()
        
        for repo in self.repos:
            item = QTreeWidgetItem()
            item.setText(0, repo.repo_id)
            item.setText(1, repo.repo_type)
            item.setText(2, repo.size_formatted)
            item.setText(3, str(len(repo.revisions)))
            
            if repo.last_accessed:
                # Handle both datetime and float (timestamp) types
                if isinstance(repo.last_accessed, (int, float)):
                    dt = datetime.fromtimestamp(repo.last_accessed)
                    item.setText(4, dt.strftime("%Y-%m-%d %H:%M"))
                else:
                    item.setText(4, repo.last_accessed.strftime("%Y-%m-%d %H:%M"))
            else:
                item.setText(4, "-")
            
            # Store repo data
            item.setData(0, Qt.ItemDataRole.UserRole, repo)
            
            # Add revision children
            for rev in repo.revisions:
                rev_item = QTreeWidgetItem(item)
                commit_short = rev['commit_hash'][:8]
                refs_str = ", ".join(rev['refs']) if rev['refs'] else ""
                rev_item.setText(0, f"{commit_short} {refs_str}")
                rev_item.setText(2, rev['size_formatted'])
                rev_item.setText(3, str(rev['nb_files']) + " 文件")
                
                if rev['last_modified']:
                    # Handle both datetime and float (timestamp) types
                    if isinstance(rev['last_modified'], (int, float)):
                        dt = datetime.fromtimestamp(rev['last_modified'])
                        rev_item.setText(4, dt.strftime("%Y-%m-%d %H:%M"))
                    else:
                        rev_item.setText(4, rev['last_modified'].strftime("%Y-%m-%d %H:%M"))
                
                rev_item.setData(0, Qt.ItemDataRole.UserRole, rev)
            
            self.tree.addTopLevelItem(item)
    
    def _on_selection_changed(self):
        """Handle tree selection change."""
        selected = self.tree.selectedItems()
        self.delete_btn.setEnabled(len(selected) > 0)
        
        if len(selected) == 1:
            item = selected[0]
            data = item.data(0, Qt.ItemDataRole.UserRole)
            
            if isinstance(data, RepoInfo):
                self.detail_label.setText(
                    f"<b>仓库:</b> {data.repo_id}<br>"
                    f"<b>类型:</b> {data.repo_type}<br>"
                    f"<b>大小:</b> {data.size_formatted}<br>"
                    f"<b>文件数:</b> {data.nb_files}<br>"
                    f"<b>版本数:</b> {len(data.revisions)}<br>"
                    f"<b>分支/标签:</b> {', '.join(data.refs) if data.refs else '无'}"
                )
            elif isinstance(data, dict):  # Revision
                self.detail_label.setText(
                    f"<b>提交:</b> {data['commit_hash']}<br>"
                    f"<b>大小:</b> {data['size_formatted']}<br>"
                    f"<b>文件数:</b> {data['nb_files']}<br>"
                    f"<b>引用:</b> {', '.join(data['refs']) if data['refs'] else '无'}"
                )
        else:
            total_size = 0
            for item in selected:
                data = item.data(0, Qt.ItemDataRole.UserRole)
                if isinstance(data, RepoInfo):
                    total_size += data.size_on_disk
                elif isinstance(data, dict):
                    total_size += data.get('size_on_disk', 0)
            
            from ..utils.system import format_size
            self.detail_label.setText(
                f"已选择 {len(selected)} 项\n"
                f"总大小: {format_size(total_size)}"
            )
    
    def _on_item_double_clicked(self, item: QTreeWidgetItem, column: int):
        """Handle double click on item."""
        if item.childCount() > 0:
            item.setExpanded(not item.isExpanded())
    
    def _delete_selected(self):
        """Delete selected items."""
        selected = self.tree.selectedItems()
        if not selected:
            return
        
        # Collect revision hashes to delete
        revision_hashes = []
        repos_to_delete = []
        
        for item in selected:
            data = item.data(0, Qt.ItemDataRole.UserRole)
            if isinstance(data, RepoInfo):
                repos_to_delete.append(data.repo_id)
                for rev in data.revisions:
                    revision_hashes.append(rev['commit_hash'])
            elif isinstance(data, dict):
                revision_hashes.append(data['commit_hash'])
        
        # Confirm deletion
        msg = f"确定要删除 {len(revision_hashes)} 个版本吗？\n此操作不可撤销。"
        reply = QMessageBox.question(
            self, "确认删除", msg,
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            try:
                result = self.cache_manager.delete_revisions(revision_hashes)
                QMessageBox.information(
                    self, "删除成功",
                    f"已释放 {result['freed_size_formatted']} 空间"
                )
                self.refresh_cache()
            except Exception as e:
                QMessageBox.critical(self, "删除失败", str(e))
    
    def _clear_old_versions(self):
        """Clear old versions, keeping only the latest."""
        # Get old revisions preview
        old_revisions = self.cache_manager.get_old_revisions()
        
        if not old_revisions:
            QMessageBox.information(
                self, "清理完成",
                "没有需要清理的旧版本。\n所有仓库都只有一个版本。"
            )
            return
        
        # Calculate total size
        from ..utils.system import format_size
        total_size = sum(r['size_on_disk'] for r in old_revisions)
        
        # Group by repo for display
        repos_affected = set(r['repo_id'] for r in old_revisions)
        
        # Confirm with user
        msg = (
            f"找到 {len(old_revisions)} 个旧版本，来自 {len(repos_affected)} 个仓库。\n\n"
            f"预计可释放空间: {format_size(total_size)}\n\n"
            f"将保留每个仓库的最新版本，删除其他旧版本。\n"
            f"此操作不可撤销，是否继续？"
        )
        
        reply = QMessageBox.question(
            self, "确认清理旧版本", msg,
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            try:
                result = self.cache_manager.clean_old_versions()
                QMessageBox.information(
                    self, "清理成功",
                    f"已删除 {result.get('revisions_deleted', 0)} 个旧版本\n"
                    f"释放空间: {result['freed_size_formatted']}"
                )
                self.refresh_cache()
            except Exception as e:
                QMessageBox.critical(self, "清理失败", str(e))
    
    def _open_cache_folder(self):
        """Open cache folder in file explorer."""
        cache_dir = get_cache_dir()
        if not open_folder_in_explorer(cache_dir):
            QMessageBox.warning(
                self, "打开失败",
                f"无法打开目录: {cache_dir}"
            )
