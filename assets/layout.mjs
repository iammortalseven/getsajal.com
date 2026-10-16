/** Deterministic shortest-column masonry. DOM order stays in filename/order-list order. */
export function masonryPositions(ratios, width, columns, gap) {
  const itemWidth = Math.max(0, (width - (columns - 1) * gap) / columns);
  const heights = Array(columns).fill(0);
  const positions = ratios.map(ratio => {
    const column = heights.indexOf(Math.min(...heights));
    const x = column * (itemWidth + gap), y = heights[column];
    heights[column] += itemWidth / Math.max(.001, ratio) + gap;
    return { x, y, width: itemWidth };
  });
  return { positions, height: ratios.length ? Math.max(...heights) - gap : 0 };
}
