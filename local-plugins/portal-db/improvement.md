为了开发阶段和未来排查错误，验证规则是否有效。定义一个更新原因枚举
```js
const UpdateReason = {
  TEAM_CHANGED: 'team_changed',
  COORD_CHANGED: 'coord_changed',
  BOTH_CHANGED: 'both_changed',
  LASTSEEN_REFRESH: 'lastseen_refresh',
  SKIPPED_FRESH: 'skipped_fresh',
};
```
用一个滚动时间桶的内存统计表记录更新的portal数量
```js
stats = {
  buckets: {
    '2026-02-01T10': {
      team_changed: 12,
      coord_changed: 1,
      lastseen_refresh: 38,
      skipped_fresh: 1420
    }
  }
}
```

设计原则：
- 按小时分桶
- 只保留最近 48 小时

在Portal DB的窗口里显示:Portal DB Update Statistics
内容示例:
```yaml
Past 1 hour:
  - Team changed: 7
  - Position changed: 0
  - LastSeen refreshed (>24h): 63
  - Skipped (fresh data): 1,842

Past 24 hours:
  - Team / Position updated: 214 portals
  - No change detected: 9,731 portals
```

该功能要设计一个开关
```js
window.plugin.portalDB.debug = {
  showStats: true
}
```
默认关闭