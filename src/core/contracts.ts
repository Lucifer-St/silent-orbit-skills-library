import type {
  AppData,
  ChangeRecord,
  LibraryRecord,
  LocalizedText,
  MaintenanceStatusRecord,
  RelationRecord,
  SkillDetailRecord,
  SkillOrigin,
  SkillVisibility,
  StarredSkillRecord,
  StarTier,
} from "../types";

export interface ProjectConfigV1 {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly title: LocalizedText;
  readonly locales: readonly ("zh-CN" | "en-US")[];
  readonly defaultLocale: "zh-CN" | "en-US";
  readonly renderer: {
    readonly theme: string;
    readonly defaultRoute: string;
  };
  readonly privacy: {
    readonly defaultVisibility: SkillVisibility | "review-required";
    readonly publicVisibilities: readonly ("public" | "creator-showcase")[];
    readonly publishRawPaths: false;
    readonly publishHashes: false;
    readonly publishUsageEvidence: false;
  };
}

export interface InventorySourceV1 {
  readonly id: string;
  readonly providerKind: string;
  readonly label: string;
  readonly sourceUrl?: string;
  readonly scanState: "complete" | "partial" | "failed";
  readonly capabilities: {
    readonly discovery: "read-only";
    readonly write: false;
    readonly updateChannel: "source-managed" | "external" | "system-managed" | "unknown";
  };
}

export interface ObservedSkillMetadataV1 {
  readonly description?: string;
  readonly trigger?: string;
  readonly version?: string;
  readonly author?: string;
  readonly sourceUrl?: string;
}

export interface InventorySkillV1 {
  readonly id: string;
  readonly kind: "skill";
  readonly name: string;
  readonly sourceId: string;
  readonly state: "present" | "missing" | "unknown";
  readonly origin: SkillOrigin;
  readonly visibility: "public" | "creator-showcase" | "review-required";
  readonly status?: string;
  readonly observed?: ObservedSkillMetadataV1;
}

export interface InventoryDiagnosticV1 {
  readonly id: string;
  readonly sourceId: string;
  readonly itemId?: string;
  readonly severity: "warning" | "error";
  readonly code: string;
  readonly message: string;
}

export interface InventorySnapshotV1 {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly projectId: string;
  readonly generatedAt: string;
  readonly privacy: "sanitized";
  readonly sources: readonly InventorySourceV1[];
  readonly items: readonly InventorySkillV1[];
  readonly diagnostics: readonly InventoryDiagnosticV1[];
  readonly summary: {
    readonly sources: number;
    readonly items: number;
    readonly warnings: number;
    readonly errors: number;
  };
}

export interface FieldProvenanceV1 {
  readonly observed: readonly string[];
  readonly inferred: readonly string[];
  readonly curated: readonly string[];
}

export interface SnapshotSkillV1 {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly descriptionI18n?: LocalizedText;
  readonly trigger: string;
  readonly legacyCategory: string;
  readonly primaryCategoryId?: string;
  readonly sourceId: string;
  readonly libraryId: string;
  readonly libraryTitle: string;
  readonly libraryPage?: string;
  readonly status?: string;
  readonly frequency?: number;
  readonly importance?: number;
  readonly starTier?: StarTier;
  readonly repo?: string | null;
  readonly repoUrl?: string | null;
  readonly skillPage?: string;
  readonly origin: SkillOrigin;
  readonly visibility: "public" | "creator-showcase";
  readonly provenance: FieldProvenanceV1;
}

export interface SnapshotLibraryV1 {
  readonly id: string;
  readonly key: string;
  readonly sourceId: string;
  readonly title: string;
  readonly kind: string;
  readonly kindLabel?: string;
  readonly sourceLabel?: string;
  readonly sourceUrl?: string;
  readonly description?: string;
  readonly page?: string;
  readonly skillIds: readonly string[];
  readonly repos?: readonly string[];
  readonly plugins?: readonly string[];
  readonly legacyCategories?: readonly string[];
  readonly legacyPrimaryCategory?: string;
  readonly statusCounts?: Record<string, number>;
  readonly highValueCount?: number;
  readonly starredCount?: number;
}

export interface SnapshotCategoryV1 {
  readonly id: string;
  readonly name: string;
  readonly unitIds: readonly string[];
}

export interface SnapshotUnitV1 {
  readonly id: string;
  readonly categoryId: string;
  readonly type: string;
  readonly title: string;
  readonly kind?: string;
  readonly page?: string;
  readonly libraryId?: string;
  readonly skillIds: readonly string[];
}

export interface CategoryMembershipV1 {
  readonly categoryId: string;
  readonly skillId: string;
  readonly basis: readonly ("legacy-unit" | "legacy-skill-category" | "curated-override" | "inferred-rule" | "review-required")[];
}

export interface SnapshotCollectionV1 {
  readonly id: string;
  readonly kind: "personal-deck" | "curated";
  readonly title: string;
  readonly skillIds: readonly string[];
}

export interface LibrarySnapshotV1 {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly projectId: string;
  readonly generatedAt: string;
  readonly skills: readonly SnapshotSkillV1[];
  readonly libraries: readonly SnapshotLibraryV1[];
  readonly categories: readonly SnapshotCategoryV1[];
  readonly units: readonly SnapshotUnitV1[];
  readonly categoryMemberships: readonly CategoryMembershipV1[];
  readonly collections: readonly SnapshotCollectionV1[];
  readonly changes: readonly ChangeRecord[];
  readonly starredSkills: readonly StarredSkillRecord[];
  readonly relations: readonly RelationRecord[];
  readonly skillDetails: readonly SkillDetailRecord[];
  readonly maintenanceStatus: MaintenanceStatusRecord;
}

export interface SiteManifestV1 {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly generatedAt: string;
  readonly snapshotRefs: {
    readonly inventory: string;
    readonly library: string;
  };
  readonly renderer: ProjectConfigV1["renderer"];
  readonly locales: ProjectConfigV1["locales"];
  readonly summary: {
    readonly skills: number;
    readonly libraries: number;
    readonly categories: number;
    readonly collections: number;
  };
  readonly privacy: {
    readonly includesLocalOnly: false;
    readonly publicVisibilities: ProjectConfigV1["privacy"]["publicVisibilities"];
  };
}

export type CustomizationDensityV2 = "airy" | "balanced" | "compact";
export type CustomizationTypographyV2 = "editorial" | "technical" | "humanist";
export type CustomizationMotionV2 = "still" | "measured" | "expressive";
export type CustomizationLayoutV2 = "editorial-rail" | "signal-grid";
export type CustomizationShapeV2 = "square" | "soft";
export type CustomizationDecisionV2 = "keep" | "adjust" | "reject" | "redo";

export interface FrontendHandoffV2 {
  readonly schemaVersion: 2;
  readonly kind: "FrontendHandoffV2";
  readonly projectId: string;
  readonly generatedAt: string;
  readonly binding: {
    readonly siteData: "site-data.json";
    readonly librarySnapshotId: string;
    readonly summary: {
      readonly skills: number;
      readonly libraries: number;
      readonly categories: number;
      readonly collections: number;
    };
  };
  readonly renderer: {
    readonly id: string;
    readonly defaultRoute: string;
  };
  readonly locales: readonly ("zh-CN" | "en-US")[];
  readonly publicVisibilities: readonly ("public" | "creator-showcase")[];
  readonly requiredBehavior: readonly string[];
  readonly privacy: {
    readonly mode: "public-safe-only";
    readonly includesLocalOnly: false;
    readonly forbiddenInputs: readonly string[];
  };
  readonly refresh: {
    readonly managedFiles: readonly ["site-data.json", "frontend-handoff.v2.json"];
    readonly styleFilesImmutable: true;
  };
}

export interface DesignProfileV2 {
  readonly schemaVersion: 2;
  readonly kind: "DesignProfileV2";
  readonly profileId: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly preferences: {
    readonly references: readonly string[];
    readonly antiReferences: readonly string[];
    readonly qualities: readonly string[];
    readonly density: CustomizationDensityV2;
    readonly navigation: "map-first" | "library-first" | "balanced";
    readonly typography: CustomizationTypographyV2;
    readonly colorIntent: readonly string[];
    readonly motion: CustomizationMotionV2;
    readonly accessibility: {
      readonly highContrast: boolean;
      readonly reducedMotion: boolean;
      readonly mobilePriority: "essential" | "equal" | "desktop-led";
    };
  };
}

export interface CustomizationDirectionV2 {
  readonly id: string;
  readonly label: string;
  readonly rationale: string;
  readonly layout: CustomizationLayoutV2;
  readonly density: CustomizationDensityV2;
  readonly typography: CustomizationTypographyV2;
  readonly motion: CustomizationMotionV2;
  readonly shape: CustomizationShapeV2;
  readonly palette: {
    readonly paper: string;
    readonly ink: string;
    readonly muted: string;
    readonly line: string;
    readonly accent: string;
  };
  readonly revision: number;
  readonly parentDirectionId: string | null;
  readonly status: "candidate" | "rejected" | "superseded" | "selected";
  readonly createdAt: string;
}

export interface CustomizationStateV2 {
  readonly schemaVersion: 2;
  readonly kind: "CustomizationStateV2";
  readonly projectId: string;
  readonly profileRef: {
    readonly profileId: string;
    readonly revision: number;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rounds: readonly {
    readonly id: string;
    readonly createdAt: string;
    readonly status: "open" | "closed" | "selected";
    readonly inheritedFeedback: readonly string[];
    readonly directions: readonly CustomizationDirectionV2[];
    readonly decisions: readonly {
      readonly id: string;
      readonly action: CustomizationDecisionV2;
      readonly directionId: string | null;
      readonly feedback: readonly string[];
      readonly createdAt: string;
    }[];
  }[];
  readonly current: {
    readonly roundId: string;
    readonly directionId: string;
    readonly outputDirectory: "customization/current";
    readonly styleDigest: string;
  } | null;
}

export interface CustomFrontendManifestV2 {
  readonly schemaVersion: 2;
  readonly kind: "CustomFrontendManifestV2";
  readonly projectId: string;
  readonly profileRef: {
    readonly profileId: string;
    readonly revision: number;
  };
  readonly roundId: string;
  readonly directionId: string;
  readonly librarySnapshotId: string;
  readonly outputDirectory: string;
  readonly managedFiles: readonly ["site-data.json", "frontend-handoff.v2.json"];
  readonly styleDigest: string;
  readonly status: "candidate" | "current";
}

export interface CustomizationReceiptV2 {
  readonly schemaVersion: 2;
  readonly kind: "CustomizationReceiptV2";
  readonly receiptId: string;
  readonly command: "prepare" | "decide" | "refresh" | "doctor";
  readonly status: "succeeded" | "attention" | "blocked" | "error";
  readonly projectId: string;
  readonly profileRef: {
    readonly profileId: string;
    readonly revision: number;
  };
  readonly roundId: string | null;
  readonly directionId: string | null;
  readonly action: CustomizationDecisionV2 | null;
  readonly librarySnapshot: {
    readonly before: string | null;
    readonly after: string | null;
  };
  readonly style: {
    readonly before: string | null;
    readonly after: string | null;
    readonly preserved: boolean | null;
  };
  readonly createdAt: string;
  readonly privacy: {
    readonly rawInterviewStored: false;
    readonly absolutePathsStored: false;
    readonly privateProjectStateProjected: false;
  };
}

export interface Phase1EAlphaRunV1 {
  readonly generatedAt: string;
  readonly inventorySnapshotId: string;
  readonly librarySnapshotId: string;
  readonly siteManifestDigest: string;
  readonly distDigest: string;
  readonly doctorStatus: "ok";
}

export interface Phase1EAlphaDiffV1 {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
  readonly summary: { readonly added: number; readonly changed: number; readonly removed: number };
}

export interface Phase1EAlphaReceiptV1 {
  readonly schemaVersion: 1;
  readonly receiptId: string;
  readonly humanFeedback: false;
  readonly environment: {
    readonly kind: "fixed-independent";
    readonly execution: "installed-npm-tarball";
    readonly repository: string;
    readonly commit: string;
    readonly selectionDigest: string;
    readonly license: readonly string[];
  };
  readonly counts: { readonly observed: 48; readonly inventory: 46; readonly public: 44; readonly reviewRequired: 2; readonly localOnly: 2 };
  readonly v1: Phase1EAlphaRunV1;
  readonly v2: Phase1EAlphaRunV1;
  readonly diff: Phase1EAlphaDiffV1;
  readonly postGenerateDiff: Phase1EAlphaDiffV1;
  readonly privacy: { readonly status: "pass"; readonly forbiddenFindings: 0 };
  readonly compatibility: { readonly skills: 142; readonly libraries: 28; readonly categories: 9 };
  readonly release: {
    readonly privateGates: "pending" | "pass" | "blocked";
    readonly publicRc: "pending" | "pass" | "blocked";
    readonly draftPr: string | null;
    readonly releaseGate: "pending" | "pass" | "blocked";
    readonly deployPreview: "pending" | "pass" | "blocked";
    readonly productionChanged: false;
  };
}

export interface RendererViewModel extends AppData {
  readonly categorySkillNames: Readonly<Record<string, readonly string[]>>;
  readonly libraries: readonly LibraryRecord[];
}
