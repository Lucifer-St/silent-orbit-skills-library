import type { MapLayer, MapPoint } from "../types";

export interface MapViewportState {
  readonly layer: MapLayer;
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

const minScale = 0.85;
const maxScale = 1.85;
const bridgeScaleDrop = 0.1;

export const overviewViewport: MapViewportState = {
  layer: "overview",
  scale: 1,
  x: 0,
  y: 0,
};

export function focusViewport(layer: MapLayer, point: MapPoint = { x: 50, y: 50 }): MapViewportState {
  if (layer === "overview") return overviewViewport;

  const scale = layer === "zone" ? 1.15 : layer === "library" ? 1.34 : 1.24;
  const dampen = layer === "zone" ? 0.44 : layer === "library" ? 0.54 : 0.42;

  return clampViewport({
    layer,
    scale,
    x: (50 - point.x) * dampen,
    y: (50 - point.y) * dampen,
  });
}

export function zoomViewport(viewport: MapViewportState, delta: number): MapViewportState {
  return clampViewport({
    ...viewport,
    scale: viewport.scale + delta,
  });
}

export function shouldBridgeViewport(current: MapViewportState, target: MapViewportState) {
  const distance = Math.hypot(current.x - target.x, current.y - target.y);
  const scaleShift = Math.abs(current.scale - target.scale);
  return current.layer !== target.layer || distance > 4 || scaleShift > 0.18;
}

export function bridgeViewport(current: MapViewportState, target: MapViewportState): MapViewportState {
  return clampViewport({
    layer: target.layer,
    scale: Math.min(current.scale, target.scale) - bridgeScaleDrop,
    x: (current.x + target.x) * 0.35,
    y: (current.y + target.y) * 0.35,
  });
}

export function clampViewport(viewport: MapViewportState): MapViewportState {
  return {
    ...viewport,
    scale: Math.max(minScale, Math.min(maxScale, viewport.scale)),
    x: Math.max(-34, Math.min(34, viewport.x)),
    y: Math.max(-34, Math.min(34, viewport.y)),
  };
}

export function getViewportTransform(viewport: MapViewportState) {
  return `translate(${viewport.x}%, ${viewport.y}%) scale(${viewport.scale})`;
}

export function getViewportScaleLabel(viewport: MapViewportState) {
  return `${Math.round(viewport.scale * 100)}%`;
}
