# Portal DB 统计与调试系统开发文档 (STATS_SPEC)

## 1. 目标
通过对 Portal 更新原因进行分类统计，验证过滤规则（UPDATE_THRESHOLD）的有效性，并为用户提供数据资产增长的直观感受。

## 2. 数据结构设计

### 2.1 更新原因枚举 (UpdateReason)
用于在代码中标识每次处理 Portal 数据后的行为：
- `NEW_PORTAL`: 数据库中不存在的新 Portal。
- `TEAM_CHANGED`: 仅阵营发生了变化。
- `COORD_CHANGED`: 仅坐标发生了变化。
- `BOTH_CHANGED`: 坐标和阵营同时发生了变化。
- `LASTSEEN_REFRESH`: 数据未变，但距离上次看到已超过 24 小时，触发了 `lastSeen` 写入。
- `SKIPPED_FRESH`: 数据未变且在 24 小时阈值内，被逻辑跳过（最常见的情况）。

### 2.2 内存统计桶 (Hourly Buckets)
- **键名格式**: `YYYY-MM-DDTHH` (例如 `2026-02-02T14`)。
- **存储内容**: 一个包含上述枚举计数的对象。
- **生命周期**: 
  - 内存中保留最近 48 小时的数据。
  - 统计窗口打开时，每 2 秒刷新一次 UI。

## 3. 持久化策略 (Hybrid Storage)

为了平衡性能与数据安全性，采用“内存计数 + 异步快照”模式：
- **内存层**: 高频累加，不直接触发 I/O。
- **持久层 (IndexedDB)**: 
  - 数据库 `IITC_PortalDB` 升级至版本 `2`。
  - 新增 Object Store: `statistics`，主键为小时字符串（bucket key）。
- **同步时机 (Flush)**:
  - 定时任务：每 5 分钟执行一次全量同步。
  - 事件触发：页面关闭前 (`beforeunload`)、管理窗口关闭时。
- **清理逻辑**: 
  - 执行同步时，删除内存和数据库中早于 48 小时的记录。

## 4. UI 交互设计

### 4.1 统计展示面板
在 Portal DB 管理窗口下方增加 **Update Statistics** 区域，展示以下分类汇总：
1. **Core Data Updated**: `NEW_PORTAL` + `TEAM_CHANGED` + `COORD_CHANGED` + `BOTH_CHANGED`
2. **Activity Refreshed**: `LASTSEEN_REFRESH`
3. **Skipped (Redundant)**: `SKIPPED_FRESH`

### 4.2 展示周期
- **Past 1 Hour**: 当前活跃小时桶的数据。
- **Past 24 Hours**: 过去 24 个桶的累加总和。

## 5. 配置开关
```javascript
window.plugin.portalDB.debug = {
  showStats: false, // 默认关闭，开启后在 UI 显示统计区域并启动实时刷新
  refreshInterval: 2000 // UI 刷新间隔 (ms)
};
```

## 6. 实施路线图
1. **DB 升级**: 增加 `statistics` 存储仓库。
2. **逻辑注入**: 在 `refreshPortal` 和 `bulkUpdatePortals` 中集成计数逻辑。
3. **管理器维护**: 实现内存桶的自动创建、清理及持久化同步。
4. **UI 实现**: 动态生成统计报表区域并绑定实时刷新定时器。
