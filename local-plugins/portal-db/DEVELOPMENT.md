# Portal DB 插件开发文档

## 1. 插件概述
Portal DB 旨在为 IITC 提供一个本地持久化的 Portal 基础信息数据库。它通过 IndexedDB 存储 Portal 的核心地理位置和归属信息，主要目的是为其他需要“视野外”数据的插件提供支持。

## 2. 数据库设计 (IndexedDB)
*   **数据库名**: `IITC_PortalDB`
*   **版本**: `1`
*   **对象仓库 (Store)**: `portals`
*   **主键**: `guid` (string)
*   **索引**:
    *   `latE6`: 提升区域查询性能
    *   `lngE6`: 提升区域查询性能
    *   `team`: 允许按阵营筛选

### 存储字段格式
```typescript
interface PortalRecord {
  guid: string;      // Portal 唯一标识
  latE6: number;     // 纬度 * 1e6
  lngE6: number;     // 经度 * 1e6
  team: 'R'|'E'|'N'|'M'; // R: Resistance, E: Enlightened, N: Neutral, M: Machina
  lastSeen: number;  // 最后一次在地图上看到的毫秒时间戳
}
```

## 3. 数据采集逻辑
*   **监听钩子**: `mapDataEntityInject`
*   **处理流程**:
    1.  遍历注入的 `entities`。
    2.  识别类型为 `portal` 的实体。
    3.  解析原始数组（通常格式为 `[guid, timestamp, [team, latE6, lngE6, ...]]`）。
    4.  对比本地数据库，若数据较新或信息有变则更新。
    5.  `lastSeen` 始终更新为当前注入时间。

## 4. 对外 API (window.plugin.portalDb)
所有数据库操作均为异步，返回 `Promise`。

*   `getPortal(guid)`: 获取单个 Portal 信息。
*   `getPortalsInBounds(bounds)`: 获取 Leaflet `LatLngBounds` 区域内的所有 Portal。
*   `refreshPortal(guid, data)`: 手动更新/插入一个 Portal 记录。
*   `getStats()`: 获取数据库统计信息（如总数）。

## 5. UI 交互
*   **入口**: IITC 侧边栏菜单“Portal DB”。
*   **功能对话框**:
    *   显示当前存储的 Portal 总量。
    *   **导出**: 生成包含所有 Portal 数据的 JSON 文件并下载。
    *   **导入**: 选择 JSON 文件并合并/覆盖到本地数据库。
    *   **重置**: 清空 IndexedDB 仓库（需二次确认）。

## 6. 注意事项
*   该插件**不提供**自动清理机制，数据将永久保存直至用户手动重置或导出。
*   导入大规模数据时应使用 `IDBTransaction` 的批量操作以提高性能。
