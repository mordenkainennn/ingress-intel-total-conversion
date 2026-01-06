# Ingress Maximal Field Planner（IMFP）  
## 全新插件开发文档（基于最新算法与动线模型）

---

## 1. 项目背景与目标

### 1.1 背景

传统 fanfield / pincushion 插件侧重于简单的扇形展开和局部 field 构建，其逻辑虽然安全，但在 AP（经验值）产出上**无法达到理论上可能的极限**。  
而其他静态几何填充插件（如 homogeneous-fields）忽视了现实操作顺序与执行合法性。

本插件的目标是：

> **在 Ingress 的非交叉 link 规则和现实操作约束下，  
> 规划一条真实可执行的玩家动线，使得最终构造的 field 网络接近平面图最大 field 数，从而最大化 AP。**

---

## 2. 核心问题定义

### 2.1 输入

- 一组 Portal 点集 `P = {p0, p1, ..., pn}`
- 一个 Anchor Portal `A`
- 底边两个 Portal `B0, B1`
- 用户可手动排除的 Portal 列表（因地形 / 不开放等原因）

---

### 2.2 约束（必须严格满足）

1. **Ingress link 约束**
   - 任意 link 不可与已有 link 相交
   - Link 必须在真实游戏操作中逐步生成

2. **Link 外连上限约束**
   - 单 Portal 默认最大外连 8 条
   - 每个 SoftBank Ultra Link（SBUL） +8 条外连
   - 单 Portal 最大 SBUL ≤ 4（理论上最大外连 ≤ 40）

3. **执行顺序合法性**
   - 规划的 link 必须逐步执行而不违反上述链接与外连约束

---

### 2.3 目标

在满足所有现实约束条件下：

- 规划一条玩家实际可行的动线（path）
- 动线经过所有选定 Portal
- 生成的 link 与 field 集合近似 **最大平面图**
- 最大化 field 数（即极大化 AP）

---

## 3. 总体算法架构（“动线驱动 + 平面细分”）

IMFP 插件整体规划分为以下阶段：

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4
```

其中：

- **Phase 0**：隐含支撑结构建立
- **Phase 1**：从底边 B0 出发遍历内部
- **Phase 2**：从 B1 返回 B0 构建内部 link / field
- **Phase 3**：最大外三角封口
- **Phase 4**：外封口后的内部压榨
- **SBUL 约束贯穿全过程，作为一等触发条件**

---

## 4. 模块设计与详细流程

### 4.1 Phase 0：Anchor 支撑阶段（静默前置）

目标是满足后续 field 生成的前提：

> 对所有参与 Portal `{B0, B1, p1, ..., pn}`  
> 建立到 Anchor `A` 的一条潜在 link

这一阶段：

- 不计算 Field
- 不输出操作
- 仅建立虚拟支撑边（视为已存在）

这是算法内部前提，用于简化后续动态过程

---

## 4.2 Phase 1：底边 B0 → B1（动线起点到终点）

实际玩家从 `B0 → ... → B1` 进行单次遍历：

- 在访问每个 Portal `p` 时：
  - 若尚未与 `A` 相连，则建立 `p → A`
- 不建立 Portal 之间的其他连接
- 不执行封口
- 不细分面

此阶段输出：
- Visit 顺序
- `p → A` 型 link
- 外连统计（用于 SBUL 需求判断）

---

## 4.3 Phase 2：返回构造阶段（B1 → B0）

这是整个算法的核心“爆发阶段”：

- 玩家从 `B1 → ... → B0` 返回
- 在返回过程中：
  - 尝试对沿线 Portal 之间建立不交叉的 link
  - 每次建立 link 都逐步**划分已有面**
  - 尽可能生成 field
- 所有 link 都需满足：
  - 不与已有 link 相交
  - 不违反外连上限（SBUL 资源）

此阶段输出：
- 合法 link 顺序
- 动线返回过程中构造的 field

---

## 4.4 Phase 3：最大外三角封口（真正的 Field 爆发）

当玩家返回到初始底边 Portal `B0` 时：

- 尝试建立 `B0 ↔ B1`（最大外三角的底边封口）
- 生成**最大外层 field**
- 此时 field 的数量将发生一次质的跳跃

此阶段输出：
- 底边封口 link
- 最大外三角 field

---

## 4.5 Phase 4：外封口后的内部压榨（可选）

在外三角已封闭的状态下：

- 若内部仍存在可合法链接
- 且不违反 SBUL 约束
- 则继续执行内部细分内容
- 每条合法 link 继续尽可能生成 field

此阶段输出：
- 内部补充 link
- 进一步细分生成的 field

---

## 5. 几何与算法核心模块

### 5.1 外三角确定与用户参与

由于三角形的“最大外层轮廓”由人眼比算法更容易判断：

- 用户在 UI 中选择：
  - 底边 Portal (`B0`, `B1`)
  - Anchor Portal `A`
- 系统自动识别：
  - 三角形内部 Portal
- 用户可：
  - 手动将不合适 Portal 放入“Exclude List”

这一阶段用户参与减少计算压力，并提高执行可行性

---

### 5.2 内部 Portal 列表构建

插件自动筛选：

- 所有属于三角内的 Portal
- 排除用户 Exclude List

生成：
```
P_inside = { p1, p2, ..., pn }
```

---

## 6. Link 外连统计与 SBUL 模块

### 6.1 外连度统计

在任意规划阶段，都统计：

```text
outDegree(p) = number of link 已规划 / 待执行，从 p 外连出去
```

并对比 Link Capacity:

```text
maxLinksWithoutSBUL = 8
linksPerSBUL = 8
maxSBUL = 4
maxLinkCapacity = 40
```

### 6.2 SBUL 需求计算

对于每个 Portal p：

```text
requiredSBUL(p) = ceil((outDegree(p) - 8) / 8)
```

分类提示：

- 🟢 Unbounded (≤8)
- 🟡 1–2 SBUL required
- 🟠 3–4 SBUL required
- 🔴 Impossible (>40)

插件 UI 必须有可见提示

---

## 7. 执行顺序合法性生成（核心约束校验）

执行顺序必须保证：

1. 每条 link 在执行前：
   - 不与任何已存在的 link 相交
2. 严格按动线顺序构造，不允许提前或回头
3. 在外连达到某 Portal Link Capacity 上限时：
   - 自动回退
   - 或提示用户调整路径 / 排除 Portal

---

## 8. 插件 UI / UX 设计建议

### 8.1 用户输入面板

- Anchor Portal 选择
- 底边 Portal 选择（B0, B1）
- 内部 Portal 列表 + 排除表
- SBUL 数量设定 / 上限
- 可切换：
  - 默认模式（2 SBUL）
  - 进阶模式（允许 3–4 SBUL）

---

### 8.2 视觉反馈

- Map layer：
  - 未执行 link
  - 已执行 link
- SBUL 需求高亮
- 动线路线图
- Field 产出热力图

---

## 9. 输出结果

插件输出包括：

- Visit 顺序文本
- Link 建立顺序
- SBUL 需求摘要表
- Field 产出摘要
- Link / Field 可视图层

---

## 10. 约束与失败处理

### 10.1 失败提示规则

若规划器检测：

- 任一 Portal 外连需求 > 40
- 执行顺序不可能继续
- 用户无足够 SBUL

则规划失败，提示：

> “当前配置下无法完成合法执行，请调整底边 / 排除列表 / SBUL 设置”

---

## 11. 总结

IMFP 不是简单的 fanfield 插件，而是：

> **一种结合人机协同、动线驱动、最大平面图构建的高阶 AP / Field 极值规划工具**

它兼顾：

- Ingress 实战操作可行性
- 最大 field 产出
- Link 容量与 SBUL 资源约束

为高阶玩家提供**真正意义上的场景最优规划方案**。

---

*End of Document*
