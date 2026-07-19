import { hashToUnit } from "./orbitLayout";

const cosmosRoot = "/assets/cosmos";

export const cosmosAssetPools = {
  systems: [
    `${cosmosRoot}/celestial/13-dark-corona-star.png`,
    `${cosmosRoot}/celestial/14-pulsar.png`,
    `${cosmosRoot}/celestial/15-nebula-knot.png`,
    `${cosmosRoot}/celestial/16-quiet-accretion-ring.png`,
    `${cosmosRoot}/celestial/09-comet.png`,
    `${cosmosRoot}/celestial/10-asteroid-cluster.png`,
    `${cosmosRoot}/celestial/11-incomplete-orbital-ring.png`,
    `${cosmosRoot}/signals/05-transmission-waves.png`,
    `${cosmosRoot}/signals/08-gravity-lensing-arc.png`,
  ],
  libraries: [
    `${cosmosRoot}/celestial/01-cratered-planet.png`,
    `${cosmosRoot}/celestial/02-ringed-planet.png`,
    `${cosmosRoot}/celestial/04-banded-gas-giant.png`,
    `${cosmosRoot}/celestial/05-half-lit-moon.png`,
    `${cosmosRoot}/celestial/06-fractured-moon.png`,
    `${cosmosRoot}/celestial/07-twin-moons.png`,
    `${cosmosRoot}/celestial/08-dust-trail-moon.png`,
    `${cosmosRoot}/celestial/12-planet-with-moon.png`,
  ],
  skills: [
    `${cosmosRoot}/signals/06-beacon-star.png`,
    `${cosmosRoot}/signals/11-signal-loss-mark.png`,
    `${cosmosRoot}/signals/12-parallax-cluster.png`,
    `${cosmosRoot}/signals/16-fading-data-echo.png`,
  ],
  relics: [
    `${cosmosRoot}/relics/11-data-vault-capsule.png`,
    `${cosmosRoot}/relics/10-incomplete-orbital-gate.png`,
    `${cosmosRoot}/relics/07-satellite.png`,
    `${cosmosRoot}/relics/09-silent-monolith.png`,
    `${cosmosRoot}/relics/03-archive-beacon.png`,
    `${cosmosRoot}/relics/15-ruined-telescope.png`,
    `${cosmosRoot}/relics/16-archive-obelisk.png`,
    `${cosmosRoot}/relics/08-deep-space-probe.png`,
    `${cosmosRoot}/relics/01-observatory-dome.png`,
  ],
  catalogArrivals: [
    `${cosmosRoot}/environments/lost-relay-v01.png`,
    `${cosmosRoot}/environments/01-dead-corona-terminal-v01.png`,
    `${cosmosRoot}/environments/03-orphan-moon-tide-v01.png`,
    `${cosmosRoot}/environments/04-spent-comet-archive-v01.png`,
    `${cosmosRoot}/environments/05-abandoned-listening-array-v01.png`,
    `${cosmosRoot}/environments/06-severed-orbital-elevator-v01.png`,
    `${cosmosRoot}/environments/07-buried-archive-vault-v01.png`,
    `${cosmosRoot}/environments/08-drift-lighthouse-v01.png`,
    `${cosmosRoot}/environments/10-failed-beacon-procession-v01.png`,
    `${cosmosRoot}/environments/11-gravity-lens-ghost-v01.png`,
    `${cosmosRoot}/environments/15-far-side-signal-garden-v01.png`,
    `${cosmosRoot}/environments/16-sleeping-ring-station-v01.png`,
  ],
} as const;

export const cosmosIcons = {
  externalSource: `${cosmosRoot}/icons/07-external-source.png`,
  verified: `${cosmosRoot}/icons/08-verified.png`,
  privateLocal: `${cosmosRoot}/icons/09-private-local.png`,
  skillSpark: `${cosmosRoot}/icons/11-skill-spark.png`,
  recordedOutcome: `${cosmosRoot}/icons/14-recorded-outcome.png`,
  exportData: `${cosmosRoot}/icons/15-export.png`,
  importData: `${cosmosRoot}/icons/16-import.png`,
} as const;

export const historyEmptyAsset = `${cosmosRoot}/relics/03-archive-beacon.png`;

export function getSystemVisual(orbitIndex: number): string {
  return cosmosAssetPools.systems[positiveModulo(orbitIndex, cosmosAssetPools.systems.length)];
}

export function getLibraryVisual(id: string): string {
  return selectStable(id, "library-visual", cosmosAssetPools.libraries);
}

export function getSkillVisual(id: string): string {
  return selectStable(id, "skill-visual", cosmosAssetPools.skills);
}

export function getRelicVisual(orbitIndex: number): string {
  return cosmosAssetPools.relics[positiveModulo(orbitIndex, cosmosAssetPools.relics.length)];
}

export function getCatalogArrivalVisual(id: string): string {
  return selectStable(id, "catalog-arrival-visual", cosmosAssetPools.catalogArrivals);
}

function selectStable<const Pool extends readonly string[]>(id: string, salt: string, pool: Pool): Pool[number] {
  const index = Math.min(pool.length - 1, Math.floor(hashToUnit(id, salt) * pool.length));
  return pool[index];
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
