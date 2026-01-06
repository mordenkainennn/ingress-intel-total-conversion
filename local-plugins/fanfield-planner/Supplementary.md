# Ingress Maximal Field Planner  
## 补充文档：Portal 外连容量（Link Capacity）与 SBUL 约束

> 本补充文档用于 **补足原《Ingress Maximal Field Planner 开发文档》** 中  
> 未显式纳入的 **Ingress 真实游戏规则约束**，  
> 不修改原文结构，仅作为 **设计与实现的强制性补充说明**。

---

## 1. 现实规则补充：Portal 外连 Link 上限

### 1.1 Ingress 官方规则抽象

在 Ingress 中：

- 单个 Portal 默认最大 **8 条外连 link**
- 每部署 1 个 **SoftBank Ultra Link（SBUL）**：
  - +8 条外连 link
- 单玩家常规最大部署：
  - 2 个 Mod
- 极端情况下（活动 / 特殊叠加）：
  - 可达到 4 个 SBUL

### 1.2 外连容量上限表（形式化）

| SBUL 数量 | 最大外连 Link |
|---------|---------------|
| 0 | 8 |
| 1 | 16 |
| 2 | 24 |
| 3 | 32 |
| 4 | 40 |
| >4 | **非法 / 不可完成** |

> ⚠️ **被连接的 Portal（入边）数量无限制**  
> 本文所有约束仅针对 **外连 link（out-degree）**

---

## 2. 为什么 Link Capacity 是一等约束

### 2.1 与 fanfield 插件的本质差异

在传统 fanfield / pincushion 策略中：

- 外连 link 高度集中于 anchor
- 非 anchor portal：
  - 极少超过 3～4 条外连
- SBUL 问题：
  - 通常只出现在 anchor

因此历史插件往往只对 anchor 做提示。

---

### 2.2 在最大平面图模型中的必然性

在 **最大平面图（Maximal Planar Graph）** 中：

- 平均顶点度数 ≈ 6
- 但：
  - 必然存在 **度数 ≥ 8、10 甚至更高** 的顶点

在 IMFP 的目标模型下：

- 内部 portal 可能成为多个三角形的公共顶点
- 外连 link 数快速累积
- **非 anchor portal 触发 SBUL 需求是常态**

> 这是 **图论与几何的必然结果**，  
> 并非算法缺陷。

---

## 3. 插件必须实现的强制功能

### 3.1 Portal 外连统计（必需）

插件必须在规划阶段计算：

```text
outDegree(p) = 规划中从 p 出发的 link 数
```

并将该数值与 Link Capacity 上限对比。

---

### 3.2 SBUL 需求反推（必需）

对每个 Portal 计算：

```text
requiredSBUL(p) = ceil((outDegree(p) - 8) / 8)
```

并分类为：

- 🟢 无需 SBUL
- 🟡 需要 SBUL（1–2）
- 🟠 高风险（3–4）
- 🔴 不可完成（>4）

---

### 3.3 UI 级别提示要求（强制）

插件 UI 必须：

- 明确标注：
  - **哪些 portal 需要 SBUL**
  - **需要几个**
- 提供：
  - Portal 列表视图
  - 地图高亮（颜色或标记）
- 禁止：
  - 仅在 anchor 处提示 SBUL

---

## 4. 规划失败的判定条件（Hard Fail）

以下情况必须被判定为 **不可执行规划**：

1. 任一 portal 的外连 link 数 > 40
2. 用户限制的 SBUL 数量 < 所需 SBUL
3. 执行顺序中存在：
   - 先行 link 已占满外连容量
   - 后续 link 无法建立

此类情况应：

- 明确中断规划
- 提示用户：
  - “该方案在当前资源条件下不可完成”

---

## 5. Link Capacity 作为算法剪枝条件（高级）

### 5.1 剪枝动机

当某 portal 的外连数接近阈值时：

- 继续以其作为三角剖分公共顶点
- 会导致：
  - SBUL 需求指数增长
  - 执行风险急剧上升

---

### 5.2 剪枝策略（可选实现）

在 triangulation 阶段：

- 为每个 portal 维护：
  - 当前 outDegree
  - 允许的最大 outDegree
- 在候选三角形中：
  - 避免选择接近上限的 portal
- 允许：
  - 牺牲少量 field
  - 换取可执行性

---

## 6. 插件模式建议（与原文兼容）

为适配不同玩家资源与目标，建议提供：

### Mode A：Pure Maximal（理论极值）

- 忽略 SBUL 上限
- 用于：
  - 理论分析
  - 上界估计

---

### Mode B：SBUL-Aware（默认推荐）

- 假设：
  - 每 portal ≤ 2 SBUL
- 超限即剪枝或提示

---

### Mode C：Resource-Constrained

- 用户手动指定：
  - 单 portal 可用 SBUL 数
- 算法在约束下：
  - 求近似最优解

---

## 7. 总结

> **一旦 Link Capacity 与 SBUL 被纳入模型，  
> Ingress Maximal Field Planner 就不再是几何算法，  
> 而是一个“带资源约束的平面图最优化问题”。**

这是 IMFP 与所有现有 field 规划插件的 **根本分界线**。

本补充文档中的约束与机制，应被视为：

- **强制性设计要求**
- **插件正确性的组成部分**

---

*End of Supplement*
