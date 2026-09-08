import "server-only";

import { resolve } from "node:path";
import { Readable } from "node:stream";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { AssetStorage } from "./asset-storage";
import { FilesystemAssetStorage } from "./filesystem-asset-storage";
import {
  S3CompatibleAssetStorage,
  type S3CompatiblePrivateObjectClient,
} from "./s3-compatible-asset-storage";

type Environment = Readonly<Record<string, string | undefined>>;
type AssetS3Configuration = Readonly<{
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}>;

export type RuntimeAssetStorageDependencies = Readonly<{
  /** Deterministic seam for tests; production uses the private AWS SDK adapter below. */
  createS3ObjectClient?: (configuration: AssetS3Configuration) => S3CompatiblePrivateObjectClient;
}>;

/** One server-only composition root used by web actions and the job runner. */
export function createRuntimeAssetStorage(
  environment: Environment = process.env,
  dependencies: RuntimeAssetStorageDependencies = {},
): AssetStorage {
  const driver = environment.ASSET_STORAGE_DRIVER;
  if (driver === "filesystem")
    return new FilesystemAssetStorage(
      environment.ASSET_STORAGE_ROOT ?? resolve(process.cwd(), ".data", "asset-storage"),
    );
  if (driver !== "s3") throw new Error("ASSET_STORAGE_DRIVER must explicitly be filesystem or s3.");

  const configuration = s3Configuration(environment);
  return new S3CompatibleAssetStorage(
    dependencies.createS3ObjectClient?.(configuration) ??
      createAwsS3PrivateObjectClient(configuration),
  );
}

function required(environment: Environment, key: string): string {
  const value = environment[key];
  if (!value) throw new Error(`${key} is required when ASSET_STORAGE_DRIVER=s3.`);
  return value;
}

function s3Configuration(environment: Environment): AssetS3Configuration {
  const forcePathStyle = environment.ASSET_S3_FORCE_PATH_STYLE;
  if (forcePathStyle !== undefined && forcePathStyle !== "true" && forcePathStyle !== "false")
    throw new Error("ASSET_S3_FORCE_PATH_STYLE must be true or false.");
  return {
    endpoint: required(environment, "ASSET_S3_ENDPOINT"),
    region: required(environment, "ASSET_S3_REGION"),
    bucket: required(environment, "ASSET_S3_BUCKET"),
    accessKeyId: required(environment, "ASSET_S3_ACCESS_KEY_ID"),
    secretAccessKey: required(environment, "ASSET_S3_SECRET_ACCESS_KEY"),
    forcePathStyle: forcePathStyle === "true",
  };
}

/** Kept internal so AWS SDK types and credentials never cross into application code. */
function createAwsS3PrivateObjectClient(
  configuration: AssetS3Configuration,
): S3CompatiblePrivateObjectClient {
  const client = new S3Client({
    endpoint: configuration.endpoint,
    region: configuration.region,
    forcePathStyle: configuration.forcePathStyle,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
  });
  const commandOptions = { Bucket: configuration.bucket };
  const expirySeconds = (expiresAt: Date) => {
    const seconds = Math.ceil((expiresAt.getTime() - Date.now()) / 1_000);
    if (seconds < 1 || seconds > 7 * 24 * 60 * 60)
      throw new Error("Asset capability expiry is invalid.");
    return seconds;
  };
  const isMissing = (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "NotFound" || error.name === "NoSuchKey" || error.name === "NoSuchBucket");

  return {
    async issueStagingPut(key, expiresAt, contentLength) {
      return {
        url: await getSignedUrl(
          client,
          new PutObjectCommand({ ...commandOptions, Key: key, ContentLength: contentLength }),
          { expiresIn: expirySeconds(expiresAt) },
        ),
      };
    },
    async head(key) {
      try {
        const response = await client.send(new HeadObjectCommand({ ...commandOptions, Key: key }));
        return typeof response.ContentLength === "number"
          ? { sizeBytes: response.ContentLength }
          : null;
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async get(key) {
      try {
        const response = await client.send(new GetObjectCommand({ ...commandOptions, Key: key }));
        return response.Body instanceof Readable ? response.Body : null;
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async putStaging(key, source) {
      await client.send(
        new PutObjectCommand({ ...commandOptions, Key: key, Body: Readable.from(source) }),
      );
    },
    async putIfAbsent(key, source) {
      try {
        await client.send(
          new PutObjectCommand({
            ...commandOptions,
            Key: key,
            Body: Readable.from(source),
            IfNoneMatch: "*",
          }),
        );
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "name" in error &&
          error.name === "PreconditionFailed"
        )
          return;
        throw error;
      }
    },
    async copyIfAbsent(source, destination) {
      try {
        await client.send(new HeadObjectCommand({ ...commandOptions, Key: destination }));
        return;
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      await client.send(
        new CopyObjectCommand({
          ...commandOptions,
          Key: destination,
          CopySource: `${encodeURIComponent(configuration.bucket)}/${source
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`,
        }),
      );
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ ...commandOptions, Key: key }));
    },
    async issuePrivateRead(key, expiresAt, options) {
      return {
        url: await getSignedUrl(
          client,
          new GetObjectCommand({
            ...commandOptions,
            Key: key,
            ResponseContentType: options.contentType,
            ResponseContentDisposition: options.contentDisposition,
            ResponseCacheControl: "private, no-store",
          }),
          { expiresIn: expirySeconds(expiresAt) },
        ),
      };
    },
  };
}
