import { useEffect, useId, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, Ref } from "react";
import type { CategoryGroup, MapViewMode, OrbitMapModel, SkillRecord } from "../../types";
import { OrbitControls } from "./OrbitControls";
import { OrbitScene } from "./OrbitScene";

interface SilentOrbitPageProps {
  readonly model: OrbitMapModel;
  readonly initialCategoryId: string | null;
  readonly fallbackCategories: readonly CategoryGroup[];
  readonly searchActive: boolean;
  readonly matchedSkillNames: ReadonlySet<string>;
  readonly skillByName: ReadonlyMap<string, SkillRecord>;
  readonly onSkill: (skill: SkillRecord) => void;
  readonly onFallbackCategory: (category: string) => void;
  readonly onClose: () => void;
  readonly orbitRef: Ref<HTMLElement>;
}

export function SilentOrbitPage({
  model,
  initialCategoryId,
  fallbackCategories,
  searchActive,
  matchedSkillNames,
  skillByName,
  onSkill,
  onFallbackCategory,
  onClose,
  orbitRef,
}: SilentOrbitPageProps) {
  const titleId = useId();
  const [focusedCategoryId, setFocusedCategoryId] = useState<string | null>(() => {
    if (model.systems.some((item) => item.id === initialCategoryId)) return initialCategoryId;
    return searchActive ? null : model.systems[0]?.id ?? null;
  });
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const selectedStation = model.libraries.find((item) => item.id === selectedStationId) ?? null;
  const viewMode: MapViewMode = searchActive
    ? "search"
    : selectedStation
      ? "library"
      : focusedCategoryId
        ? "category"
        : "overview";

  useEffect(() => {
    if (selectedStationId && !selectedStation) setSelectedStationId(null);
    if (focusedCategoryId && !model.systems.some((item) => item.id === focusedCategoryId)) setFocusedCategoryId(null);
  }, [focusedCategoryId, model.systems, selectedStation, selectedStationId]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      onClose();
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  function changeZoom(delta: number) {
    setZoom((current) => Math.max(0.85, Math.min(1.65, current + delta)));
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      changeZoom(0.12);
    }
    if (event.key === "-") {
      event.preventDefault();
      changeZoom(-0.12);
    }
    if (event.key === "0" || event.key === "Home") {
      event.preventDefault();
      setZoom(1);
    }
  }

  function goBackOneLevel() {
    if (searchActive || (!focusedCategoryId && !selectedStationId)) {
      onClose();
      return;
    }
    if (selectedStationId) {
      setSelectedStationId(null);
      setZoom(1);
      return;
    }
    onClose();
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault();
    goBackOneLevel();
  }

  return (
    <main
      ref={orbitRef}
      className="silent-orbit-page"
      data-surface="orbit"
      data-view-mode={viewMode}
      tabIndex={-1}
      aria-labelledby={titleId}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
    >
      <h1 className="sr-only" id={titleId}>Silent Orbit skill map</h1>
      <OrbitControls
        viewMode={viewMode}
        zoom={zoom}
        onZoomIn={() => changeZoom(0.12)}
        onZoomOut={() => changeZoom(-0.12)}
        onBack={goBackOneLevel}
        onClose={onClose}
      />
      <OrbitScene
        model={model}
        fallbackCategories={fallbackCategories}
        viewMode={viewMode}
        zoom={zoom}
        focusedCategoryId={focusedCategoryId}
        selectedStationId={selectedStationId}
        matchedSkillNames={matchedSkillNames}
        onSystem={(node) => {
          setFocusedCategoryId(node.id);
          setSelectedStationId(null);
        }}
        onLibrary={(node) => {
          setFocusedCategoryId(node.systemId);
          setSelectedStationId(node.id);
        }}
        onSkill={(node) => {
          const skill = skillByName.get(node.name);
          if (skill) onSkill(skill);
        }}
        onFallbackCategory={onFallbackCategory}
      />
    </main>
  );
}
