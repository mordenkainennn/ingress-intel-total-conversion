# IITC Fanfield Planner  
## Phase 1「安全模式（方案二）」改进开发文档

作者：mordenkainennn  
目标读者：插件维护者 / 二次开发者 / 高阶 Ingress 玩家  
适用版本：fanfield-planner ≥ 1.9  

---

## 一、背景与问题说明

### 1. 插件原始设计目标

Fanfield Planner 的目标是：

- 以 **单 Anchor + 多 Base** 的结构
- 自动规划 link / field 顺序
- 支持：
  - Phase 1：建立基础结构
  - Phase 2：回 Anchor 毒打后反向补 field

原始 Phase 1 试图通过 **贪心回溯（layer/back-link）** 在早期最大化 field 数量。

---

### 2. 已确认问题（Phase 1 交叉 Link）

在 Phase 1 中，算法会规划出以下 **Ingress 规则不允许** 的情况：

- Base ↔ Base link 与已有 link **发生几何交叉**
- 这些交叉 **发生在 field 内部**，非 Anchor 射线层面
- 在游戏中无法实际完成

---

### 3. 问题根因（结论）

> 原算法 **未限制 Phase 1 的拓扑结构**，  
> 允许 Base 之间进行非局部连接，  
> 而极角排序 **并不等价于无交叉的多边形顺序**。

---

## 二、方案二概述（安全模式）

### 方案二核心思想

**Phase 1 只允许以下两种 link：**

1. `current → anchor`
2. `current → previous base`

**明确禁止：**

- current → 任意更早 base（layer / back-link）
- Phase 1 内部多层三角化

---

### 对应 Ingress 实战逻辑

- Phase 1：  
  - 只建立 **不可能交叉** 的“扇形链”
  - 结构稳定、可执行
- Phase 2：  
  - 回 Anchor
  - 扇形反向 throw
  - 承担主要 field 数量

---

## 三、改进后 Phase 1 的几何与拓扑特性

### 1. 拓扑结构

```text
Anchor
  |\
  | \
 B1--B2--B3--B4
```

性质：

- 所有 Base → Anchor link 共点
- Base → Base link 只存在于相邻节点
- 整体是 **平面图（planar graph）**
- 不可能出现 link crossing

---

### 2. 数学与规则保证

| 条件 | 是否满足 |
|----|----|
| 无 link 交叉 | ✅ |
| 符合 Ingress 规则 | ✅ |
| 顺序可执行 | ✅ |
| 与极角排序兼容 | ✅ |

---

## 四、代码级改动说明

### 1. 保留的逻辑（无需修改）

以下逻辑 **保持不变**：

- Anchor / Base 选择机制
- Base 按 Anchor 极角排序  
  `sortBasePortalsByAngle`
- Travel path 优化  
  `findShortestPathForSortedBase`
- Phase 2 规划与绘制
- UI / Dialog / 图层结构

---

### 2. 必须移除的逻辑（关键）

#### ❌ 原 Phase 1 中的 Greedy Back-linking

```js
// 原代码（需要整体移除）
for (let k = index - 2; k >= 0; k--) {
    const backGuid = optimizedTravelPath[k];
    const backLL = window.portals[backGuid].getLatLng();

    let isSafe = true;
    for (let r = k + 1; r < index; r++) {
        if (self.segmentsIntersect(currentLL, backLL, rays[r][0], rays[r][1])) {
            isSafe = false; break;
        }
    }

    if (isSafe) {
        links.push({ to: backGuid, type: 'layer' });
        keysNeeded[backGuid]++;
    }
}
```

---

### 3. 改进后的 Phase 1 链接规则（伪代码）

```js
for each base in optimizedTravelPath:
    links = []

    // 1. 永远 link 到 Anchor
    links.push(current → anchor)

    // 2. 如果不是第一个 base
    if has previous base:
        links.push(current → previous)

    // 不再允许任何 back-link
```

---

### 4. 改进后的 Phase 1 Field 生成规则

```text
当且仅当：
- current → anchor 已存在
- current → previous 已存在
- previous → anchor 已存在（必然）

⇒ 生成一个 field：
(current, anchor, previous)
```

对应代码逻辑：

```js
if (link.type === 'chain') {
    plan.push({
        type: 'field',
        p1: currentGuid,
        p2: anchorGuid,
        p3: prevGuid,
        phase: 1
    });
}
```

---

## 五、Key 需求与行为变化

### 1. Phase 1 Key 消耗变化

| Portal | 原方案 | 方案二 |
|----|----|----|
| Anchor | 高 | 中（集中） |
| Base | 高（多点） | 低（仅相邻） |

优点：

- 更符合实际 farm 行为
- 减少“每个点都要大量 key”的压力

---

### 2. Phase 2 不受影响

Phase 2 逻辑 **完全无需修改**：

- Anchor destroy / recapture
- Anchor → Base 顺序 fan
- Field 数量主要集中在 Phase 2

---

## 六、最终效果对比总结

| 维度 | 原 Phase 1 | 改进后 Phase 1 |
|----|----|----|
| Link 是否交叉 | ❌ 可能 | ✅ 不可能 |
| 实战可执行性 | ❌ | ✅ |
| 算法复杂度 | 高 | 低 |
| 用户信任度 | 易翻车 | 稳定 |
| 维护成本 | 高 | 低 |

---

## 七、设计哲学说明（建议写入 README）

> Phase 1 采用“安全模式”，  
> 保证所有规划 **在 Ingress 游戏规则下 100% 可执行**。  
>  
> 高密度三角化虽在几何上可行，但不适合真实战术环境，  
> 因此被有意限制。

---

## 八、可选扩展（未来方向）

如未来需要，可考虑：

- ☑ 高级选项：  
  “启用实验性 Phase 1 三角化（可能产生非法 link）”
- ☑ 可视化提示：  
  标注 Phase 1 / Phase 2 承担的 field 数比例
- ☑ 估算翻车风险等级

---

## 九、结语

本次改动不是“功能削弱”，而是：

> **从几何最优 → 实战最优 的一次转向**

它使 Fanfield Planner：

- 更符合 Ingress 老玩家的真实打法
- 更值得被长期使用
- 也更容易维护和扩展

---  
**End of Document**
