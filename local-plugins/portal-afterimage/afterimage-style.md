self.getMarkerStyle = function () {
  return {
    radius: 4,
    weight: 1.5,              // ↓ 稍微收敛描边
    color: '#1A1A1A',         // ↓ 更深一点，保证浅灰底图
    opacity: 0.8,             // ↑ 描边更稳定
    fillColor: '#BDBDBD',     // ← 关键：从纯白改为中性亮灰
    fillOpacity: 0.45,        // 幽灵感保留
    interactive: false,
  };
};
