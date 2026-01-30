跟用户用中文交流

这个项目是fork的一个github的仓库，主要用于编写自用插件或者把iitc自带的插件进行改进或者扩充。所有位于 `local-plugins` 目录下的都是改进后或者自建的插件。如果需要改善iitc自带插件，必须在`local-plugins`目录建立自带插件的副本上进行修改，不可以修改`plugins`目录中的自带插件。

这个项目的仓库位于`https://github.com/mordenkainennn/ingress-intel-total-conversion`,改进的插件和自建插件的meta.js文件 user.js文件和元信息都按照这个地址进行修改。

每次修改文件前，重新读取文件内容，以防匹配失败

修改代码前必须得到确认

遇到错误先仔细阅读代码，找到原因和解决方式，得到确认后才能修改代码

在设计任何新功能的时候，界面选择使用英语

除非用户主动提出，否则不要进行git操作

修改完代码以后，先有用户测试，测试通过后再修改版本号和changelog，用英文撰写changelog。

**在更新插件的版本号时要同步更新meta文件的中的版本号**

在进行git操作的时候，如果没有特别说明，有gemini来决定commit message如何撰写，同时commit message要使用中文撰写。由于系统原因，命令行可能无法正确处理中文和引号，所以要先把commit message保存到临时文件中，然后让 Git 从这个文件中读取提交信息，提交完成后再删除这个文件。

禁止使用eslint检查代码！





# GEMINI.md: Ingress Intel Total Conversion (IITC-CE)

## Project Overview

This repository contains the source code for the Ingress Intel Total Conversion (IITC), a browser add-on and mobile application that enhances the Ingress intel map. The project is primarily written in JavaScript, with a Python-based build system. It also includes an Android mobile application that wraps the core JavaScript functionality.

The project is structured as follows:
- `core/`: Contains the main JavaScript source code for the application.
- `plugins/`: Contains various plugins that extend the functionality of IITC.
- `mobile/`: Contains the source code for the Android mobile application.
- `build.py`: The main build script for the project.
- `buildsettings.py` and `settings.py`: Configuration files for the build system.
- `package.json`: Defines the project's dependencies and scripts.

## Building and Running

### Dependencies
- Node.js and npm
- Python 3
- Java Development Kit (JDK) for mobile builds
- Android SDK for mobile builds

### Build Commands

The project uses a Python-based build system. The main build commands are defined in `package.json`:

- **Local Build:** To build the project for local development, run:
  ```
  npm run build:local
  ```
  This command executes `./build.py local`, which builds the main script and all plugins.

- **Mobile Build:** To build the Android application, run:
  ```
  npm run build:mobile
  ```
  This command executes `./build.py mobile`, which triggers the Android build process.

- **Development Server:** To run a local web server for development, use:
  ```
  npm run fileserver
  ```
  This runs `./web_server_local.py`.

### Testing

The project uses Mocha for testing. To run the tests, use:
```
npm test
```

## Development Conventions

### Coding Style

The project uses ESLint and Prettier to enforce a consistent coding style. The configuration can be found in `eslint.config.js` and `.prettierrc.json`. Before contributing, it's recommended to run the linter to ensure your code adheres to the project's style guidelines.

### Continuous Integration

The project uses GitHub Actions for continuous integration. The CI pipeline is defined in `.github/workflows/build.yml`. It automatically builds the project, runs tests, and creates releases when new tags are pushed.



## IITC Plugin Changelog Structure Reference

When writing `changelog` for IITC plugins (typically within the `.user.js` file), please adhere to the following structure for consistency and automatic parsing by IITC's core:

```javascript
var changelog = [
    {
        version: 'X.Y.Z', // Required: Version string (e.g., '1.0.0', '1.2.3.YYYYMMDD')
        changes: [        // Required: Array of strings, each describing a change
            'NEW: Added new feature or functionality.',
            'FIX: Corrected a bug or issue.',
            'UPD: Updated existing feature or dependency.',
            'REM: Removed feature or functionality.',
            // Prefix changes with 'NEW:', 'FIX:', 'UPD:', 'REM:' for clarity.
        ],
    },
    {
        version: 'A.B.C',
        changes: [
            'Another change description.',
        ],
    },
    // ... more version entries (newest first is common practice)
];
```