import type { MapViewMode } from "../../types";
import { useLocale } from "../../i18n/LocaleContext";

interface OrbitControlsProps {
  readonly viewMode: MapViewMode;
  readonly zoom: number;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onBack: () => void;
  readonly onClose: () => void;
}

export function OrbitControls({ viewMode, zoom, onZoomIn, onZoomOut, onBack, onClose }: OrbitControlsProps) {
  const { text } = useLocale();
  return (
    <header className="orbit-controls">
      <button className="orbit-overview" type="button" aria-current="page" onClick={onBack}>
        SKILLS LIBRARY / {viewMode.toUpperCase()}
      </button>
      <div role="group" aria-label="Map zoom controls">
        <button type="button" aria-label="Zoom out" onClick={onZoomOut}>-</button>
        <output aria-label="Map zoom">{Math.round(zoom * 100)}%</output>
        <button type="button" aria-label="Zoom in" onClick={onZoomIn}>+</button>
      </div>
      <button type="button" className="orbit-close" aria-label={text("关闭 Silent Orbit", "Close Silent Orbit")} onClick={onClose}>[×]</button>
    </header>
  );
}
