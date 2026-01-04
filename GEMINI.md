
跟用户用中文交流

修改代码前必须得到确认

遇到错误先仔细阅读代码，找到原因和解决方式，得到确认后才能修改代码

在设计任何新功能是时候，界面选择使用英语

在进行git操作的时候，如果没有特别说明，有gemini来决定commit message如何撰写，同时commit message要使用中文撰写。由于系统原因，命令行可能无法正确处理中文和引号，所以要先把commit message保存到临时文件中，然后让 Git 从这个文件中读取提交信息，提交完成后再删除这个文件。

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
