# 🤗 HuggingFace-Manager (HFManager)

**Open-source visual model management and high-performance download tool customized for the Hugging Face ecosystem.**

<p align="center">
  <img src="https://img.shields.io/github/v/release/happylinze/HuggingFace-Manager?color=blue&logo=github" alt="Release" />
  <img src="https://img.shields.io/badge/Python-3.10+-blue?logo=python" alt="Python" />
  <img src="https://img.shields.io/badge/License-Apache%202.0-green" alt="License" />
  <img src="https://img.shields.io/badge/Platform-Win%20|%20Mac%20|%20Linux-orange" alt="Platform" />
</p>

---

**HFManager** is a desktop utility designed specifically for AI developers. It integrates deeply with the Hugging Face official backend to significantly simplify workflows such as model retrieval, multi-threaded downloads, local cache management, and remote repository maintenance through an intuitive graphical interface.

[中文版本](./README.md)

---

## 🛠️ Main Features

### 1. Multi-Dimensional Download Engine
*   **Aria2 Parallel Acceleration**: Integrated high-performance multi-threaded download engine supporting multiple parallel connections, providing stable resume capabilities, and optimized specifically for large model file throughput.
*   **Flexible Download Modes**: Supports **one-click full repository download**, **custom multi-file selection** (via extensions or keywords), and **convenient batch downloading** (queue multiple repository IDs or URLs simultaneously).
*   **hf-transfer Turbo Protocol**: Built-in support for Hugging Face's official Rust-based high-speed transfer protocol to maximize bandwidth utilization.
*   **Dynamic Mirror Routing**: One-click switching between the official API and global high-speed mirrors (e.g., hf-mirror.com), with **support for custom mirror addresses**.

### 2. Local Management & Conversion
*   **Cache Lifecycle Management**: Provides disk usage statistics for local model and dataset caches, supporting redundant resource scanning and one-click cleanup.
*   **Custom Storage Paths**: One-click modification of the default Hugging Face cache location, allowing easy migration of large data to non-system partitions.
*   **Dataset Streaming Preview**: Online streaming loading and tabular preview for remote formats like Parquet without requiring a full download first.
*   **Automated GGUF Quantization**: Built-in model conversion pipeline to convert downloaded FP16 native models to GGUF format and execute quantization (e.g., `FP16 -> Q4_K_M`).

### 3. Remote Repository Management
*   **Online Operations**: Support for uploading, syncing, and deleting files in remote repositories (Models / Datasets / Spaces).
*   **Multi-Identity System**: Local storage for multiple Hugging Face Access Tokens with seamless, instant identity switching.

### 4. UI & Interaction Experience
*   **Modern Interaction Design**: Minimalist Glassmorphism design style with smooth interactive animations and visual feedback.
*   **Day/Night Theme Switching**: Built-in Dark and Light modes adapted for different development environments throughout the day.
*   **Multilingual Localization**: Full support for real-time toggling between Chinese and English.

---

## 🖼️ Interface Preview

<table style="width: 100%; border-collapse: collapse;">
  <tr>
    <td align="center" style="padding: 5px; width: 33.3%;">
      <img src="./assets/img/search_main.png" alt="Search" style="width: 100%; height: 210px; object-fit: cover; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #eee;" /><br/>
      <sub>🔎 Resource Search</sub>
    </td>
    <td align="center" style="padding: 5px; width: 33.3%;">
      <img src="./assets/img/download_queue.png" alt="Queue" style="width: 100%; height: 210px; object-fit: cover; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #eee;" /><br/>
      <sub>🚀 Download Queue</sub>
    </td>
    <td align="center" style="padding: 5px; width: 33.3%;">
      <img src="./assets/img/batch_download.png" alt="Filter" style="width: 100%; height: 210px; object-fit: cover; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #eee;" /><br/>
      <sub>🔍 Targeted Filtering</sub>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding: 5px;">
      <img src="./assets/img/cache_main.png" alt="Cache" style="width: 100%; height: 210px; object-fit: cover; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #eee;" /><br/>
      <sub>📊 Cache Statistics</sub>
    </td>
    <td align="center" style="padding: 5px;">
      <img src="./assets/img/cache_list.png" alt="Cache List" style="width: 100%; height: 210px; object-fit: cover; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #eee;" /><br/>
      <sub>📃 Cache List</sub>
    </td>
    <td align="center" style="padding: 5px;">
      <img src="./assets/img/my_repos.png" alt="Repos" style="width: 100%; height: 210px; object-fit: cover; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #eee;" /><br/>
      <sub>📦 Personal Repos</sub>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding: 5px;">
      <img src="./assets/img/gguf_quant.png" alt="Quant" style="width: 100%; height: 210px; object-fit: cover; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #eee;" /><br/>
      <sub>⚙️ GGUF Quantization</sub>
    </td>
    <td align="center" style="padding: 5px;">
      <img src="./assets/img/theme_comparison.png" alt="Themes" style="width: 100%; height: 210px; object-fit: cover; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #eee;" /><br/>
      <sub>🌓 Theme Comparison</sub>
    </td>
    <td align="center" style="padding: 5px;">
      <img src="./assets/img/settings_main.png" alt="Settings" style="width: 100%; height: 210px; object-fit: cover; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #eee;" /><br/>
      <sub>🛠️ Global Settings</sub>
    </td>
  </tr>
</table>

---

## 📥 Download & Run

### Pre-built Versions (Recommended)
Download the version for your platform directly from [Releases](https://github.com/happylinze/HuggingFace-Manager/releases), and double-click to run.

### Run from Source
```bash
# Clone the repository
git clone https://github.com/happylinze/HuggingFace-Manager.git

# Install dependencies
pip install -r requirements.txt

# Start the application
python -m hfmanager
```

---

## 🚀 Status & Future
- [x] **High-Performance Download Engine**: Integrated Aria2, native Python, and hf-transfer protocols.
- [x] **Smart Local Cache Management**: Supports disk usage analysis and dataset streaming tabular preview.
- [x] **UI/UX Infrastructure Upgrade**: Implemented minimalist aesthetic design, dark mode, and multilingual support.
- [x] **Model Ecosystem Empowerment**: Built-in GGUF automated quantization and conversion plugin.
- [ ] **Cross-Device Remote Monitoring**: Support for real-time download status and progress viewing via QR code or remote page.
- [ ] **Automated Model Evaluation**: Integrated one-click model inference, loss assessment, and visual interaction preview.

---

## 📄 License
This project is licensed under the [Apache License 2.0](./LICENSE) protocol.
