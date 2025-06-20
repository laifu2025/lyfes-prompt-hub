# Lyfe's Prompt Hub

高效管理和使用AI提示词的Cursor扩展。

## 功能特性

- 📝 **提示词管理** - 创建、编辑、删除和组织您的AI提示词
- 🏷️ **分类管理** - 按分类整理提示词，便于查找和管理
- 🔍 **智能搜索** - 快速搜索和筛选提示词
- ☁️ **云端同步** - 通过GitHub Gist在不同设备间同步您的数据
- 🎨 **深色主题** - 美观的深色主题界面
- 💾 **数据持久化** - 本地存储，数据不丢失
- 📱 **响应式设计** - 适配不同尺寸的侧边栏
- 💾 **数据备份与恢复** - 支持本地自动和手动备份，随时恢复数据
- 💼 **工作区支持** - 可将数据保存在当前工作区，实现项目级提示词隔离

## 安装方法

1. 下载最新的 `.vsix` 扩展包
2. 在Cursor中按 `Ctrl+Shift+P` 打开命令面板
3. 输入 `Extensions: Install from VSIX...`
4. 选择下载的 `.vsix` 文件进行安装

## 使用方法

1. 安装扩展后，在左侧活动栏会出现 "Prompt Hub" 图标。
2. 点击图标即可打开管理面板。
3. 在面板中，您可以：
   - **创建/编辑提示词**：点击 "新建" 或列表中的条目进行编辑。
   - **管理分类**：在左侧分类列表中进行增、删、改、查。
   - **搜索**：使用顶部的搜索框快速查找提示词。
   - **设置**：点击右下角的齿轮图标进入设置，可配置云同步、备份等高级功能。

## 云同步 (Cloud Sync)

本扩展支持通过 GitHub Gist 实现数据的云端同步，方便您在多台设备上使用同一套提示词数据。

### 配置步骤

1. **生成 GitHub Personal Access Token (PAT)**
   - 前往您的 GitHub 开发者设置页面：[**Settings > Developer settings > Personal access tokens > Tokens (classic)**](https://github.com/settings/tokens)。
   - 点击 "Generate new token" -> "Generate new token (classic)"。
   - 在 "Note" 中填写一个方便识别的名称，例如 `PromptHubSync`。
   - 在 "Select scopes" 中，**仅需勾选 `gist`** 权限。
   - 点击 "Generate token" 生成令牌，并**立即复制并妥善保管好这个令牌**，因为页面刷新后将无法再次看到。

2. **在扩展中配置同步**
   - 打开 Prompt Hub 面板，点击右下角的设置图标。
   - 开启 "云同步" 开关。
   - 在弹出的输入框中，粘贴您刚刚生成的 GitHub PAT。
   - 扩展程序会自动验证Token。验证成功后，它会为您创建一个名为 `prompt-hub.json` 的私有 Gist，并开始同步数据。

### 工作原理

- **首次设置**：扩展会创建一个私有的 Gist 来存储您的所有数据。
- **后续同步**：
  - **上传**：当您在本地进行修改后，可以点击设置页面的 "同步到云端" 按钮，将本地数据上传覆盖云端。
  - **下载**：在新设备上配置好同步后，或需要恢复数据时，可以点击 "从云端同步" 按钮，将云端数据下载到本地。

> **注意**：当前的同步是手动的，以上传或下载的方式进行全量覆盖。请在操作前确认数据状态，以免误操作导致数据丢失。

## 开发环境

### 环境要求

- Node.js 16+
- npm 或 yarn
- VS Code 或 Cursor

### 本地开发

1. 克隆项目
```bash
git clone https://github.com/laifu2025/lyfes-cursor-rules.git
cd lyfes-prompt-hub
```

2. 安装依赖
```bash
npm install
```

3. 编译项目
```bash
npm run compile
```

4. 调试扩展
- 按 `F5` 启动扩展开发主机
- 在新窗口中即可看到扩展效果

### 打包扩展

```bash
npm run package
```

这将生成一个 `.vsix` 文件，可以用于分发和安装。

## 项目结构

```
lyfes-prompt-hub/
├── src/
│   ├── extension.ts          # 扩展主入口，处理VS Code API交互
│   ├── promptHubProvider.ts  # Webview的创建和管理
│   ├── dataManager.ts        # 数据处理核心，包括本地存储和云同步
│   └── webview/              # Web UI界面
│       ├── index.html        # UI入口HTML
│       ├── style.css         # 全局样式
│       └── js/               # 前端逻辑
│           ├── app.js        # 主应用逻辑
│           ├── api.js        # 与扩展后端的通信
│           ├── uiManager.js  # UI渲染和更新
│           └── ...           # 其他视图和模块
├── .vscode/                  # VS Code配置
├── package.json              # 扩展配置和依赖
├── tsconfig.json            # TypeScript配置
└── README.md                 # 项目说明文档
```

## 贡献

欢迎提交 Issues 和 Pull Requests！

## 许可证

MIT License

## 作者

Lyfe - [GitHub](https://github.com/laifu2025) 