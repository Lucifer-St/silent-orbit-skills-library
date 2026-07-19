import type { MapPoint } from "../types";

export function hashToUnit(id: string, salt = "orbit") {
  let hash = 2166136261;
  const input = `${salt}:${id}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function pointOnEllipse(center: MapPoint, radiusX: number, radiusY: number, turn: number): MapPoint {
  const angle = turn * Math.PI * 2;
  return { x: round(center.x + Math.cos(angle) * radiusX), y: round(center.y + Math.sin(angle) * radiusY) };
}

export function stableOrbitPoint(id: string, center: MapPoint, radiusX: number, radiusY: number): MapPoint {
  const scale = 0.82 + hashToUnit(id, "radius") * 0.18;
  const point = pointOnEllipse(center, radiusX * scale, radiusY * scale, hashToUnit(id, "angle"));
  return { x: clamp(point.x, 3, 97), y: clamp(point.y, 3, 97) };
}

function round(value: number) { return Math.round(value * 1000) / 1000; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
