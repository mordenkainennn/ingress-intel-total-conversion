# IITC-CE 插件开发文档  
## Portal Afterimage

---

## 1. 插件概述（Overview）

**Portal Afterimage** 是一个 IITC-CE 插件，用于在 **官方 Intel 地图不显示 portal 的缩放级别** 下，  
将**玩家曾经真实看到过的 portal** 以“残影（afterimage）”的形式绘制在地图上。

它的目标不是补全数据、也不是提高效率，而是：

> **为 Intel 地图增加“记忆层”，修复缩放变化导致的空间认知断裂。**

---

## 2. 核心设计原则（Design Principles）

### 2.1 真实性与克制

- **只使用客户端真实接收到的数据**
- 不推断、不猜测、不补全
- 不声明完整性、不承诺准确性

> Afterimage 表示的是：  
> **“我曾在这里见过 portal”**  
> 而不是：  
> **“这里一定存在 portal”**

---

### 2.2 不干扰原生渲染

- ❌ 不覆盖、不修改原生 portal 渲染
- ❌ 不在官方 portal 可见的 zoom 级别显示 afterimage
- ✅ Afterimage 仅作为补充层存在

---

### 2.3 本地、私有、长期记忆

- 数据仅保存在 **IndexedDB**
- 不导入、不导出
- 不跨设备
- 不自动删除历史数据

插件语义是**个人地图记忆**，而非共享情报。

---

### 2.4 优雅降级，拒绝崩溃

- 在极端高密度场景下：
  - 允许信息缺失
  - 允许抽象显示
- **绝不允许页面崩溃或浏览器假死**

> “不画”永远比“画到崩”更诚实。

---

## 3. 功能边界（Explicit Non-Goals）

Portal Afterimage **明确不做** 以下事情：

- ❌ 显示“所有 portal”
- ❌ 推断 link 端点或 field 覆盖区域
- ❌ 判断 portal 是否已被 Niantic 删除
- ❌ 修改、增强、替代官方 portal 图层
- ❌ 提供战术或博弈优势

---

## 4. 数据模型设计（Data Model）

### 4.1 存储方案

- 使用 **IndexedDB**
- 数据库名称：`portal-afterimage`
- Store：`portals`
- Key：`guid`

### 4.2 Portal 记录结构

```json
{
  "guid": "string",
  "lat": number,
  "lng": number,
  "name": "string",
  "lastSeen": number,        // Unix timestamp (ms)
  "s2cell": "string"         // 固定 level 的 S2 cell id
}
```

说明：

- `lastSeen` 用于**管理与维护**，不用于可见性判断
- 不存储 faction、resonator、mod、link 等信息

---

## 5. 数据采集策略（Data Ingestion）

### 5.1 数据来源

- 地图 entity 数据（portal 被加载到视野时）
- portal detail（如可获得，用于补充 name）

### 5.2 更新规则

- 同 GUID：
  - 覆盖坐标
  - 更新 `lastSeen`
- 不尝试合并不同 GUID 的近距离 portal
- 不判断 portal 是否“移动”或“异常”

---

## 6. 显示逻辑（Rendering Logic）

### 6.1 显示条件

Afterimage **仅在以下条件同时满足时显示**：

1. 当前 zoom 级别 **官方 portal 图层不显示**
2. 插件图层被启用
3. 当前视野内存在缓存数据

---

### 6.2 空间抽象策略（关键）

#### 6.2.1 S2 Cell 抽象

- 固定使用一个中等精度的 S2 Level（例如 Level 15）
- **每个 S2 Cell 最多显示 1 个 afterimage**

代表点选择策略（可配置但默认简单）：

- 最近 `lastSeen`
- 或首次 `lastSeen`

---

#### 6.2.2 代表点的语义

- 表示该 cell 内 **至少存在过一个 portal**
- 不表示数量
- 不表示精确位置

---

### 6.3 极端密度下的降级策略

#### 6.3.1 硬性绘制上限

```text
MAX_DRAWN_ELEMENTS = 5000
```

- 超过上限：
  - 静默截断
  - 不提示、不警告、不 debug

---

#### 6.3.2 可选降级模式（设计预留）

当视野内 S2 cell 数或 afterimage 数极高时：

- 不绘制具体点
- 改为：
  - 区域存在感（低对比圆 / 热度块）
  - 或完全不绘制

该行为不影响插件语义正确性。

---

## 7. 渲染实现建议（Implementation Notes）

### 7.1 Leaflet 层级

- 使用独立 `LayerGroup`
- 不复用原生 portal marker
- 不绑定 click / hover 事件（默认）

### 7.2 渲染方式

推荐顺序：

1. `L.CircleMarker`（简单、足够）
2. Canvas（仅在需要时）

样式建议：

- 小半径
- 低对比
- 半透明
- 无文字

---

## 8. 时间维度设计（Temporal Semantics）

### 8.1 永不自动删除

- 所有 portal 默认永久保留
- 时间不会影响是否绘制

### 8.2 管理用途的时间信息

- 提供一个 **维护界面**（非地图）
- 功能：
  - 按 `lastSeen` 排序
  - 显示“很久未见”的 portal
  - 支持手动批量删除

该界面是**维护工具，不是功能核心**。

---

## 9. 用户界面策略（UI Philosophy）

- 默认情况下：
  - 无提示
  - 无弹窗
  - 无干扰
- 插件应当：
  - “一直在那”
  - “可以被忽略”

唯一合理的 UI：

- 图层开关
- 维护用的列表页面

---

## 10. 性能与规模假设

### 10.1 常态使用

- 普通城市 / 郊区
- 可见 afterimage 数量：几百到几千
- 无明显性能压力

### 10.2 极端情况（如东京全量缓存）

- 不追求完整绘制
- 通过 S2 抽象 + 上限控制保证稳定性
- **允许信息丢失，不允许崩溃**

---

## 11. 合规与生态定位

- 插件行为完全基于：
  - 客户端已获得数据
  - 本地可视化增强
- 不改变服务器交互
- 不提供竞争优势

定位为：

> **“地图语义增强插件”**  
> 而非情报或战术工具。

---

## 12. 总结

Portal Afterimage 并不试图让 Intel 地图“更强”。

它只是让地图：

- 不那么健忘
- 在远景下仍然有连续性
- 保留玩家探索过的痕迹

这是一个**克制、诚实、长期存在**的插件。

> **Afterimage exists not to reveal the world,  
> but to remember where you have been.**

---
