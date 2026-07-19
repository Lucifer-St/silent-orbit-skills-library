import type {
  AppData,
  CategoryGroup,
  CategoryUnit,
  FunctionZoneMapNode,
  LibraryRecord,
  LibraryStationMapNode,
  MapPoint,
  SkillDotMapNode,
  SkillMapModel,
  SkillRecord,
} from "../types";
import {
  createSkillNameIndex,
  getCanonicalStationId,
  getStationIdForUnitIdentity,
  isHighValueSkillRecord,
  resolveLibraryForUnit,
} from "./dataSelectors";

const zoneColors = ["#1d7b7a", "#b24a3b", "#3b6f9f", "#8a6f2a", "#5d7f55", "#7c4d7a", "#916836", "#2f677a"];

const zonePositions: readonly MapPoint[] = [
  { x: 22, y: 22 },
  { x: 50, y: 18 },
  { x: 78, y: 23 },
  { x: 23, y: 47 },
  { x: 50, y: 47 },
  { x: 77, y: 49 },
  { x: 24, y: 74 },
  { x: 51, y: 77 },
  { x: 76, y: 73 },
  { x: 88, y: 52 },
];

const stationOffsets: readonly MapPoint[] = [
  { x: 0, y: -8 },
  { x: 8, y: -5 },
  { x: 10, y: 2 },
  { x: 5, y: 8 },
  { x: -5, y: 8 },
  { x: -10, y: 2 },
  { x: -8, y: -5 },
  { x: 0, y: 0 },
];

const homeBasePosition: MapPoint = { x: 90, y: 78 };

export function buildSkillMapModel(data: AppData): SkillMapModel {
  const skillIndex = createSkillNameIndex(data.skills);
  const zones = buildZoneNodes(data.categoryUnits);
  const stations = buildStationNodes(data.categoryUnits, data.libraries, skillIndex, zones);
  const stationsWithHomeBase = ensurePersonalHomeBaseStation(stations, data.libraries, data.personalSkills);
  const skillDots = buildSkillDotNodes(data.categoryUnits, data.libraries, skillIndex, stationsWithHomeBase, data.personalSkills);

  return {
    zones,
    stations: stationsWithHomeBase,
    skillDots,
  };
}

function buildZoneNodes(categories: readonly CategoryGroup[]): FunctionZoneMapNode[] {
  return categories.map((category, index) => ({
    id: `zone:${category.category}`,
    category: category.category,
    skillCount: category.skill_count,
    libraryCount: category.units.filter((unit) => unit.type === "library").length,
    position: zonePositions[index % zonePositions.length],
    color: zoneColors[index % zoneColors.length],
  }));
}

function buildStationNodes(
  categories: readonly CategoryGroup[],
  libraries: readonly LibraryRecord[],
  skillIndex: ReadonlyMap<string, SkillRecord>,
  zones: readonly FunctionZoneMapNode[],
): LibraryStationMapNode[] {
  return categories.flatMap((category, categoryIndex) => {
    const zone = zones[categoryIndex];
    return category.units.map((unit, unitIndex) => {
      const library = resolveLibraryForUnit(unit, libraries);
      const offset = stationOffsets[unitIndex % stationOffsets.length];
      const unitSkills = getUnitSkillRecords(unit, skillIndex);

      return {
        id: getCanonicalStationId(category.category, unit, library),
        title: unit.title,
        category: category.category,
        skillCount: unit.skill_count,
        highValueCount: getHighValueCount(unitSkills, library),
        position: clampPoint({
          x: zone.position.x + offset.x,
          y: zone.position.y + offset.y,
        }),
        libraryKey: library?.key,
        sourceKind: library?.kind,
        page: unit.page ?? library?.page,
        isPrivateHomeBase: library?.key === "personal:deck",
      };
    });
  });
}

function ensurePersonalHomeBaseStation(
  stations: readonly LibraryStationMapNode[],
  libraries: readonly LibraryRecord[],
  personalSkills: readonly SkillRecord[],
): LibraryStationMapNode[] {
  if (stations.some((station) => station.isPrivateHomeBase)) return [...stations];

  const personalLibrary = libraries.find((library) => library.key === "personal:deck");
  if (!personalLibrary && personalSkills.length === 0) return [...stations];

  return [
    ...stations,
    {
      id: getStationIdForUnitIdentity("library:personal:deck"),
      title: personalLibrary?.title ?? "个人常用",
      category: personalLibrary?.primary_category ?? personalSkills[0]?.category ?? "个人常用",
      skillCount: personalLibrary?.skills.length ?? personalSkills.length,
      highValueCount: personalLibrary?.high_value_count ?? personalSkills.filter(isHighValueSkillRecord).length,
      position: homeBasePosition,
      libraryKey: personalLibrary?.key ?? "personal:deck",
      sourceKind: personalLibrary?.kind ?? "personal",
      page: personalLibrary?.page,
      isPrivateHomeBase: true,
    },
  ];
}

function buildSkillDotNodes(
  categories: readonly CategoryGroup[],
  libraries: readonly LibraryRecord[],
  skillIndex: ReadonlyMap<string, SkillRecord>,
  stations: readonly LibraryStationMapNode[],
  personalSkills: readonly SkillRecord[],
): SkillDotMapNode[] {
  const unitDots = categories.flatMap((category) =>
    category.units.flatMap((unit) => {
      const library = resolveLibraryForUnit(unit, libraries);
      const stationId = getCanonicalStationId(category.category, unit, library);
      const station = stations.find((candidate) => candidate.id === stationId);
      if (!station) return [];
      return unit.skills.map((name, index) => buildSkillDot(name, index, unit.skills.length, station, library, skillIndex));
    }),
  );

  const homeBaseStation = stations.find((station) => station.isPrivateHomeBase);
  const privateDots = homeBaseStation
    ? personalSkills.map((skill, index) =>
        buildSkillDot(skill.name, index, personalSkills.length, homeBaseStation, undefined, skillIndex),
      )
    : [];

  return [...unitDots, ...privateDots];
}

function buildSkillDot(
  name: string,
  index: number,
  total: number,
  station: LibraryStationMapNode,
  library: LibraryRecord | undefined,
  skillIndex: ReadonlyMap<string, SkillRecord>,
): SkillDotMapNode {
  const skill = skillIndex.get(name);
  const angle = (Math.PI * 2 * index) / Math.max(total, 1);
  const radiusX = total > 12 ? 5 : 4;
  const radiusY = total > 12 ? 4 : 3;

  return {
    id: `skill:${name}`,
    name,
    category: station.category,
    libraryKey: skill?.library_key ?? library?.key ?? station.libraryKey ?? station.id,
    stationId: station.id,
    position: clampPoint({
      x: station.position.x + Math.cos(angle) * radiusX,
      y: station.position.y + Math.sin(angle) * radiusY,
    }),
    isHighValue: Boolean(skill && isHighValueSkillRecord(skill)),
  };
}

function getUnitSkillRecords(unit: CategoryUnit, skillIndex: ReadonlyMap<string, SkillRecord>) {
  return unit.skills.map((name) => skillIndex.get(name)).filter((skill): skill is SkillRecord => Boolean(skill));
}

function getHighValueCount(skills: readonly SkillRecord[], library: LibraryRecord | undefined) {
  if (library?.high_value_count !== undefined) return library.high_value_count;
  if (library?.starred_count !== undefined && library.starred_count > 0) return library.starred_count;
  return skills.filter(isHighValueSkillRecord).length;
}

function clampPoint(point: MapPoint): MapPoint {
  return {
    x: Math.max(5, Math.min(95, point.x)),
    y: Math.max(5, Math.min(95, point.y)),
  };
}
