import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { FunctionZoneNode } from "./FunctionZoneNode";
import { LibraryStation } from "./LibraryStation";
import { MapBreadcrumb } from "./MapBreadcrumb";
import { MiniMap } from "./MiniMap";
import { SkillDot } from "./SkillDot";
import { ZoomControls } from "./ZoomControls";
import {
  bridgeViewport,
  focusViewport,
  getViewportScaleLabel,
  getViewportTransform,
  overviewViewport,
  shouldBridgeViewport,
  zoomViewport,
} from "../../lib/mapViewport";
import type { LibraryStationMapNode, MapViewMode, SkillDotMapNode, SkillMapModel } from "../../types";

interface PixelMapCanvasProps {
  readonly model: SkillMapModel;
  readonly viewMode?: MapViewMode;
  readonly selectedCategory?: string | null;
  readonly selectedStationId?: string | null;
  readonly selectedSkillName?: string | null;
  readonly matchedSkillNames?: ReadonlySet<string>;
  readonly onCategory?: (category: string) => void;
  readonly onLibrary?: (node: LibraryStationMapNode) => void;
  readonly onSkill?: (skillName: string) => void;
  readonly onResetFocus?: () => void;
  readonly onOpenCategory?: (category: string) => void;
}

export function PixelMapCanvas({
  model,
  viewMode = "overview",
  selectedCategory = null,
  selectedStationId = null,
  selectedSkillName = null,
  matchedSkillNames = new Set<string>(),
  onCategory,
  onLibrary,
  onSkill,
  onResetFocus,
  onOpenCategory,
}: PixelMapCanvasProps) {
  const selectedStation = selectedStationId
    ? model.stations.find((station) => station.id === selectedStationId)
    : undefined;
  const matchedDots = model.skillDots.filter((dot) => matchedSkillNames.has(dot.name));
  const matchedLibraryKeys = new Set(matchedDots.map((dot) => dot.libraryKey));
  const matchedCategories = new Set(matchedDots.map((dot) => dot.category));

  const visibleSkillDots = model.skillDots.filter((dot) => isSkillDotVisible(dot, viewMode, selectedStation, matchedSkillNames));
  const selectedStationDots = selectedStation
    ? model.skillDots.filter((dot) => isDotInStation(dot, selectedStation)).slice(0, 8)
    : [];
  const focusPoint = useMemo(
    () => getFocusPoint(model, viewMode, selectedCategory, selectedStation, matchedDots),
    [matchedDots, model, selectedCategory, selectedStation, viewMode],
  );
  const targetViewport = useMemo(
    () => getTargetViewport(viewMode, focusPoint),
    [focusPoint, viewMode],
  );
  const [viewport, setViewport] = useState(targetViewport);
  const [transitionPhase, setTransitionPhase] = useState<"steady" | "bridge" | "focus">("steady");
  const viewportRef = useRef(targetViewport);
  const bridgeTimerRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    return () => {
      if (bridgeTimerRef.current) window.clearTimeout(bridgeTimerRef.current);
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (bridgeTimerRef.current) window.clearTimeout(bridgeTimerRef.current);
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);

    const currentViewport = viewportRef.current;
    if (shouldBridgeViewport(currentViewport, targetViewport)) {
      setTransitionPhase("bridge");
      setViewport(bridgeViewport(currentViewport, targetViewport));
      bridgeTimerRef.current = window.setTimeout(() => {
        setTransitionPhase("focus");
        setViewport(targetViewport);
      }, 120);
      settleTimerRef.current = window.setTimeout(() => setTransitionPhase("steady"), 760);
      return () => {
        if (bridgeTimerRef.current) window.clearTimeout(bridgeTimerRef.current);
        if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
      };
    }

    setTransitionPhase("steady");
    setViewport(targetViewport);
  }, [targetViewport]);

  const viewportStyle = {
    transform: getViewportTransform(viewport),
  };
  const canvasStyle = {
    "--map-focus-x": `${focusPoint.x}%`,
    "--map-focus-y": `${focusPoint.y}%`,
  } as CSSProperties;

  function zoom(delta: number) {
    setTransitionPhase("focus");
    setViewport((current) => zoomViewport(current, delta));
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => setTransitionPhase("steady"), 360);
  }

  function resetViewport() {
    setTransitionPhase("focus");
    setViewport(targetViewport);
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => setTransitionPhase("steady"), 360);
  }

  function handleMapKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.matches("input, select, textarea")) return;

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoom(0.16);
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoom(-0.16);
    }
    if (event.key === "0" || event.key === "Home") {
      event.preventDefault();
      resetViewport();
    }
    if (event.key === "Escape" && onResetFocus) {
      event.preventDefault();
      onResetFocus();
    }
  }

  return (
    <section
      className="pixel-map-shell"
      data-view-mode={viewMode}
      data-selected-station-id={selectedStation?.id}
      aria-label="Pixel OS skill map"
    >
      <div className="pixel-map-header">
        <MapBreadcrumb
          items={getBreadcrumbItems({
            viewMode,
            selectedCategory,
            selectedStation,
            matchedCount: matchedDots.length,
            onResetFocus,
            onCategory,
          })}
        />
        <strong>{getModeLabel(viewMode)}</strong>
      </div>

      <p className="sr-only" aria-live="polite">
        {getSelectionTitle(viewMode, selectedCategory, selectedStation, matchedDots.length)}
      </p>

      <div
        className={`pixel-map-canvas is-${transitionPhase}`}
        style={canvasStyle}
        tabIndex={0}
        role="application"
        aria-describedby="map-keyboard-help"
        aria-keyshortcuts="+ - 0 Home Escape"
        data-transition-phase={transitionPhase}
        onKeyDown={handleMapKeyDown}
      >
        <span id="map-keyboard-help" className="sr-only">
          Use plus and minus to zoom, zero or Home to fit the current focus, and Escape to return to the overview.
        </span>
        <div className="map-paper-grid" aria-hidden="true" />

        <div className="pixel-map-viewport" style={viewportStyle}>
          <svg className="map-route-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {model.stations.map((station) => {
              const zone = model.zones.find((candidate) => candidate.category === station.category);
              if (!zone) return null;
              return (
                <line
                  className={`map-route-line ${station.isPrivateHomeBase ? "is-home-base" : ""} ${getRouteFocusState(station, viewMode, selectedCategory, selectedStation, matchedLibraryKeys, matchedCategories)}`}
                  key={station.id}
                  x1={zone.position.x}
                  y1={zone.position.y}
                  x2={station.position.x}
                  y2={station.position.y}
                />
              );
            })}
          </svg>

          <div className="pixel-map-layer">
            {model.zones.map((zone) => (
              <FunctionZoneNode
                key={zone.id}
                node={zone}
                selected={zone.category === selectedCategory}
                focusState={getZoneFocusState(zone.category, viewMode, selectedCategory, selectedStation, matchedCategories)}
                onSelect={onCategory}
              />
            ))}
            {model.stations.map((station) => (
              <LibraryStation
                key={station.id}
                node={station}
                selected={station.id === selectedStationId}
                focusState={getStationFocusState(station, viewMode, selectedCategory, selectedStation, matchedLibraryKeys, matchedCategories)}
                onSelect={onLibrary}
              />
            ))}
            {visibleSkillDots.map((dot) => (
              <SkillDot
                key={dot.id}
                node={dot}
                selected={dot.name === selectedSkillName}
                matched={matchedSkillNames.has(dot.name)}
                muted={viewMode === "search" && !matchedSkillNames.has(dot.name)}
                onSelect={onSkill}
              />
            ))}
          </div>
        </div>

        <ZoomControls
          scaleLabel={getViewportScaleLabel(viewport)}
          onZoomIn={() => zoom(0.16)}
          onZoomOut={() => zoom(-0.16)}
          onReset={resetViewport}
        />
        <MiniMap
          model={model}
          viewport={viewport}
          focusPoint={focusPoint}
          selectedCategory={selectedCategory}
          selectedStation={selectedStation}
          matchedSkillNames={matchedSkillNames}
          onResetFocus={onResetFocus}
        />

        {viewMode === "library" && selectedStation && (
          <LibraryFocusPanel
            station={selectedStation}
            skillDots={selectedStationDots}
            onResetFocus={onResetFocus}
            onOpenCategory={onOpenCategory}
          />
        )}

        <div className="map-selection-label">
          <strong>{getSelectionTitle(viewMode, selectedCategory, selectedStation, matchedDots.length)}</strong>
          <span>{getSelectionHint(viewMode, selectedStation, matchedDots.length)}</span>
          {viewMode !== "overview" && viewMode !== "search" && onResetFocus && (
            <button className="map-mini-button" type="button" onClick={onResetFocus}>
              Reset map
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function getTargetViewport(viewMode: MapViewMode, focusPoint: { x: number; y: number }) {
  if (viewMode === "category") return focusViewport("zone", focusPoint);
  if (viewMode === "library") return focusViewport("library", focusPoint);
  if (viewMode === "search") return focusViewport("skill", focusPoint);
  return overviewViewport;
}

function getFocusPoint(
  model: SkillMapModel,
  viewMode: MapViewMode,
  selectedCategory: string | null,
  selectedStation: LibraryStationMapNode | undefined,
  matchedDots: readonly SkillDotMapNode[],
) {
  if (viewMode === "library" && selectedStation) return selectedStation.position;
  if (viewMode === "search" && matchedDots.length > 0) return getAveragePoint(matchedDots.map((dot) => dot.position));
  if (viewMode === "category" && selectedCategory) {
    return model.zones.find((zone) => zone.category === selectedCategory)?.position ?? { x: 50, y: 50 };
  }
  return { x: 50, y: 50 };
}

function getAveragePoint(points: readonly { x: number; y: number }[]) {
  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
    }),
    { x: 0, y: 0 },
  );
  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function getBreadcrumbItems({
  viewMode,
  selectedCategory,
  selectedStation,
  matchedCount,
  onResetFocus,
  onCategory,
}: {
  readonly viewMode: MapViewMode;
  readonly selectedCategory: string | null;
  readonly selectedStation: LibraryStationMapNode | undefined;
  readonly matchedCount: number;
  readonly onResetFocus?: () => void;
  readonly onCategory?: (category: string) => void;
}) {
  const items = [{ label: "OS", onClick: onResetFocus }];
  if (viewMode === "search") {
    return [...items, { label: `Search ${matchedCount}`, onClick: undefined }];
  }
  if (selectedCategory) {
    items.push({
      label: selectedCategory,
      onClick: selectedStation ? () => onCategory?.(selectedCategory) : undefined,
    });
  }
  if (selectedStation) {
    items.push({ label: selectedStation.title, onClick: undefined });
  }
  return items;
}

function isSkillDotVisible(
  dot: SkillDotMapNode,
  viewMode: MapViewMode,
  selectedStation: LibraryStationMapNode | undefined,
  matchedSkillNames: ReadonlySet<string>,
) {
  if (viewMode === "search") return matchedSkillNames.has(dot.name);
  if (viewMode === "library" && selectedStation) return isDotInStation(dot, selectedStation);
  return false;
}

function isDotInStation(dot: SkillDotMapNode, station: LibraryStationMapNode) {
  if (station.libraryKey) return dot.libraryKey === station.libraryKey;
  return dot.category === station.category;
}

function getZoneFocusState(
  category: string,
  viewMode: MapViewMode,
  selectedCategory: string | null,
  selectedStation: LibraryStationMapNode | undefined,
  matchedCategories: ReadonlySet<string>,
) {
  if (viewMode === "overview") return "default";
  if (viewMode === "search") return matchedCategories.has(category) ? "match" : "muted";
  if (viewMode === "library") return selectedStation?.category === category ? "active" : "muted";
  return selectedCategory === category ? "active" : "muted";
}

function getStationFocusState(
  station: LibraryStationMapNode,
  viewMode: MapViewMode,
  selectedCategory: string | null,
  selectedStation: LibraryStationMapNode | undefined,
  matchedLibraryKeys: ReadonlySet<string>,
  matchedCategories: ReadonlySet<string>,
) {
  if (viewMode === "overview") return "muted";
  if (viewMode === "search") {
    if (station.libraryKey && matchedLibraryKeys.has(station.libraryKey)) return "match";
    return matchedCategories.has(station.category) ? "related" : "muted";
  }
  if (viewMode === "library") {
    if (selectedStation?.id === station.id) return "active";
    return selectedStation?.category === station.category ? "related" : "muted";
  }
  return selectedCategory === station.category ? "related" : "muted";
}

function getRouteFocusState(
  station: LibraryStationMapNode,
  viewMode: MapViewMode,
  selectedCategory: string | null,
  selectedStation: LibraryStationMapNode | undefined,
  matchedLibraryKeys: ReadonlySet<string>,
  matchedCategories: ReadonlySet<string>,
) {
  const stationState = getStationFocusState(station, viewMode, selectedCategory, selectedStation, matchedLibraryKeys, matchedCategories);
  return stationState === "active" || stationState === "match" || stationState === "related" ? "is-focused" : "is-muted";
}

function getModeLabel(viewMode: MapViewMode) {
  if (viewMode === "category") return "Category focus";
  if (viewMode === "library") return "Library focus";
  if (viewMode === "search") return "Search focus";
  return "Pixel OS Map";
}

function getSelectionTitle(
  viewMode: MapViewMode,
  selectedCategory: string | null,
  selectedStation: LibraryStationMapNode | undefined,
  matchedCount: number,
) {
  if (viewMode === "search") return `${matchedCount} matched skills`;
  if (viewMode === "library" && selectedStation) return selectedStation.title;
  if (viewMode === "category" && selectedCategory) return selectedCategory;
  return "All function zones";
}

function getSelectionHint(viewMode: MapViewMode, selectedStation: LibraryStationMapNode | undefined, matchedCount: number) {
  if (viewMode === "search") return `${matchedCount} skill dots highlighted with their stations and zones`;
  if (viewMode === "library" && selectedStation) return `${selectedStation.skillCount} skills in this ability unit`;
  if (viewMode === "category") return "Stations outside this function zone are softened for context";
  return "Select a zone or station to focus the map";
}

function LibraryFocusPanel({
  station,
  skillDots,
  onResetFocus,
  onOpenCategory,
}: {
  readonly station: LibraryStationMapNode;
  readonly skillDots: readonly SkillDotMapNode[];
  readonly onResetFocus?: () => void;
  readonly onOpenCategory?: (category: string) => void;
}) {
  return (
    <aside className="library-focus-panel" aria-label="Library focus panel">
      <span className="pixel-label">LIBRARY FOCUS</span>
      <strong>{station.title}</strong>
      <p>
        {station.category} / {station.skillCount} skills / {station.highValueCount} high-value
      </p>
      <div className="library-focus-dots" aria-label="Visible skills in this library">
        {skillDots.map((dot) => (
          <span key={dot.id}>{dot.name}</span>
        ))}
      </div>
      <div className="library-focus-actions">
        {onOpenCategory && (
          <button className="map-mini-button" type="button" onClick={() => onOpenCategory(station.category)}>
            Open zone
          </button>
        )}
        {onResetFocus && (
          <button className="map-mini-button" type="button" onClick={onResetFocus}>
            Overview
          </button>
        )}
      </div>
    </aside>
  );
}
