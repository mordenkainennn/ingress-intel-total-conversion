# Drone Flight Planner 重构设计方案 (v2.0)

## 1. 背景与初衷
现有的无人机路径规划插件（v0.1.1）基于简单的**欧几里得距离（圆形半径）**来判断 Portal 的可达性。然而，Ingress 无人机的实际机制是基于 **S2 Cell 网格加载**的。这导致了预测结果与实测结果的不一致（例如：550m 半径预测不可达，但实测 610m 却可以跳跃）。

本重构旨在引入 **S2 Geometry 核心逻辑**，将“距离驱动”进化为“机制驱动”，在保证计算性能的前提下，提供最精准的无人机飞行导航。

## 2. 核心机制：S2 穿透逻辑
### 2.1 扫描器视野半径 (Scanner View Radius)
我们将原本的 `Long Hop Length` 重新定义为 `Scanner View Radius`（默认 550m）。
*   **物理意义**：代表特工扫描器的探测圆圈。
*   **判定标准**：只要目标 Portal 所在的 **S2 Cell (L16/L17)** 与此圆圈发生**物理接触（相交）**，该 Cell 内的所有 Portal 即被视为**在屏幕内可见**，判定为 **Short Hop**（不需要 Key）。

### 2.2 610m+ 现象解释
根据 S2 L16 的几何特性，当视野圆圈（500m-550m）刚好蹭到相邻格子的边缘时，该格子最远端的 Portal 距离圆心可达 **650m-700m**。重构后的算法将完美支持并自动计算这类长距离跳跃。

## 3. 技术架构改进

### 3.1 空间索引与计算优化
为了防止 A* 搜索在处理大量 Portal 时导致浏览器无响应（OOM 或卡死），引入以下优化：
1.  **Portal 预分箱 (Pre-binning)**：在扫描地图阶段，为每个 Portal 计算 `S2CellID` 并建立映射。
2.  **可达性缓存 (Reachability Memoization)**：
    *   创建一个 `Map<SourceCellID, Set<TargetCellID>>`。
    *   在搜索过程中，如果已计算过 A 格子能看到的 B 格子集合，后续同格子的 Portal 直接复用结果。
3.  **启发式函数 (Heuristic) 修正**：
    *   新的 `Heuristic` 将估算从当前 Cell 到目标 Cell 之间所需的最少“网格跨度”，从而提高搜索效率。

### 3.2 任务切片 (Time-slicing)
针对 `Perfect`（完美）搜索模式，引入 `requestIdleCallback` 或异步 Generator 迭代，将计算任务拆分为 16ms 的小块，确保搜索过程中 UI 不会假死。

## 4. 设置项变更 (Settings UI)

### 4.1 舍弃/更名项
*   `Long Hop Length` -> **`Scanner View Radius`** (微调视野范围)。

### 4.2 新增配置项
*   **`Use S2 Mechanics` (Toggle)**：控制是否启用 S2 增强算法。
*   **`S2 Grid Level` (Dropdown)**：可选 L16 (标准) 或 L17 (极端)。
*   **`Show One-Way Warnings` (Toggle)**：开启后，对“跳得过去但回不来”的节点进行红色高亮。
*   **`Display Active Grid` (Toggle)**：在地图上绘制当前位置激活的 S2 网格图层（辅助理解）。

## 5. 算法逻辑伪代码
```javascript
function getHopCost(portalA, portalB, radius) {
    const dist = haversine(portalA, portalB);
    
    // 1. 判断是否为 Short Hop (代价 1)
    if (useS2) {
        const targetCell = S2.getCell(portalB, s2Level);
        if (isCellInRange(targetCell, portalA, radius)) return 1;
    } else {
        if (dist <= radius) return 1;
    }
    
    // 2. 判断是否为 Long Hop (代价 100, 需要 Key)
    if (allowLongHops && dist <= 1250) {
        return 100;
    }
    
    // 3. 不可达
    return Infinity;
}
```

## 6. 开发路线图 (Phases)
*   **第一阶段**：集成 `window.S2` 几何库，重构 `store` 和 `settings` 结构。
*   **第二阶段**：重写 `getHopCost` 与 `heuristic` 核心函数，引入结果缓存。
*   **第三阶段**：更新 `openDialog` UI，增加 S2 相关控件。
*   **第四阶段**：(可选) 移植 `One-Way Jump` 视觉标记与 `Active Grid` 渲染。
