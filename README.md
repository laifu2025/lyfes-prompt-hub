# Lyfe's Prompt Hub

![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/Lyfe.lyfes-prompt-hub)
![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/Lyfe.lyfes-prompt-hub)
![Visual Studio Marketplace Rating](https://img.shields.io/visual-studio-marketplace/r/Lyfe.lyfes-prompt-hub)

**Lyfe's Prompt Hub** 是一个为 VS Code (及 Cursor) 设计的强大、高效的 Prompt 管理中心。它旨在优化您与 AI 模型的交互流程，让您能够轻松地创建、管理、搜索和使用您的所有 Prompt。

![Demo GIF](https://raw.githubusercontent.com/laifu2025/lyfes-prompt-hub/main/assets/demo.gif)  
*(这是一个演示图占位符，建议您之后录制一个GIF并替换此链接)*

---

## ✨ 核心功能

- **集中管理**: 在单一视图中创建、编辑和组织您所有的 Prompt。
- **分类与标签**: 通过灵活的分类和标签系统，快速定位您需要的 Prompt。
- **快速搜索**: 即时搜索功能，帮助您在大量 Prompt 中迅速找到目标。
- **一键启用/禁用**: 临时禁用不常用的 Prompt，保持列表清爽。
- **数据本地化**: 所有数据默认存储在本地，确保您的隐私和数据安全。
- **工作区模式**: 支持将数据存储在特定工作区，实现项目级的 Prompt 管理。
- **数据备份与恢复**: 提供简单的数据导入、导出和备份功能，防止数据丢失。
- **云同步 (即将推出)**: 支持将您的数据同步到 GitHub/Gitee 等平台。

## 📦 安装

1.  打开 **VS Code** 或 **Cursor**。
2.  进入 **扩展** 视图 (`Ctrl+Shift+X` 或 `Cmd+Shift+X`)。
3.  搜索 `Lyfe's Prompt Hub`。
4.  点击 **安装**。

您也可以直接从 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Lyfe.lyfes-prompt-hub) 下载并手动安装。

## 🚀 如何使用

1.  **打开 Prompt Hub**: 点击活动栏中的书本图标 (`📖`) 打开 Prompt Hub 侧边栏。
2.  **创建 Prompt**:
    - 点击 `+` 按钮进入创建页面。
    - 填写标题、内容，并选择或创建一个分类。
    - 添加标签以便于搜索。
    - 点击保存。
3.  **管理分类**:
    - 点击文件夹图标 (`📁`) 进入分类管理页面。
    - 您可以添加、编辑或删除分类。
4.  **切换存储模式**:
    - 点击设置图标 (`⚙️`) 进入设置页面。
    - 在"存储模式"板块，您可以选择将数据保存在全局或当前工作区。

## 🤝 贡献

欢迎任何形式的贡献！如果您有好的建议或发现了Bug，请随时提交 [Issues](https://github.com/laifu2025/lyfes-prompt-hub/issues)。

如果您想贡献代码，请遵循以下步骤：
1.  Fork 本仓库。
2.  创建一个新的分支 (`git checkout -b feature/YourAmazingFeature`)。
3.  提交您的更改 (`git commit -m 'Add some AmazingFeature'`)。
4.  将分支推送到远程 (`git push origin feature/YourAmazingFeature`)。
5.  提交一个 Pull Request。

## 📄 许可证

本项目基于 [MIT](LICENSE) 许可证。

## 项目结构

```
lyfes-prompt-hub/
├── src/
│   ├── extension.ts          # 扩展主入口
│   └── promptHubProvider.ts  # Webview提供者
├── .vscode/                  # VS Code配置
├── package.json              # 扩展配置和依赖
├── tsconfig.json            # TypeScript配置
└── prompt_hub_mockup.html   # UI原型文件
```

## 作者

Lyfe - [GitHub](https://github.com/laifu2025) 