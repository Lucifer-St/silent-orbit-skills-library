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
  const modeLabels: Record<MapViewMode, string> = {
    overview: text("总览", "OVERVIEW"),
    category: text("分类", "CATEGORY"),
    library: text("能力单元", "LIBRARY"),
    search: text("搜索", "SEARCH"),
  };
  return (
    <header className="orbit-controls">
      <button className="orbit-overview" type="button" aria-current="page" onClick={onBack}>
        {text("SKILL 图书馆", "SKILLS LIBRARY")} / {modeLabels[viewMode]}
      </button>
      <div role="group" aria-label={text("地图缩放控件", "Map zoom controls")}>
        <button type="button" aria-label={text("缩小", "Zoom out")} onClick={onZoomOut}>-</button>
        <output aria-label={text("地图缩放", "Map zoom")}>{Math.round(zoom * 100)}%</output>
        <button type="button" aria-label={text("放大", "Zoom in")} onClick={onZoomIn}>+</button>
      </div>
      <button type="button" className="orbit-close" aria-label={text("关闭 Silent Orbit", "Close Silent Orbit")} onClick={onClose}>[×]</button>
    </header>
  );
}
