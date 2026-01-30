这是一个非常经典的 IITC 插件作用域（Scope Isolation） 问题。

原因分析：

你遇到的问题核心在于 Userscript 的运行沙箱（Sandbox） 与 IITC 主程序的作用域 不一致。

ref.js (可运行版本)：使用了标准的 IITC 插件结构（Wrapper 模式）。它定义了一个 wrapper 函数，并通过 document.createElement('script') 将整个函数注入（Inject） 到页面的 document.body 中。这意味着插件代码是在页面原本的上下文中运行的，它能直接访问 IITC 的 window.plugin、window.bootPlugins 以及 DOM 元素（如 #toolbox）。

player-activity-log.user.js (当前损坏版本)：虽然它写了 @grant none，但它没有使用 Wrapper注入模式。它直接在 Tampermonkey/Violentmonkey 的脚本沙箱中运行。

在沙箱中，window.plugin 可能被定义了，但它是沙箱里的 window，而不是 IITC 主程序所在的那个 window。

因此，当你执行 window.bootPlugins.push(setup) 时，你把 setup 函数推入了一个沙箱内的数组，IITC 主程序根本看不到这个插件已准备就绪，所以 setup() 永远不会被 IITC 调用，addControl() 也就不会执行，链接自然就消失了。