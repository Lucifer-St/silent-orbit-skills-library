import type { AppData, MapPoint, OrbitLibraryNode, OrbitMapModel, OrbitSkillNode } from "../types";
import { buildSkillMapModel } from "./mapModel";
import { hashToUnit, pointOnEllipse, stableOrbitPoint } from "./orbitLayout";

const positions: readonly MapPoint[] = [
  { x: 20, y: 19 }, { x: 50, y: 13 }, { x: 80, y: 19 }, { x: 88, y: 40 }, { x: 83, y: 70 },
  { x: 62, y: 84 }, { x: 38, y: 84 }, { x: 17, y: 70 }, { x: 12, y: 40 }, { x: 50, y: 50 },
];
const stationOrbitRadius = 11;

export function buildOrbitMapModel(data: AppData): OrbitMapModel {
  const base = buildSkillMapModel(data);
  const systems = base.zones.map((zone, index) => ({ ...zone, position: positions[index % positions.length], orbitIndex: index }));
  const libraries: OrbitLibraryNode[] = systems.flatMap((system) => {
    const stations = base.stations
      .filter((station) => {
        const assignedSystem = systems.find((candidate) => candidate.category === station.category) ?? systems[0];
        return assignedSystem?.id === system.id;
      })
      .sort((left, right) => left.id.localeCompare(right.id));
    const phase = hashToUnit(system.id, "station-ring-phase");
    return stations.map((station, index) => ({
      ...station,
      systemId: system.id,
      position: clampOrbitPoint(pointOnEllipse(
        system.position,
        stationOrbitRadius,
        stationOrbitRadius * 0.68,
        phase + index / stations.length,
      )),
      orbitRadius: stationOrbitRadius,
    }));
  });
  const skills: OrbitSkillNode[] = base.skillDots.flatMap((skill) => {
    const station = libraries.find((candidate) => candidate.id === skill.stationId);
    if (!station) return [];
    return [{ ...skill, stationId: station.id, position: stableOrbitPoint(skill.id, station.position, 5.2, 3.4), orbitRadius: 5.2 }];
  });
  return { systems, libraries, skills };
}

function clampOrbitPoint(point: MapPoint): MapPoint {
  return {
    x: Math.max(3, Math.min(97, point.x)),
    y: Math.max(3, Math.min(97, point.y)),
  };
}
