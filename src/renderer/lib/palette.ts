// Lane colors for the commit graph. Indexed by GraphRow.color / edge.color
// (computed as lane % 8 in main/git/graph.ts).
export const LANE_COLORS = [
  '#4c8dff', // blue
  '#3fb950', // green
  '#d29922', // amber
  '#f85149', // red
  '#a371f7', // purple
  '#39c5cf', // teal
  '#ec6cb9', // pink
  '#db6d28' // orange
]

export function laneColor(index: number): string {
  return LANE_COLORS[index % LANE_COLORS.length]
}
