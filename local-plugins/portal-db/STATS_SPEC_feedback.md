# Portal DB 统计与调试系统开发文档（STATS_SPEC）

## 1. 设计目标（Goals）

本统计与调试系统的目标是：

- 对 Portal DB 更新行为进行**原因分类统计**
- 验证 Portal 更新过滤规则（`UPDATE_THRESHOLD` / `lastSeen` 机制）的有效性
- 为开发者与高级用户提供**直观、可解释的运行态观测数据**
- 在不增加 Portal DB 写入压力的前提下，提升系统可验证性（Observability）

---

## 2. 设计原则（Design Principles）

1. **观测系统不参与业务逻辑**
   - 统计数据不作为 replay、规划或计算输入
   - 统计系统失效不应影响 Portal DB 正常运行

2. **低侵入性**
   - 不增加 IndexedDB 写入频率
   - 不引入额外 DB schema / migration 成本

3. **可解释性优先**
   - 面向“人”的统计，而非事件级日志
   - 聚合优先于明细

4. **明确边界**
   - 统计数据 ≠ 审计日志
   - 不追求跨设备、跨浏览器一致性

---

## 3. 更新原因枚举（UpdateReason）

用于标识每次 Portal 处理后的**最终决策结果**。

```js
const UpdateReason = {
  NEW_PORTAL: 'new_portal',             // DB 中不存在的新 Portal
  TEAM_CHANGED: 'team_changed',         // 阵营变化
  COORD_CHANGED: 'coord_changed',       // 坐标变化（Portal Move）
  BOTH_CHANGED: 'both_changed',         // 坐标与阵营同时变化
  LASTSEEN_REFRESH: 'lastseen_refresh', // 数据未变，但超过 24h，刷新 lastSeen
  SKIPPED_FRESH: 'skipped_fresh'         // 数据未变且仍在 freshness 窗口内
};
```

### 设计说明

- 枚举是**互斥且完备**的
- 每次 Portal 处理 **只记录一个原因**
- `SKIPPED_FRESH` 是最常见情况，用于验证过滤策略是否生效

---

## 4. 内存统计模型（Hourly Buckets）

### 4.1 Bucket 结构

- **时间粒度**：小时
- **Key 格式**：`YYYY-MM-DDTHH`（如 `2026-02-02T14`）
- **内容**：各 `UpdateReason` 的计数

```js
{
  "2026-02-02T14": {
    new_portal: 12,
    team_changed: 4,
    coord_changed: 1,
    both_changed: 0,
    lastseen_refresh: 63,
    skipped_fresh: 1842
  }
}
```

---

### 4.2 生命周期

- 内存中最多保留 **最近 48 小时** 的 buckets
- 旧 bucket 会被定期清理
- Bucket 的创建与递增发生在 **Portal 处理热路径**

---

## 5. 持久化策略（localStorage Snapshot）

### 5.1 选型说明

统计系统采用 **localStorage** 进行轻量级持久化：

- localStorage：
  - 足够容纳 48 个小时桶
  - 无 schema、无 migration
  - 与业务 DB 完全解耦
- **不使用 IndexedDB**
- 不引入 Portal DB 版本升级

---

### 5.2 存储 Key 与结构

```js
const STORAGE_KEY = 'portal-db-update-stats';
```

```js
{
  version: 1,
  buckets: {
    [hourKey]: BucketData
  },
  lastFlushAt: number
}
```

---

### 5.3 同步（Flush）策略

- **定时同步**：每 5 分钟
- **事件同步**：
  - `beforeunload`
  - Portal DB 管理窗口关闭时
- 同步为 **全量覆盖写入**
- 不逐事件写盘

---

## 6. Bucket 清理机制（Housekeeping）

### 6.1 清理原则

- 清理逻辑 **不在热路径执行**
- 清理是 housekeeping 行为，而非统计行为的一部分

---

### 6.2 清理触发时机

以下任一即可触发清理：

1. 定时任务（推荐）  
   - 每 10 分钟执行一次
2. UI 打开时
3. Flush 前顺带执行（非强依赖）

---

### 6.3 清理规则

- 删除早于当前时间 **48 小时** 的 bucket
- 同时清理：
  - 内存 buckets
  - localStorage 中的 buckets

---

## 7. UI 设计与实时性策略

### 7.1 UI 定位

- 这是一个 **观测仪表盘（Dashboard）**
- 不是操作反馈 UI
- 不要求事件级实时跳动

---

### 7.2 刷新策略

- UI 打开后：
  - 每 `refreshInterval`（默认 2000ms）刷新一次
- 刷新内容为：
  - 当前内存统计的快照
- UI 刷新：
  - 与 Portal 处理解耦
  - 与地图拖动解耦

---

### 7.3 展示维度

#### Past 1 Hour
- 当前小时 bucket 的统计

#### Past 24 Hours
- 最近 24 个 bucket 的聚合结果

---

### 7.4 用户可读分类

1. **Core Data Updated**
   - `NEW_PORTAL`
   - `TEAM_CHANGED`
   - `COORD_CHANGED`
   - `BOTH_CHANGED`

2. **Activity Refreshed**
   - `LASTSEEN_REFRESH`

3. **Skipped (Redundant)**
   - `SKIPPED_FRESH`

---

## 8. 调试与配置开关

```js
window.plugin.portalDB.debug = {
  showStats: false,        // 是否显示统计区域
  refreshInterval: 2000    // UI 刷新间隔（毫秒）
};
```

- 默认关闭
- 开启后：
  - 启动 UI 刷新定时器
  - 不影响后台统计

---

## 9. 实施路线图（Implementation Roadmap）

1. **统计管理器**
   - Hourly bucket 创建与递增
   - UpdateReason 记录接口

2. **Housekeeping**
   - 定时清理
   - Flush 管理

3. **localStorage 持久化**
   - Snapshot 写入
   - 启动时恢复

4. **UI 集成**
   - Portal DB 管理窗口扩展
   - 聚合展示逻辑

---

## 10. 非目标声明（Non-goals）

本统计系统 **明确不做**：

- 不做事件级审计日志
- 不保证跨设备 / 跨浏览器一致性
- 不作为 replay、规划或算法输入
- 不进入 Portal DB IndexedDB schema
- 不触发 Portal DB 版本升级

---

## 11. 总结

该统计与调试系统：

- 提供清晰、低成本的可观测性
- 严格区分业务数据与观测数据
- 不引入额外 DB 压力或生态破坏
- 支撑 Portal DB 长期演进与规则调优

**状态：设计冻结，可直接进入实现阶段**