import type { MapViewportState } from "../../lib/mapViewport";
import type { LibraryStationMapNode, MapPoint, SkillMapModel } from "../../types";
import { useLocale } from "../../i18n/LocaleContext";

interface MiniMapProps {
  readonly model: SkillMapModel;
  readonly viewport: MapViewportState;
  readonly focusPoint: MapPoint;
  readonly selectedCategory?: string | null;
  readonly selectedStation?: LibraryStationMapNode;
  readonly matchedSkillNames?: ReadonlySet<string>;
  readonly onResetFocus?: () => void;
}

export function MiniMap({
  model,
  viewport,
  focusPoint,
  selectedCategory = null,
  selectedStation,
  matchedSkillNames = new Set<string>(),
  onResetFocus,
}: MiniMapProps) {
  const { text } = useLocale();
  const matchedLibraryKeys = new Set(
    model.skillDots.filter((dot) => matchedSkillNames.has(dot.name)).map((dot) => dot.libraryKey),
  );

  const label = selectedStation
    ? text(`缩略地图。当前聚焦 ${selectedStation.title}。点击返回总览。`, `Mini map. Current focus is ${selectedStation.title}. Press to return to overview.`)
    : selectedCategory
      ? text(`缩略地图。当前聚焦 ${selectedCategory}。点击返回总览。`, `Mini map. Current focus is ${selectedCategory}. Press to return to overview.`)
      : text("缩略地图总览。", "Mini map overview.");

  return (
    <button className="mini-map" type="button" onClick={onResetFocus} aria-label={label} title={text("缩略地图总览", "Mini map overview")}>
      <span className="mini-map-label">{text("缩略图", "MINI")}</span>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {model.zones.map((zone) => (
          <rect
            className={`mini-zone ${zone.category === selectedCategory ? "is-active" : ""}`}
            key={zone.id}
            x={zone.position.x - 2.5}
            y={zone.position.y - 2.5}
            width="5"
            height="5"
          />
        ))}
        {model.stations.map((station) => (
          <circle
            className={`mini-station ${selectedStation?.id === station.id ? "is-active" : ""} ${
              station.libraryKey && matchedLibraryKeys.has(station.libraryKey) ? "is-match" : ""
            }`}
            key={station.id}
            cx={station.position.x}
            cy={station.position.y}
            r="1.8"
          />
        ))}
        <rect
          className="mini-map-window"
          x={Math.max(0, 50 - 38 / viewport.scale - viewport.x / 2)}
          y={Math.max(0, 50 - 28 / viewport.scale - viewport.y / 2)}
          width={Math.min(100, 76 / viewport.scale)}
          height={Math.min(100, 56 / viewport.scale)}
        />
        <circle className="mini-map-focus" cx={focusPoint.x} cy={focusPoint.y} r="3" />
      </svg>
    </button>
  );
}
