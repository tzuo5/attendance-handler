export function parseCoordinatePair(value: string): { latitude: number; longitude: number } {
  const parts = value.trim().split(/[，,;；\s]+/).filter(Boolean);
  const latitude = Number(parts[0]); const longitude = Number(parts[1]);
  if (parts.length !== 2 || !Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('请粘贴两个坐标，顺序为纬度、经度，用逗号或空格分隔。');
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new Error('纬度应在 -90 到 90 之间，经度应在 -180 到 180 之间。');
  return {latitude,longitude};
}
