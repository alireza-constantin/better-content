import type { MediaInspectionResult, MediaType } from "../domain/media-inspection-contracts";

export type MediaInspectionInput = Readonly<{
  /** An application-controlled local path, normally owned by the temp-file boundary. */
  filePath: string;
  declaredMediaType: MediaType;
  originalFilename?: string;
}>;

export interface MediaInspector {
  inspect(input: MediaInspectionInput): Promise<MediaInspectionResult>;
}
