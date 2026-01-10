# IITC-CE 项目说明

## 项目概述

这是 Ingress Intel Total Conversion (IITC) 的一个分支项目，IITC 是一个增强 Ingress intel 地图的浏览器插件和移动应用程序。该项目主要使用 JavaScript 编写，并包含基于 Python 的构建系统。此外，还包括一个 Android 移动应用程序，用于封装核心 JavaScript 功能。

**重要说明**：这个项目是从 GitHub 仓库 `https://github.com/IITC-CE/ingress-intel-total-conversion` fork 的，主要用于编写自用插件或改进/扩充 IITC 自带插件。所有位于 `local-plugins` 目录下的都是改进后或自建的插件。如果需要改善 IITC 自带插件，必须在 `local-plugins` 目录建立自带插件的副本上进行修改，不可以修改 `plugins` 目录中的自带插件。

## 项目结构

```
├── core/                   # 主要 JavaScript 源代码
│   ├── code/              # 核心功能代码
│   ├── external/          # 外部依赖库
│   └── images/            # 图像资源
├── plugins/               # IITC 自带插件
├── local-plugins/         # 改进后或自建的插件
│   ├── drone-flight-planner/
│   ├── fanfield-planner/
│   └── homogeneous-fields/
├── mobile/                # Android 移动应用程序源代码
├── build.py               # 主构建脚本
├── buildsettings.py       # 构建配置默认值
├── settings.py            # 构建设置加载模块
└── package.json           # 项目依赖和脚本定义
```

## 构建和运行

### 依赖项

- Node.js 和 npm
- Python 3
- Java Development Kit (JDK)（用于移动端构建）
- Android SDK（用于移动端构建）

### 构建命令

项目使用基于 Python 的构建系统。主要构建命令在 `package.json` 中定义：

- **本地构建**：用于本地开发，运行：
  ```
  npm run build:local
  ```
  此命令执行 `./build.py local`，构建主脚本和所有插件。

- **移动端构建**：构建 Android 应用程序，运行：
  ```
  npm run build:mobile
  ```
  此命令执行 `./build.py mobile`，触发 Android 构建过程。

- **开发服务器**：运行本地 Web 服务器进行开发，使用：
  ```
  npm run fileserver
  ```
  此命令运行 `./web_server_local.py`。

### 测试

项目使用 Mocha 进行测试。运行测试：
```
npm test
```

## 开发约定

### 编码风格

项目使用 ESLint 和 Prettier 来强制执行一致的编码风格。配置可以在 `eslint.config.js` 和 `.prettierrc.json` 中找到。在贡献代码之前，建议运行 linter 以确保代码符合项目的风格指南。

### 插件开发

1. **自建插件**：直接在 `local-plugins` 目录下创建新插件
2. **改进现有插件**：
   - 从 `plugins` 目录复制要改进的插件到 `local-plugins` 目录
   - 在 `local-plugins` 目录中的副本上进行修改
   - 更新插件的元信息（meta.js）以反映正确的仓库地址：`https://github.com/mordenkainennn/ingress-intel-total-conversion`

### 版本管理

- 插件版本更新遵循语义化版本控制
- 核心版本在 `core/total-conversion-build.js` 中管理
- 移动应用版本在 `mobile/app/build.gradle` 中管理

### 持续集成

项目使用 GitHub Actions 进行持续集成。CI 流水线在 `.github/workflows/build.yml` 中定义。当推送新标签时，它会自动构建项目、运行测试并创建发布版本。

## 构建配置

### 构建类型

项目支持多种构建配置，在 `buildsettings.py` 中定义：

- `local`：默认设置
- `dev`：开发环境设置，使用 localhost 作为脚本基础 URL
- `tmdev`：Tampermonkey 开发环境，使用无注入包装器
- `mobile`：移动端构建，包含 Android APK 构建后处理

### 自定义构建

要创建自定义构建，请复制 `buildsettings.py` 为 `localbuildsettings.py` 并进行修改。此文件不会被 Git 跟踪，可以安全地包含个人配置。

## 本地插件开发

当前项目包含以下本地插件：

1. **drone-flight-planner**：无人机飞行规划器
2. **fanfield-planner**：扇形场规划器
3. **homogeneous-fields**：均匀场规划器（57Cell's Field Planner）

每个本地插件都应包含：
- `.user.js` 文件：插件主要代码
- `.meta.js` 文件：插件元数据，用于自动更新

## 注意事项

1. 修改任何文件前，请先重新读取文件内容，以防匹配失败
2. 修改代码前必须得到确认
3. 遇到错误时，先仔细阅读代码，找到原因和解决方式，得到确认后才能修改代码
4. 设计新功能时，界面选择使用英语
5. 除非用户主动提出，否则不要进行 git 操作
6. 进行 git 操作时，如果没有特别说明，由 AI 决定 commit message 如何撰写，同时 commit message 要使用中文撰写