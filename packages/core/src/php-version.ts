import { validateImageReference } from "./project-source";
import { ValidationError } from "./errors";
import { STACKS, normalizeFramework, type StackId } from "./stacks";

/** Versions verified with the generated Composer + FrankenPHP recipe. */
export const PHP_VERSIONS = ["8.3", "8.4"] as const;
export type PhpVersion = (typeof PHP_VERSIONS)[number];
export const DEFAULT_PHP_VERSION: PhpVersion = "8.4";

export function isPhpVersion(value: unknown): value is PhpVersion {
  return PHP_VERSIONS.some((version) => version === value);
}

/** A selected PHP source still needs Composer when it has no JS asset build. */
export function phpNeedsInstall(version: unknown, installCommand?: string | null): boolean {
  return isPhpVersion(version) && !!installCommand?.trim();
}

export function isPhpFramework(framework?: string | null): boolean {
  return STACKS[normalizeFramework(framework) as StackId]?.language === "php";
}

export function phpImagePair(version: PhpVersion) {
  return {
    buildImage: `php:${version}-cli-bookworm`,
    runtimeImage: `dunglas/frankenphp:1-php${version}-bookworm`,
  };
}

/** A custom builder is preserved, and its actual PHP binary is checked in the
 * recipe. Known incompatible official PHP tags are rejected before a build. */
export function resolvePhpImages(version: unknown, buildImage?: string | null) {
  if (!isPhpVersion(version)) {
    throw new ValidationError(
      `Unsupported phpVersion ${JSON.stringify(version)}. Choose ${PHP_VERSIONS.join(" or ")}.`,
    );
  }
  const pair = phpImagePair(version);
  const override = buildImage?.trim();
  if (override && validateImageReference(override))
    throw new ValidationError("buildImage must be a valid Docker image reference");
  if (!override) return { phpVersion: version, ...pair };
  const declaredVersion = /^(?:(?:docker\.io\/)?library\/)?php:(\d+\.\d+)(?:\.|-|@|$)/.exec(
    override,
  )?.[1];
  if (declaredVersion && declaredVersion !== version) {
    throw new ValidationError(
      `buildImage ${override} uses PHP ${declaredVersion}, but phpVersion is ${version}. Use ${pair.buildImage} or a compatible custom builder.`,
    );
  }
  return { phpVersion: version, ...pair, buildImage: override };
}

/** Shared project-level guard. No explicit version is ever silently discarded. */
export function assertPhpVersionTarget(config: {
  phpVersion?: unknown;
  framework?: string | null;
  runtimeMode?: string | null;
  projectType?: string | null;
  composePath?: string | null;
  buildKind?: string | null;
  sourceKind?: string | null;
  workloadType?: string | null;
}) {
  if (config.phpVersion == null) return;
  if (!isPhpVersion(config.phpVersion)) resolvePhpImages(config.phpVersion);
  if (
    !isPhpFramework(config.framework) ||
    config.runtimeMode === "bare" ||
    config.projectType === "monorepo" ||
    config.projectType === "compose" ||
    config.projectType === "services" ||
    config.projectType === "docker" ||
    config.composePath ||
    (config.buildKind && config.buildKind !== "buildpack") ||
    config.sourceKind === "image" ||
    config.workloadType === "static"
  ) {
    throw new ValidationError(
      "phpVersion requires an Openship-generated PHP Docker build. Remove phpVersion for bare runtimes, static sites, Compose/monorepo services, prebuilt images or your own Dockerfile.",
    );
  }
}

/** Version changes replace a previously managed default, never a custom image.
 * null restores the legacy default; omitted phpVersion leaves it untouched. */
export function phpProjectUpdate(
  previous: { phpVersion?: string | null; buildImage?: string | null } | null,
  changes: { phpVersion?: unknown; buildImage?: unknown },
): { phpVersion?: PhpVersion | null; buildImage?: string } {
  const previousDefault =
    previous?.phpVersion && isPhpVersion(previous.phpVersion)
      ? phpImagePair(previous.phpVersion).buildImage
      : "php:8.4-cli";
  const version = changes.phpVersion === undefined ? previous?.phpVersion : changes.phpVersion;
  if (version == null) {
    if (changes.phpVersion === null) {
      const image =
        typeof changes.buildImage === "string" ? changes.buildImage : previous?.buildImage;
      return {
        phpVersion: null,
        buildImage: !image || image === previousDefault ? "php:8.4-cli" : image,
      };
    }
    return {};
  }
  let image = typeof changes.buildImage === "string" ? changes.buildImage : previous?.buildImage;
  if (
    changes.phpVersion !== undefined &&
    previous &&
    image === previousDefault &&
    (changes.buildImage === undefined || changes.buildImage === previous.buildImage)
  )
    image = undefined;
  const resolved = resolvePhpImages(version, image);
  return { phpVersion: resolved.phpVersion, buildImage: resolved.buildImage };
}
