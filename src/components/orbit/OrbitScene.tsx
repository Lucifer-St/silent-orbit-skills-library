import type { CSSProperties } from "react";
import type {
  CategoryGroup,
  MapPoint,
  MapViewMode,
  OrbitLibraryNode,
  OrbitMapModel,
  OrbitSkillNode,
  OrbitSystemNode,
} from "../../types";
import { getRelicVisual } from "../../lib/cosmosAssets";
import { CosmosAsset } from "../CosmosAsset";
import { CelestialSystem } from "./CelestialSystem";
import { LibraryMoon } from "./LibraryMoon";
import { SkillAsteroid } from "./SkillAsteroid";

interface OrbitSceneProps {
  readonly model: OrbitMapModel;
  readonly fallbackCategories: readonly CategoryGroup[];
  readonly viewMode: MapViewMode;
  readonly zoom: number;
  readonly focusedCategoryId: string | null;
  readonly selectedStationId: string | null;
  readonly matchedSkillNames: ReadonlySet<string>;
  readonly onSystem: (node: OrbitSystemNode) => void;
  readonly onLibrary: (node: OrbitLibraryNode) => void;
  readonly onSkill: (node: OrbitSkillNode) => void;
  readonly onFallbackCategory: (category: string) => void;
}

interface MobileIdentityNavProps {
  readonly viewMode: MapViewMode;
  readonly systems: readonly OrbitSystemNode[];
  readonly focusedSystem: OrbitSystemNode | undefined;
  readonly visibleLibraries: readonly OrbitLibraryNode[];
  readonly visibleSkills: readonly OrbitSkillNode[];
  readonly selectedStationId: string | null;
  readonly onSystem: (node: OrbitSystemNode) => void;
  readonly onLibrary: (node: OrbitLibraryNode) => void;
  readonly onSkill: (node: OrbitSkillNode) => void;
}

const fixedStars = [
  [4, 8], [11, 29], [18, 58], [24, 92], [31, 37], [36, 73], [42, 5], [47, 26],
  [53, 66], [59, 94], [64, 17], [69, 47], [74, 79], [81, 10], [86, 33], [91, 62],
  [96, 88], [7, 79], [27, 14], [39, 51], [57, 39], [72, 3], [84, 91], [94, 21],
] as const;

const libraryOrbit = {
  capacity: 5,
  radiusX: 22,
  radiusY: 17.5,
  stepX: 9,
  stepY: 8.5,
} as const;

const skillOrbit = {
  capacity: 8,
  radiusX: 16,
  radiusY: 14,
  stepX: 9,
  stepY: 8,
} as const;

export function OrbitScene({
  model,
  fallbackCategories,
  viewMode,
  zoom,
  focusedCategoryId,
  selectedStationId,
  matchedSkillNames,
  onSystem,
  onLibrary,
  onSkill,
  onFallbackCategory,
}: OrbitSceneProps) {
  if (model.systems.length === 0) {
    return (
      <nav className="orbit-fallback" aria-label="功能分类回退列表">
        <p>ORBIT DATA UNAVAILABLE</p>
        {fallbackCategories.map((category) => (
          <button key={category.category} type="button" onClick={() => onFallbackCategory(category.category)}>
            {category.category} / {category.skill_count}
          </button>
        ))}
      </nav>
    );
  }

  const focusedSystem = model.systems.find((item) => item.id === focusedCategoryId);
  const selectedLibrary = model.libraries.find((item) => item.id === selectedStationId);
  const visibleLibraries = viewMode === "search"
    ? model.libraries.filter((library) =>
        model.skills.some((skill) => matchedSkillNames.has(skill.name) && skill.stationId === library.id),
      )
    : focusedSystem
      ? model.libraries.filter((library) => library.systemId === focusedSystem.id)
      : [];
  const visibleSkills = viewMode === "search"
    ? model.skills.filter((skill) => matchedSkillNames.has(skill.name))
    : selectedLibrary
      ? model.skills.filter((skill) => skill.stationId === selectedLibrary.id)
      : [];
  const mobileSkillPositions = buildMobileSkillPositions(model);
  const desktopLibraryPositions = buildDesktopLibraryPositions(visibleLibraries, focusedSystem);
  const selectedLibraryPosition = selectedLibrary
    ? desktopLibraryPositions.get(selectedLibrary.id) ?? selectedLibrary.position
    : undefined;
  const desktopSkillPositions = buildDesktopSkillPositions(visibleSkills, selectedLibraryPosition);
  const libraryRingCount = focusedSystem ? Math.max(1, Math.ceil(visibleLibraries.length / libraryOrbit.capacity)) : 0;
  const skillRingCount = selectedLibrary ? Math.max(1, Math.ceil(visibleSkills.length / skillOrbit.capacity)) : 0;
  const focusPoint = selectedLibraryPosition ?? focusedSystem?.position ?? { x: 50, y: 50 };
  const relicPosition = focusedSystem ? buildRelicPosition(focusPoint, focusedSystem.orbitIndex) : undefined;
  const focusScale = viewMode === "library" ? 1.2 : viewMode === "category" ? 1.08 : 1;
  const worldStyle = {
    "--orbit-shift-x": `${viewMode === "overview" || viewMode === "search" ? 0 : 50 - focusPoint.x}%`,
    "--orbit-shift-y": `${viewMode === "overview" || viewMode === "search" ? 0 : 50 - focusPoint.y}%`,
    "--orbit-scale": zoom * focusScale,
  } as CSSProperties;

  return (
    <section className="orbit-scene" aria-label="Silent Orbit skill galaxy">
      <MobileIdentityNav
        viewMode={viewMode}
        systems={model.systems}
        focusedSystem={focusedSystem}
        visibleLibraries={visibleLibraries}
        visibleSkills={visibleSkills}
        selectedStationId={selectedStationId}
        onSystem={onSystem}
        onLibrary={onLibrary}
        onSkill={onSkill}
      />
      <div className="orbit-world" style={worldStyle}>
        <svg className="orbit-geometry" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <StarField />
          {focusedSystem && Array.from({ length: libraryRingCount }, (_, index) => (
            <ellipse
              className="orbit-library-ring"
              key={`library-ring:${index}`}
              cx={focusedSystem.position.x}
              cy={focusedSystem.position.y}
              rx={libraryOrbit.radiusX + index * libraryOrbit.stepX}
              ry={libraryOrbit.radiusY + index * libraryOrbit.stepY}
            />
          ))}
          {selectedLibrary && Array.from({ length: skillRingCount }, (_, index) => (
            <ellipse
              className="orbit-skill-ring"
              key={`skill-ring:${index}`}
              cx={selectedLibraryPosition?.x ?? selectedLibrary.position.x}
              cy={selectedLibraryPosition?.y ?? selectedLibrary.position.y}
              rx={skillOrbit.radiusX + index * skillOrbit.stepX}
              ry={skillOrbit.radiusY + index * skillOrbit.stepY}
            />
          ))}
        </svg>
        {focusedSystem && relicPosition && (viewMode === "category" || viewMode === "library") && (
          <CosmosAsset
            className="orbit-relic-landmark"
            src={getRelicVisual(focusedSystem.orbitIndex)}
            style={{ left: `${relicPosition.x}%`, top: `${relicPosition.y}%` }}
          />
        )}
        <div className="orbit-node-layer">
          {model.systems.map((node) => (
            <CelestialSystem key={node.id} node={node} active={node.id === focusedCategoryId} onSelect={onSystem} />
          ))}
          {visibleLibraries.map((node) => (
            <LibraryMoon
              key={node.id}
              node={node}
              desktopPosition={desktopLibraryPositions.get(node.id) ?? node.position}
              active={node.id === selectedStationId}
              onSelect={onLibrary}
            />
          ))}
          {visibleSkills.map((node) => (
            <SkillAsteroid
              key={getSkillKey(node)}
              node={node}
              desktopPosition={desktopSkillPositions.get(getSkillKey(node)) ?? node.position}
              mobilePosition={mobileSkillPositions.get(getSkillKey(node)) ?? node.position}
              onSelect={onSkill}
            />
          ))}
        </div>
      </div>
      {viewMode === "search" && visibleSkills.length === 0 && (
        <div className="orbit-empty-state" role="status">NO MATCHING SIGNALS</div>
      )}
      <p className="sr-only" aria-live="polite">
        {getOrbitStatus(viewMode, model.systems.length, focusedSystem, selectedLibrary, visibleSkills.length)}
      </p>
    </section>
  );
}

function MobileIdentityNav({
  viewMode,
  systems,
  focusedSystem,
  visibleLibraries,
  visibleSkills,
  selectedStationId,
  onSystem,
  onLibrary,
  onSkill,
}: MobileIdentityNavProps) {
  return (
    <nav
      className="orbit-mobile-context-nav"
      data-orbit-mobile-mode={viewMode}
      aria-label={`Orbit ${viewMode} identities`}
    >
      {viewMode === "overview" && systems.map((system) => (
        <button
          data-system-id={system.id}
          type="button"
          onClick={() => onSystem(system)}
          key={system.id}
        >
          <span>{system.category}</span>
          <small>{system.skillCount}</small>
        </button>
      ))}
      {viewMode === "category" && visibleLibraries.map((library) => (
        <button
          data-station-id={library.id}
          data-system-id={library.systemId}
          type="button"
          onClick={() => onLibrary(library)}
          key={library.id}
        >
          <span>{library.title}</span>
          <small>{library.skillCount}</small>
        </button>
      ))}
      {viewMode === "library" && focusedSystem && (
        <button
          className="orbit-mobile-context-back"
          data-system-id={focusedSystem.id}
          type="button"
          onClick={() => onSystem(focusedSystem)}
        >
          ← {focusedSystem.category}
        </button>
      )}
      {viewMode === "library" && visibleLibraries.map((library) => {
        const current = library.id === selectedStationId;
        return (
          <button
            data-station-id={library.id}
            type="button"
            aria-current={current ? "page" : undefined}
            aria-pressed={current}
            onClick={() => onLibrary(library)}
            key={library.id}
          >
            {library.title}
          </button>
        );
      })}
      {viewMode === "search" && visibleSkills.map((skill) => (
        <button
          data-skill-id={skill.id}
          data-station-id={skill.stationId}
          type="button"
          onClick={() => onSkill(skill)}
          key={getSkillKey(skill)}
        >
          {skill.name}
        </button>
      ))}
    </nav>
  );
}

function StarField() {
  return (
    <g className="orbit-star-field">
      {fixedStars.map(([x, y], index) => <circle key={`${x}:${y}`} cx={x} cy={y} r={index % 5 === 0 ? 0.18 : 0.1} />)}
    </g>
  );
}

function buildMobileSkillPositions(model: OrbitMapModel) {
  const positions = new Map<string, MapPoint>();
  const skillsByStation = new Map<string, OrbitSkillNode[]>();
  for (const skill of model.skills) {
    const stationSkills = skillsByStation.get(skill.stationId) ?? [];
    stationSkills.push(skill);
    skillsByStation.set(skill.stationId, stationSkills);
  }

  for (const [stationId, stationSkills] of skillsByStation) {
    const station = model.libraries.find((library) => library.id === stationId);
    if (!station) continue;
    stationSkills.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    const density = Math.min(1, stationSkills.length / 30);
    const radiusX = 8 + 12 * density;
    const radiusY = 7 + 11 * density;
    const mobileRailSafeTop = 10;
    const center = {
      x: clamp(station.position.x, radiusX + 3, 97 - radiusX),
      y: clamp(station.position.y, radiusY + mobileRailSafeTop, 97 - radiusY),
    };
    stationSkills.forEach((skill, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / stationSkills.length;
      positions.set(getSkillKey(skill), {
        x: round(center.x + Math.cos(angle) * radiusX),
        y: round(center.y + Math.sin(angle) * radiusY),
      });
    });
  }
  return positions;
}

function getSkillKey(skill: OrbitSkillNode) {
  return `${skill.stationId}:${skill.id}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function buildRelicPosition(center: MapPoint, orbitIndex: number): MapPoint {
  const horizontalDirection = orbitIndex % 2 === 0 ? 1 : -1;
  const verticalDirection = orbitIndex % 3 === 0 ? -1 : orbitIndex % 3 === 1 ? 1 : 0.35;
  return {
    x: clamp(center.x + horizontalDirection * (25 + (orbitIndex % 3) * 2.5), 10, 90),
    y: clamp(center.y + verticalDirection * 18, 13, 87),
  };
}

function getOrbitStatus(
  viewMode: MapViewMode,
  systemCount: number,
  focusedSystem: OrbitSystemNode | undefined,
  selectedLibrary: OrbitLibraryNode | undefined,
  skillCount: number,
) {
  if (viewMode === "search") return `${skillCount} matching skill signals`;
  if (viewMode === "library" && selectedLibrary) return `${selectedLibrary.title}, ${skillCount} skills`;
  if (viewMode === "category" && focusedSystem) return `${focusedSystem.category}, ${focusedSystem.libraryCount} libraries`;
  return `Silent Orbit overview, ${systemCount} functional category systems`;
}

function buildDesktopSkillPositions(
  skills: readonly OrbitSkillNode[],
  center: MapPoint | undefined,
) {
  const positions = new Map<string, MapPoint>();
  if (!center) return positions;

  const sortedSkills = [...skills].sort((left, right) => left.id.localeCompare(right.id));
  const ringCapacity = skillOrbit.capacity;
  sortedSkills.forEach((skill, index) => {
    const ringIndex = Math.floor(index / ringCapacity);
    const ringStart = ringIndex * ringCapacity;
    const ringSize = Math.min(ringCapacity, sortedSkills.length - ringStart);
    const ringSlot = index - ringStart;
    const angle = ringSize === 1
      ? 0
      : ringSize === 2
        ? ringSlot * Math.PI
        : -Math.PI / 2 + ((ringSlot + .5) / ringSize) * Math.PI * 2 + ringIndex * .39;
    const radiusX = skillOrbit.radiusX + ringIndex * skillOrbit.stepX;
    const radiusY = skillOrbit.radiusY + ringIndex * skillOrbit.stepY;
    positions.set(getSkillKey(skill), {
      x: round(center.x + Math.cos(angle) * radiusX),
      y: round(center.y + Math.sin(angle) * radiusY),
    });
  });
  return positions;
}

function buildDesktopLibraryPositions(
  libraries: readonly OrbitLibraryNode[],
  focusedSystem: OrbitSystemNode | undefined,
) {
  const positions = new Map<string, MapPoint>();
  if (!focusedSystem) return positions;

  const sortedLibraries = [...libraries].sort((left, right) => left.id.localeCompare(right.id));
  const ringCapacity = libraryOrbit.capacity;
  sortedLibraries.forEach((library, index) => {
    const ringIndex = Math.floor(index / ringCapacity);
    const ringStart = ringIndex * ringCapacity;
    const ringSize = Math.min(ringCapacity, sortedLibraries.length - ringStart);
    const angle = -Math.PI / 2 + ((index - ringStart) / Math.max(ringSize, 1)) * Math.PI * 2 + ringIndex * .63;
    const radiusX = libraryOrbit.radiusX + ringIndex * libraryOrbit.stepX;
    const radiusY = libraryOrbit.radiusY + ringIndex * libraryOrbit.stepY;
    positions.set(library.id, {
      x: round(focusedSystem.position.x + Math.cos(angle) * radiusX),
      y: round(focusedSystem.position.y + Math.sin(angle) * radiusY),
    });
  });
  return positions;
}
