# Maximal Field Planner – Roadmap 审阅意见文档

## 文档目的

本文档基于对《Maximal Field Planner – Development Roadmap》的技术审阅，  
总结该 roadmap 的**整体评价、优势确认、潜在风险点以及改进建议**，  
用于：

- 作为后续开发的**设计校验依据**
- 帮助在实现过程中**避免认知偏差**
- 为未来贡献者提供**设计意图说明**

---

## 一、总体评价（结论先行）

**结论：**

> 这是一份**工程上稳健、结构清晰、风险控制合理**的开发 roadmap，  
> 已达到可直接作为 GitHub 项目 Milestone / README 的成熟度。

该 roadmap：

- 与前期算法讨论高度一致
- 正确拆分复杂度
- 明确 MVP 边界
- 没有过早引入过度优化或“完美主义”

唯一需要补强的是：  
**Phase 2 的算法复杂度与失败风险在设计层面略有低估，需要提前设立“安全护栏”。**

---

## 二、整体结构审阅

### 2.1 Phase 划分合理性

| Roadmap Phase | 算法阶段 | 评价 |
|--------------|----------|------|
| Phase 1 | Phase 1（Outbound / 支撑骨架） | 完全一致 |
| Phase 2 | Phase 2（Return / 核心构造） | 完全一致 |
| Phase 3 | Phase 3 + 4（Zipper + Cleanup） | 完全一致 |

✅ Phase 划分与算法模型**一一对应**，不存在“人为工程拆分”。

---

### 2.2 工程节奏控制

- MVP 定义清晰
- 高复杂度逻辑集中在 Phase 2
- Phase 1 即具备独立使用价值
- Phase 3 明确是“优化与完善”，而非补漏洞

这是一个**典型的成熟工程节奏设计**。

---

## 三、Phase 1 审阅意见（高度肯定）

### 3.1 核心优点

#### 3.1.1 MVP 价值点明确

Phase 1 即可做到：

- 用户定义区域
- 获得真实可执行的 outbound 动线
- 明确 Anchor 的 SBUL 资源需求

即便后续 Phase 未完成，该插件仍然**不是“半成品”**。

---

#### 3.1.2 SBUL 作为一等约束被提前引入

在 Phase 1 即实现：

- outDegree 统计
- SBUL 需求计算

这是非常关键的设计决策，因为：

- SBUL 是**硬约束**
- 不是 UI 或后期优化问题
- 会直接决定规划是否可行

---

### 3.2 建议的轻微补充（非必须）

建议在 Phase 1 描述中补充一句设计声明：

> Path Generation 不追求最优，仅保证：
> - 不回头
> - 不重复
> - 全覆盖

目的：
- 降低用户对 Phase 1 算法“最优性”的误解
- 为 Phase 2 保留优化空间

---

## 四、Phase 2 审阅意见（关键风险点）

### 4.1 充分肯定的部分

#### 4.1.1 明确采用“return trip 模拟”而非静态规划

Roadmap 中明确：

> *Simulate the player's return trip*

这是正确且必要的，因为：

- 保证规划与真实操作一致
- 避免“数学可行但玩家无法执行”的方案

---

#### 4.1.2 实时约束检查定义清晰

明确列出：

- Intersection Check
- Link Capacity Check
- 实时决策

这是 Ingress 插件**能否实战的底线条件**。

---

### 4.2 核心风险点（需要补强）

#### 4.2.1 “Greedy”描述存在潜在误解

Roadmap 中使用了表述：

> *greedily decide which new links to create*

从工程角度这是可以接受的，但在设计层面存在风险：

- 裸贪心可能：
  - 提前制造局部最优
  - 阻断后续封口
  - 提前耗尽 link capacity
- 导致：
  - Phase 3 zipper 失败
  - 或整体规划不可完成

---

### 4.3 建议补充的设计护栏（强烈建议）

建议在 Phase 2 中**显式加入一条“安全启发式”说明**，例如：

```markdown
- Safety Heuristics (Initial Version):
    - Never create a link that would isolate unvisited portals.
    - Prefer links that subdivide the currently active face.
    - Avoid creating local high-degree hubs (except Anchor).
```

目的不是要求立即实现复杂算法，而是：

> 明确 Phase 2 使用的是**受限贪心（Constrained Greedy）**，  
> 而不是无约束贪心。

这是一个**认知边界声明**，对长期维护极其重要。

---

## 五、Phase 3 审阅意见（完全肯定）

### 5.1 Zipper 独立成 Feature 的评价

将 `B0 <-> B1` 单独定义为：

> "Zipper Link"

这是非常正确的设计，因为：

- 它是结构性的“质变点”
- 对调试、回滚、失败处理都极其友好

---

### 5.2 Cleanup Pass 设为 Optional 的意义

将 Phase 4 定义为可选：

- 符合真实游戏环境（时间、电量、资源不确定）
- 避免“强迫完美”的执行压力
- 插件更具实战友好性

---

## 六、UI / UX 设计评价

Roadmap 中的 UI / UX 描述具有以下特点：

- 不追求炫技
- 聚焦：
  - 执行正确率
  - 认知负担降低
- 分 phase 可视化非常有利于实战

这是**资深工具作者**才会做出的取舍。

---

## 七、一个隐含但重要的优点

该 roadmap 的抽象层级非常恰当：

- 不绑定具体算法细节
- 但明确行为边界
- 允许未来：
  - 替换 Phase 2 策略
  - 增加用户可调参数
  - 引入更高级评分函数

而无需重写 roadmap 本身。

---

## 八、最终结论

> ✅ 该 roadmap 在当前阶段**完全可接受且高度成熟**  
>  
> 🔧 唯一实质性建议：
> - 在 Phase 2 中补充“受限贪心 / 安全启发式”的设计声明  
>  
> 📌 其余内容：
> - 逻辑正确
> - 工程可控
> - 与整体算法设计完全一致

该 roadmap 已具备进入**正式实现阶段**的条件。

---

*End of Review Document*
