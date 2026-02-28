// Ordered by greedy max-min RGB distance so consecutive fingers are visually distinct
export const TOWER_COLORS = [
  '#FF3333', // red
  '#33BBFF', // sky blue
  '#88EE33', // lime
  '#AA33FF', // purple
  '#DDDDDD', // silver
  '#FFE033', // yellow
  '#FF33AA', // pink
  '#5555FF', // indigo
  '#33CC99', // emerald
  '#FF8800', // orange
];

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 255, g: 255, b: 255 };
}

export function rgbString(r: number, g: number, b: number, a = 1): string {
  return `rgba(${r},${g},${b},${a})`;
}
