# Portal DB 插件开发文档

## 1. 插件概述

**Portal DB** 是一个面向 IITC 插件生态的基础设施插件，旨在为客户端提供一个**本地、持久化的 Portal 基础信息数据库**。

该插件通过 IndexedDB 存储 Portal 的核心地理位置与辅助状态信息，主要用于支持以下场景：

- 为需要“视野外 Portal 坐标”的插件提供数据来源  
- 为历史回放、规划分析等功能提供稳定的坐标事实层  
- 作为多个插件共享的 Portal 信息事实源（Single Source of Truth）

Portal DB **不试图还原或同步游戏的完整实时状态**，而是提供一个**长期积累、尽量可靠的本地数据资产**。

---

## 2. 数据库设计（IndexedDB）

### 2.1 基本信息

- **数据库名**：`IITC_PortalDB`
- **数据库版本**：`1`
- **对象仓库（Object Store）**：`portals`
- **主键（KeyPath）**：`guid`（string）

### 2.2 索引设计

为支持常见查询场景，定义以下索引：

- `latE6`：用于区域范围查询
- `lngE6`：用于区域范围查询
- `team`：用于按阵营筛选（辅助用途）

---

### 2.3 存储字段结构

```typescript
interface PortalRecord {
  guid: string;            // Portal 唯一标识
  latE6: number;           // 纬度 * 1e6
  lngE6: number;           // 经度 * 1e6
  team: 'R' | 'E' | 'N' | 'M'; 
                           // R: Resistance
                           // E: Enlightened
                           // N: Neutral
                           // M: Machina
  lastSeen: number;        // 本地客户端最近一次在 Intel 地图实体数据中观察到该 Portal 的时间戳（毫秒）
}
```

#### 关于 `lastSeen` 的重要说明

- `lastSeen` **仅表示本地客户端最近一次在地图实体数据中“看到”该 Portal 的时间**
- 它 **不代表**：
  - Portal 创建时间
  - Portal 被攻击 / 翻色时间
  - 游戏服务器侧的任何状态变更时间

该字段主要用于评估**数据新旧程度与可信度**，而非游戏行为分析。

---

## 3. 数据采集逻辑

### 3.1 数据来源

- **监听钩子**：`mapDataEntityInject`

该钩子在 Intel 地图加载或刷新实体数据时触发，提供原始 entity 数据数组。

---

### 3.2 处理流程

1. 遍历注入的 `entities`
2. 识别类型为 `portal` 的实体
3. 解析原始 entity 数据  
   （通常格式为 `[guid, timestamp, [team, latE6, lngE6, ...]]`）
4. 与本地数据库中的记录进行对比
5. 根据更新策略决定是否写入数据库

---

### 3.3 字段更新策略（核心设计）

#### 坐标（`latE6`, `lngE6`）

- 若数据库中不存在该 Portal → **插入**
- 若坐标与已存记录不同 → **更新**
- 若坐标相同 → **不更新**

坐标被视为 **强事实（strong fact）**，其正确性直接决定其他插件功能是否可用。

---

#### 阵营（`team`）

阵营信息被视为 **弱一致性字段（best-effort）**：

- 若阵营发生变化 → **立即更新**
- 若阵营未变化：
  - 可选：仅在超过设定的时间阈值后才更新
  - 默认实现中不要求每次 entity 出现都写入

阵营信息可能是陈旧的，插件不保证其实时性或准确性。

---

#### `lastSeen`

- 每次 Portal entity 出现在地图数据中时更新
- 表示“最近一次被本地客户端确认存在于地图实体中”

---

## 4. 对外 API 设计（`window.plugin.portalDB`）

Portal DB 通过 JavaScript API 向其他插件暴露功能。  
**所有 API 均为异步，并返回 `Promise`。**

> ⚠️ 外部插件 **不应直接访问 IndexedDB**。  
> IndexedDB 的 schema 与实现细节可能在未来版本中调整，  
> 对外 API 被视为唯一稳定接口。

---

### 4.1 API 列表

#### `getPortal(guid: string)`

获取指定 Portal 的记录。

- 若存在 → 返回 `PortalRecord`
- 若不存在 → 返回 `null`

---

#### `getPortalsInBounds(bounds: L.LatLngBounds)`

获取本地数据库中位于指定地理范围内的所有 Portal。

说明：

- 查询基于 **本地数据库**
- 返回结果可能包含当前不在视野中的 Portal
- 阵营信息可能是陈旧的

---

#### `refreshPortal(guid: string, data: Partial<PortalRecord>)`

手动插入或更新一条 Portal 记录。

主要用于：

- 数据导入
- 调试
- 高级插件联动

---

#### `getStats()`

返回数据库统计信息，例如：

- Portal 总数量
- 数据库占用情况（可选）

---

## 5. UI 交互设计

### 5.1 入口

- IITC 侧边栏菜单项：**Portal DB**

---

### 5.2 功能对话框

功能保持克制，避免干扰正常地图使用：

- 显示当前已存储的 Portal 总数量
- **导出数据**
  - 将全部 Portal 数据导出为 JSON 文件
- **导入数据**
  - 从 JSON 文件导入 Portal 数据
  - 导入时按 `guid` 合并记录
- **重置数据库**
  - 清空 IndexedDB 中的所有 Portal 数据
  - 需要二次确认

---

## 6. 数据保留策略

- Portal DB **不提供自动清理机制**
- 所有 Portal 数据将**无限期保留**
- 数据仅在以下情况下被移除：
  - 用户手动重置数据库
  - 用户主动清理并重新导入数据

该策略的设计目标是：

> 将 Portal 数据视为“长期资产”，而非可随时丢弃的缓存。

---

## 7. 性能与规模预期

- 在典型城市核心区域（~2000 个 Portal）规模下：
  - 插件设计为可常驻运行
  - 不会对地图交互产生明显性能影响
- IndexedDB 写入应使用：
  - 幂等更新
  - 批量事务（`IDBTransaction`）
  - 避免高频无意义写入

---

## 8. 未来演进说明（非 v0.1 实现内容）

以下功能可能在未来版本中引入：

- `teamUpdatedAt` 字段，用于更精细地描述阵营信息的新旧程度
- 更丰富的统计信息接口
- 更灵活的数据导出 / 分片管理方案

这些内容 **不影响当前版本 API 的稳定性承诺**。

---

## 9. 设计原则总结

- 坐标是 **强事实**，必须尽可能准确、可复用
- 阵营是 **弱事实**，只提供参考，不保证实时
- 数据宁可多存，不可误删
- API 是协议，存储是实现细节

Portal DB 的目标不是“看起来聪明”，  
而是 **多年之后依然值得被信任和依赖**。
