# Lyfe's Prompt Hub

高效管理和使用AI提示词的Cursor扩展。

## 功能特性

- 📝 **提示词管理** - 创建、编辑、删除和组织您的AI提示词
- 🏷️ **分类管理** - 按分类整理提示词，便于查找和管理
- 🔍 **智能搜索** - 快速搜索和筛选提示词
- 🎨 **深色主题** - 美观的深色主题界面
- 💾 **数据持久化** - 本地存储，数据不丢失
- 📱 **响应式设计** - 适配不同尺寸的侧边栏

## 安装方法

1. 下载最新的 `.vsix` 扩展包
2. 在Cursor中按 `Ctrl+Shift+P` 打开命令面板
3. 输入 `Extensions: Install from VSIX...`
4. 选择下载的 `.vsix` 文件进行安装

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

## 使用方法

1. 安装扩展后，在左侧活动栏会出现 "Prompt Hub" 面板
2. 点击面板开始使用
3. 首次使用需要登录（默认用户名：Lyfe，密码：password123）
4. 登录后即可开始创建和管理您的提示词

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

## 贡献

欢迎提交 Issues 和 Pull Requests！

## 许可证

MIT License

## 作者

Lyfe - [GitHub](https://github.com/laifu2025) 