# IITC 插件开发：确保工具箱(Toolbox)链接正确显示的终极指南

在IITC插件开发中，“工具箱（Toolbox）”中的链接不显示是一个非常常见且令人沮丧的问题。这个问题的根源通常不是单一的，而是由多个潜在因素共同导致的。本指南综合了多次排查的经验，提供了一个从上到下、确保万无一失的检查清单和最佳实践。

## 第 1 步：正确配置 UserScript 头部指令 (这是最重要的第一步)

这是最基础、也最容易被忽略的一步。如果你的脚本没有在正确的 URL 上运行，那么之后的一切操作都是徒劳。

**问题**: Ingress Intel 地图有多个不同的 URL（如 `intel.ingress.com`, `intel-x.ingress.com`），并且可能包含或不包含 `www` 前缀。如果你的 `@match` 或 `@include` 指令不够全面，脚本管理器（如 Tampermonkey）可能根本不会在目标页面上执行你的脚本。

**解决方案**: 使用一个全面的、经过验证的 `@match` 和 `@include` 集合来覆盖所有可能性。

**最佳实践**:
直接复制并使用以下头部指令块，以确保最大兼容性：
```javascript
// ==UserScript==
// @name           My Awesome IITC Plugin
// @id             my-plugin-id
// @category       Info
// @version        0.0.1
// @namespace      https://github.com/example
// @description    My awesome plugin description.
// @include        https://intel.ingress.com/*
// @include        https://intel-x.ingress.com/*
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==
```
> **注意**: 简单地使用如 `https://*.ingress.com/intel*` 这样的通配符，在某些情况下是**不可靠的**。明确列出 `intel.ingress.com` 和 `intel-x.ingress.com` 是更稳妥的做法。

## 第 2 步：解决作用域隔离 (Scope Isolation)

如 `fix.md` 文件所分析，用户脚本在默认情况下运行在一个独立的“沙箱”作用域中，它无法直接访问主页面中的 IITC 对象（如 `window.plugin`, `window.IITC`, `window.bootPlugins`）。

**问题**: 如果你的代码在沙箱中执行 `window.bootPlugins.push(setup)`，它实际上是向一个**沙箱内的、无人问津的数组**中添加了启动函数。IITC 主程序永远不会知道你的插件需要初始化。

**解决方案**: 必须使用 **Wrapper 注入模式**，将你的全部插件逻辑包裹在一个 `wrapper` 函数中，然后通过动态创建 `<script>` 标签的方式，将这个函数注入到主页面的 DOM 中。这能确保你的代码在主页面的 `window` 下运行。

**最佳实践**:
使用以下久经考验的模板结构。你的所有代码都应写在 `wrapper` 函数内部。
```javascript
function wrapper(plugin_info) {
    // =========================================================================
    // 你的所有插件代码、函数、逻辑都应该放在这里
    // =========================================================================

    // 示例：
    if (typeof window.plugin !== 'function') window.plugin = function () { };
    window.plugin.myPlugin = function() {};
    var self = window.plugin.myPlugin;

    var setup = function() {
        // ... 你的初始化代码 ...
    };

    // --- 引导逻辑 ---
    setup.info = plugin_info;
    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded && typeof setup === 'function') {
        setup();
    }
} // wrapper 函数结束

// =========================================================================
// ↓↓↓ 以下注入代码是标准模板，通常无需修改 ↓↓↓
// =========================================================================
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    info.script = { 
        version: GM_info.script.version, 
        name: GM_info.script.name, 
        description: GM_info.script.description 
    };
}
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
```

## 第 3 步：健壮地添加工具箱按钮

即使 `setup` 函数被正确执行，它运行时 IITC 的 Toolbox 可能还没有完全初始化好，直接调用 `IITC.toolbox.addButton` 可能会失败。

**问题**: `setup` 函数的执行时机与 IITC 核心组件的渲染时机存在竞争关系（Race Condition）。

**解决方案**: 不要只调用一次添加按钮的函数，而是使用 `setInterval` **轮询**，反复尝试添加按钮，直到成功或超时为止。

**最佳实践**:
在 `setup` 函数中使用以下**轮询重试**模式。
```javascript
// 在 wrapper 内部定义一个专门添加按钮的函数
function addToolboxButton() {
    // 检查 IITC API 和按钮是否已存在
    if (!window.IITC || !IITC.toolbox || !IITC.toolbox.addButton) return false;
    if ($('#my-plugin-id').length) return true; // 已存在，无需重复添加

    IITC.toolbox.addButton({
        id: 'my-plugin-id',
        label: 'My Plugin',
        title: 'Click to open my plugin',
        action: function() { /* ... */ }
    });
    return true; // 添加成功
}

// 在 setup 函数中
var setup = function() {
    // ... 其他初始化代码 ...

    // 使用轮询来确保按钮被添加
    let tries = 0;
    const interval = setInterval(() => {
        tries++;
        // 如果添加成功，或重试超过10秒，则停止轮询
        if (addToolboxButton() || tries > 20) {
            clearInterval(interval);
        }
    }, 500); // 每 500ms 尝试一次
};
```

## 第 4 步：确保 `setup` 函数的运行时健壮性

如果 `setup` 函数在执行过程中因为其他原因（如解析本地存储的数据失败）抛出未捕获的异常，那么后续的 `addToolboxButton` 也不会被执行。

**问题**: 潜在的运行时错误会静默地中断 `setup` 函数。

**解决方案**: 对 `setup` 函数中所有可能失败的操作（特别是外部依赖，如 `localStorage`）进行 `try...catch` 包装。

**最佳实践**:
对 `JSON.parse` 等操作进行异常处理。
```javascript
// 在插件的 load 函数中
self.load = function () {
    try {
        const storedData = localStorage.getItem('MY_PLUGIN_STORAGE_KEY');
        if (storedData) {
            self.data = JSON.parse(storedData);
        }
    } catch (e) {
        console.error('My Plugin: failed to load data from localStorage. Resetting data.', e);
        self.data = {}; // 如果加载失败，重置为一个空对象，确保插件不会崩溃
    }
};

// 在 setup 函数中第一行就调用它
var setup = function() {
    self.load();
    // ... 其他代码 ...
};
```

## 总结清单

下次遇到同样的问题时，请按以下顺序检查：

1.  **[ ] 头部指令**：你的 `@match`/`@include` 是否包含了 `https://intel.ingress.com/*` 和 `https://intel-x.ingress.com/*`？
2.  **[ ] Wrapper 注入**：你的所有代码是否都被包裹在 `wrapper` 函数中，并使用了标准的注入脚本？
3.  **[ ] 按钮添加方式**：你是否使用了**轮询重试**的模式来调用 `IITC.toolbox.addButton`，以避免竞争问题？
4.  **[ ] 代码健壮性**：`setup` 函数中是否存在可能失败的操作（如 `JSON.parse`）且没有被 `try...catch` 包裹？

遵循以上四点，可以解决绝大多数 Toolbox 链接不显示的问题。
