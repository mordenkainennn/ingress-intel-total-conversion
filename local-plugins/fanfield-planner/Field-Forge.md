# Ingress Maximal Field Planner（IMFP）
## —— 基于非交叉约束的 Field / AP 极值规划插件开发文档

---

## 1. 项目背景与目标

### 1.1 背景

传统的 **fanfield / pincushion** 类规划插件，核心目标是：

- 保证 link 不交叉
- 操作路径清晰
- 降低人工执行难度

但其结构上限决定了：

- Field 数量增长为 **O(n)**
- 无法达到 Ingress 平面图理论上的 field 上界
- “回到顶点毒打反射”这一高级技巧，其潜在收益被严重浪费

### 1.2 新插件的核心目标

**Ingress Maximal Field Planner（IMFP）** 的目标不是生成 fanfield，而是：

> **在 Ingress 的 link 不可交叉规则下，  
> 生成一个可执行的、field 数量近似最大化的平面图构造方案，  
> 以最大化 AP（经验值）获取。**

---

## 2. 问题形式化定义

### 2.1 输入（Input）

- 一组 Portal 点集 `P = {p₀, p₁, ..., pₙ}`
- 指定一个 Anchor Portal `A`（可选）
- Portal 的二维坐标（lat/lng 投影平面）

### 2.2 约束（Constraints）

1. 任意 link **不得与已存在 link 相交**
2. link 必须在真实 Ingress 操作中 **存在合法执行顺序**
3. 执行顺序必须是 **单调累积**（不能假设“未来 link 已存在”）

### 2.3 优化目标（Objective）

- **最大化 Field 数量**
- 等价目标：
  - 构造一个 **最大平面图（Maximal Planar Graph）**
  - 即：所有面均为三角形，无法再添加不交叉的 link

---

## 3. 理论基础

### 3.1 几何与图论基础

- Convex Hull（凸包）
- Planar Graph（平面图）
- Maximal Planar Graph（最大平面图）
- Polygon Triangulation（三角剖分）

### 3.2 Ingress 规则映射

| 数学概念 | Ingress 对应 |
|--------|--------------|
| 顶点 | Portal |
| 边 | Link |
| 面 | Field |
| 平面图 | 不交叉 link 集合 |
| 最大平面图 | AP / Field 极值结构 |

---

## 4. 总体算法架构

插件不再使用传统的 Phase 1 / Phase 2 fanfield 模型，而是采用 **结构驱动的多阶段构造模型**：

```
Input Portals
   ↓
Convex Hull Construction
   ↓
Hull Structural Linking
   ↓
Interior Triangulation Planning
   ↓
Executable Link Order Generation
   ↓
Anchor Reflection Optimization（可选）
```

---

## 5. 模块设计详解

### 5.1 模块一：Convex Hull 构建

#### 目标
- 找出 Portal 集合的最外层凸包 `H`

#### 方法
- Graham Scan / Monotonic Chain
- 输出为按顺序排列的凸包顶点集合

#### 性质
- 凸包边 **天然不与任何内部 link 相交**
- 是后续所有结构边的安全边界

---

### 5.2 模块二：凸包结构边（Structural Links）

#### 定义
- Hull 中相邻顶点之间的 link
- Anchor → Hull Portal 的临时 link（可选）

#### 目的
- 构建平面骨架
- 明确可执行的“封闭区域”

#### 特点
- 数量少
- 位置关键
- **优先级高于任何产出型 link**

---

### 5.3 模块三：内部三角剖分（Interior Triangulation）

#### 输入
- 凸包多边形
- 所有位于凸包内部的 portals

#### 目标
- 将整个区域剖分为 **若干三角形**
- 使图达到最大平面状态

#### 可选算法
- Ear Clipping（适用于凸包）
- Incremental Delaunay-like（需约束非交叉）
- Visibility Graph + 贪心三角化

---

### 5.4 模块四：可执行顺序生成（Execution Order）

这是整个插件**最核心、最困难的模块**。

#### 问题定义
> 给定一个最大平面图，  
> 是否存在一个 link 执行顺序，使得每一步都合法？

#### 解决策略

1. **结构边优先**
   - Hull 边
   - Anchor 临时边
2. **由外向内**
   - 保证新增边只分割已有面
3. **Ear Removal 思想**
   - 每一步只“吃掉”一个可见三角形

#### 输出
- 一个线性 link 操作序列
- 每一步都满足 Ingress 规则

---

### 5.5 模块五：Anchor Reflection（可选）

#### 设计思想

- Anchor 的 link 作为“临时支架”
- 在内部结构完成后：
  - 回到 Anchor
  - 毒打（移除 link）
  - 重新链接 Hull Portals

#### 收益
- 一次性生成最大外层 Field
- 不破坏内部最大平面结构
- 极大提升 AP 收益

---

## 6. UI / UX 设计原则

### 6.1 插件模式选择

- Fanfield Mode（兼容旧玩法）
- Maximal Field Mode（新算法）
- Hybrid Mode（自动判断）

### 6.2 可视化层

- 凸包高亮
- 结构边 / 产出边区分颜色
- “理论最大 Field” 虚线预览
- 非立即执行 link 标注

---

## 7. 风险与限制

### 7.1 算法复杂度

- 凸包：O(n log n)
- 三角剖分：O(n²)（可接受）
- 执行序生成：最坏情况复杂

### 7.2 实战风险

- 实际地图存在：
  - blocker
  - key 不足
  - 地形限制
- 插件需明确标注：
  - **“理论最优 ≠ 一定能全执行”**

---

## 8. 与现有插件的关系

| 插件 | 定位 |
|----|----|
| fanfield / pincushion | 安全、低风险 |
| homogeneous-fields | 静态几何填充 |
| **IMFP（本插件）** | **AP / Field 极值规划** |

---

## 9. 结语

**Ingress Maximal Field Planner** 并不是为了“让所有玩家都用”，而是为了：

- 给高阶玩家一个 **理论上限**
- 把经验技巧提升为 **可计算策略**
- 探索 Ingress 规则下的 **最优平面构造问题**

> 这是一个从“玩法总结”走向“算法设计”的插件。

---

*End of Document*
