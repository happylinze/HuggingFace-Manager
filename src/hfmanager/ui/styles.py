"""
UI Styles - Modern dark theme stylesheet for the application.
"""


def get_stylesheet() -> str:
    """
    Get the complete Qt stylesheet for the application.
    
    Returns:
        Complete CSS-like stylesheet string for Qt widgets.
    """
    return """
QWidget {
    background-color: #0f1419;
    color: #eaeaea;
    font-family: 'Segoe UI', 'Arial', sans-serif;
    font-size: 10pt;
}

QMainWindow {
    background-color: #0f1419;
}

/* Group Boxes */
QGroupBox {
    background-color: #16213e;
    border: 1px solid #1e3a5f;
    border-radius: 8px;
    margin-top: 12px;
    padding-top: 12px;
    font-weight: bold;
}

QGroupBox::title {
    subcontrol-origin: margin;
    left: 10px;
    padding: 0 5px;
    color: #e94560;
}

/* Buttons */
QPushButton {
    background-color: #e94560;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 8px 16px;
    font-weight: 600;
    min-height: 24px;
}

QPushButton:hover {
    background-color: #ff5c7c;
}

QPushButton:pressed {
    background-color: #d63651;
}

QPushButton:disabled {
    background-color: #3a3a5a;
    color: #808080;
}

QPushButton[objectName="secondary"] {
    background-color: #1e3a5f;
    color: #eaeaea;
}

QPushButton[objectName="secondary"]:hover {
    background-color: #2a4d7f;
}

QPushButton[objectName="secondary"]:pressed {
    background-color: #162d4f;
}

/* Input Fields */
QLineEdit, QTextEdit, QPlainTextEdit {
    background-color: #1a1a2e;
    color: #eaeaea;
    border: 1px solid #2a2a4a;
    border-radius: 6px;
    padding: 6px;
    selection-background-color: #e94560;
}

QLineEdit:focus, QTextEdit:focus, QPlainTextEdit:focus {
    border: 1px solid: #4ade80;
}

/* Combo Box */
QComboBox {
    background-color: #1a1a2e;
    color: #eaeaea;
    border: 1px solid #2a2a4a;
    border-radius: 6px;
    padding: 6px;
    min-height: 24px;
}

QComboBox:hover {
    border: 1px solid #4ade80;
}

QComboBox::drop-down {
    border: none;
    width: 20px;
}

QComboBox::down-arrow {
    image: none;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 6px solid #eaeaea;
    margin-right: 8px;
}

QComboBox QAbstractItemView {
    background-color: #1a1a2e;
    color: #eaeaea;
    selection-background-color: #e94560;
    border: 1px solid #2a2a4a;
    border-radius: 4px;
}

/* Check Box */
QCheckBox {
    spacing: 8px;
    color: #eaeaea;
}

QCheckBox::indicator {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 1px solid #2a2a4a;
    background-color: #1a1a2e;
}

QCheckBox::indicator:checked {
    background-color: #e94560;
    border-color: #e94560;
}

QCheckBox::indicator:hover {
    border-color: #4ade80;
}

/* Tables */
QTableWidget {
    background-color: #16213e;
    alternate-background-color: #1a2540;
    gridline-color: #2a2a4a;
    border: 1px solid #1e3a5f;
    border-radius: 6px;
    selection-background-color: #e94560;
}

QTableWidget::item {
    padding: 4px;
    color: #eaeaea;
}

QTableWidget::item:selected {
    background-color: #e94560;
}

QHeaderView::section {
    background-color: #0f1419;
    color: #eaeaea;
    padding: 8px;
    border: none;
    border-bottom: 1px solid #2a2a4a;
    font-weight: 600;
}

/* Tree Widget */
QTreeWidget {
    background-color: #16213e;
    alternate-background-color: #1a2540;
    border: 1px solid #1e3a5f;
    border-radius: 6px;
    selection-background-color: #e94560;
}

QTreeWidget::item {
    padding: 4px;
    color: #eaeaea;
}

QTreeWidget::item:selected {
    background-color: #e94560;
}

QTreeWidget::item:hover {
    background-color: #1e3a5f;
}

/* Progress Bar */
QProgressBar {
    border: 1px solid #2a2a4a;
    border-radius: 6px;
    background-color: #1a1a2e;
    text-align: center;
    color: #eaeaea;
    height: 20px;
}

QProgressBar::chunk {
    background-color: qlineargradient(
        x1:0, y1:0, x2:1, y2:0,
        stop:0 #e94560,
        stop:1 #ff5c7c
    );
    border-radius: 5px;
}

/* Scroll Bars */
QScrollBar:vertical {
    background-color: #1a1a2e;
    width: 12px;
    border-radius: 6px;
}

QScrollBar::handle:vertical {
    background-color: #2a2a4a;
    border-radius: 5px;
    min-height: 20px;
}

QScrollBar::handle:vertical:hover {
    background-color: #3a3a5a;
}

QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
    height: 0px;
}

QScrollBar:horizontal {
    background-color: #1a1a2e;
    height: 12px;
    border-radius: 6px;
}

QScrollBar::handle:horizontal {
    background-color: #2a2a4a;
    border-radius: 5px;
    min-width: 20px;
}

QScrollBar::handle:horizontal:hover {
    background-color: #3a3a5a;
}

QScrollBar::add-line:horizontal, QScrollBar::sub-line:horizontal {
    width: 0px;
}

/* Tab Widget */
QTabWidget::pane {
    border: 1px solid #1e3a5f;
    border-radius: 6px;
    background-color: #16213e;
    top: -1px;
}

QTabBar::tab {
    background-color: #1a1a2e;
    color: #eaeaea;
    border: 1px solid #2a2a4a;
    border-bottom: none;
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
    padding: 10px 20px;
    margin-right: 2px;
}

QTabBar::tab:selected {
    background-color: #16213e;
    color: #e94560;
    font-weight: 600;
}

QTabBar::tab:hover:!selected {
    background-color: #1e3a5f;
}

/* Labels */
QLabel {
    color: #eaeaea;
    background-color: transparent;
}

/* Splitter */
QSplitter::handle {
    background-color: #2a2a4a;
}

QSplitter::handle:hover {
    background-color: #3a3a5a;
}

/* Status Bar */
QStatusBar {
    background-color: #0f1419;
    color: #eaeaea;
    border-top: 1px solid #1e3a5f;
}

/* Menu Bar */
QMenuBar {
    background-color: #0f1419;
    color: #eaeaea;
}

QMenuBar::item:selected {
    background-color: #1e3a5f;
}

QMenu {
    background-color: #16213e;
    color: #eaeaea;
    border: 1px solid #2a2a4a;
    border-radius: 6px;
}

QMenu::item:selected {
    background-color: #e94560;
}

/* Text Browser (for README) */
QTextBrowser {
    background-color: #16213e;
    color: #eaeaea;
    border: 1px solid #1e3a5f;
    border-radius: 6px;
    padding: 12px;
}

/* Message Box */
QMessageBox {
    background-color: #16213e;
}

QMessageBox QLabel {
    color: #eaeaea;
}

QMessageBox QPushButton {
    min-width: 80px;
}

/* Dialogs */
QDialog {
    background-color: #0f1419;
}

/* Frame */
QFrame {
    background-color: transparent;
}

/* Specific custom widgets */
QPushButton:checked {
    background-color: #ff5c7c;
    border: 2px solid #e94560;
}
"""
