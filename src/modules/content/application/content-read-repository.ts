import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  contentDna,
  contentDrafts,
  contentGenerationAttempts,
  contents,
  ideaGenerationBatches,
  ideas,
} from "@/db/schema";

export type ContentReadDatabase = Pick<typeof db, "select">;

export type ContentSourceIdeaRecord = Readonly<{
  id: string;
  title: string;
}>;

export type ContentIdeaContextRecord = Readonly<{
  id: string;
  title: string;
  description: string;
  language: string;
  status: string;
}>;

export type ContentListRecord = Readonly<{
  content: typeof contents.$inferSelect;
  sourceIdeaTitle: string;
  draft: typeof contentDrafts.$inferSelect;
}>;

export type ContentDetailRecord = Readonly<{
  content: typeof contents.$inferSelect;
  sourceIdea: Readonly<{
    id: string;
    title: string;
  }>;
  draft: typeof contentDrafts.$inferSelect;
}>;

export type ContentGenerationAttemptReadRecord = Readonly<{
  attempt: typeof contentGenerationAttempts.$inferSelect;
  sourceIdea: Readonly<{
    id: string;
    title: string;
  }>;
  resultingContentId: string | null;
}>;

export async function findSourceIdea(
  database: ContentReadDatabase,
  workspaceId: string,
  sourceIdeaId: string,
): Promise<ContentSourceIdeaRecord | undefined> {
  const [record] = await database
    .select({
      id: ideas.id,
      title: ideas.title,
    })
    .from(ideas)
    .innerJoin(
      ideaGenerationBatches,
      and(
        eq(ideaGenerationBatches.id, ideas.batchId),
        eq(ideaGenerationBatches.workspaceId, workspaceId),
      ),
    )
    .where(eq(ideas.id, sourceIdeaId));

  return record;
}

export async function findContentIdeaContext(
  database: ContentReadDatabase,
  workspaceId: string,
  sourceIdeaId: string,
): Promise<ContentIdeaContextRecord | undefined> {
  const [record] = await database
    .select({
      id: ideas.id,
      title: ideas.title,
      description: ideas.description,
      language: ideas.language,
      status: ideas.status,
    })
    .from(ideas)
    .innerJoin(
      ideaGenerationBatches,
      and(
        eq(ideaGenerationBatches.id, ideas.batchId),
        eq(ideaGenerationBatches.workspaceId, workspaceId),
      ),
    )
    .where(eq(ideas.id, sourceIdeaId));

  return record;
}

export async function listContent(
  database: ContentReadDatabase,
  workspaceId: string,
): Promise<readonly ContentListRecord[]> {
  const records = await database
    .select({
      content: contents,
      sourceIdeaTitle: ideas.title,
      draft: contentDrafts,
    })
    .from(contents)
    .innerJoin(contentDrafts, eq(contentDrafts.contentId, contents.id))
    .innerJoin(ideas, eq(ideas.id, contents.sourceIdeaId))
    .innerJoin(
      ideaGenerationBatches,
      and(
        eq(ideaGenerationBatches.id, ideas.batchId),
        eq(ideaGenerationBatches.workspaceId, contents.workspaceId),
      ),
    )
    .where(eq(contents.workspaceId, workspaceId))
    .orderBy(desc(contentDrafts.updatedAt), desc(contents.id));

  return records;
}

export async function listContentForIdea(
  database: ContentReadDatabase,
  workspaceId: string,
  sourceIdeaId: string,
): Promise<readonly ContentDetailRecord[]> {
  const records = await database
    .select({
      content: contents,
      sourceIdea: {
        id: ideas.id,
        title: ideas.title,
      },
      draft: contentDrafts,
    })
    .from(contents)
    .innerJoin(contentDrafts, eq(contentDrafts.contentId, contents.id))
    .innerJoin(ideas, eq(ideas.id, contents.sourceIdeaId))
    .innerJoin(
      ideaGenerationBatches,
      and(
        eq(ideaGenerationBatches.id, ideas.batchId),
        eq(ideaGenerationBatches.workspaceId, workspaceId),
      ),
    )
    .where(and(eq(contents.workspaceId, workspaceId), eq(contents.sourceIdeaId, sourceIdeaId)))
    .orderBy(desc(contentDrafts.updatedAt), desc(contents.id));

  return records;
}

export async function findContentDetail(
  database: ContentReadDatabase,
  workspaceId: string,
  contentId: string,
): Promise<ContentDetailRecord | undefined> {
  const [record] = await database
    .select({
      content: contents,
      sourceIdea: {
        id: ideas.id,
        title: ideas.title,
      },
      draft: contentDrafts,
    })
    .from(contents)
    .innerJoin(contentDrafts, eq(contentDrafts.contentId, contents.id))
    .innerJoin(ideas, eq(ideas.id, contents.sourceIdeaId))
    .innerJoin(
      ideaGenerationBatches,
      and(
        eq(ideaGenerationBatches.id, ideas.batchId),
        eq(ideaGenerationBatches.workspaceId, contents.workspaceId),
      ),
    )
    .where(and(eq(contents.workspaceId, workspaceId), eq(contents.id, contentId)));

  return record;
}

export async function listContentGenerationAttemptsForIdea(
  database: ContentReadDatabase,
  workspaceId: string,
  sourceIdeaId: string,
): Promise<readonly ContentGenerationAttemptReadRecord[]> {
  const records = await database
    .select({
      attempt: contentGenerationAttempts,
      sourceIdea: {
        id: ideas.id,
        title: ideas.title,
      },
      resultingContentId: contents.id,
    })
    .from(contentGenerationAttempts)
    .innerJoin(ideas, eq(ideas.id, contentGenerationAttempts.sourceIdeaId))
    .innerJoin(
      ideaGenerationBatches,
      and(
        eq(ideaGenerationBatches.id, ideas.batchId),
        eq(ideaGenerationBatches.workspaceId, contentGenerationAttempts.workspaceId),
      ),
    )
    .leftJoin(
      contents,
      and(
        eq(contents.sourceGenerationAttemptId, contentGenerationAttempts.id),
        eq(contents.workspaceId, contentGenerationAttempts.workspaceId),
      ),
    )
    .where(
      and(
        eq(contentGenerationAttempts.workspaceId, workspaceId),
        eq(contentGenerationAttempts.sourceIdeaId, sourceIdeaId),
      ),
    )
    .orderBy(desc(contentGenerationAttempts.createdAt), desc(contentGenerationAttempts.id));

  return records;
}

export async function findContentGenerationAttemptDetail(
  database: ContentReadDatabase,
  workspaceId: string,
  attemptId: string,
): Promise<ContentGenerationAttemptReadRecord | undefined> {
  const [record] = await database
    .select({
      attempt: contentGenerationAttempts,
      sourceIdea: {
        id: ideas.id,
        title: ideas.title,
      },
      resultingContentId: contents.id,
    })
    .from(contentGenerationAttempts)
    .innerJoin(ideas, eq(ideas.id, contentGenerationAttempts.sourceIdeaId))
    .innerJoin(
      ideaGenerationBatches,
      and(
        eq(ideaGenerationBatches.id, ideas.batchId),
        eq(ideaGenerationBatches.workspaceId, contentGenerationAttempts.workspaceId),
      ),
    )
    .leftJoin(
      contents,
      and(
        eq(contents.sourceGenerationAttemptId, contentGenerationAttempts.id),
        eq(contents.workspaceId, contentGenerationAttempts.workspaceId),
      ),
    )
    .where(
      and(
        eq(contentGenerationAttempts.workspaceId, workspaceId),
        eq(contentGenerationAttempts.id, attemptId),
      ),
    );

  return record;
}

export async function findContentGenerationAttemptForRetry(
  database: ContentReadDatabase,
  workspaceId: string,
  attemptId: string,
): Promise<typeof contentGenerationAttempts.$inferSelect | undefined> {
  const [record] = await database
    .select({ attempt: contentGenerationAttempts })
    .from(contentGenerationAttempts)
    .innerJoin(ideas, eq(ideas.id, contentGenerationAttempts.sourceIdeaId))
    .innerJoin(
      ideaGenerationBatches,
      and(
        eq(ideaGenerationBatches.id, ideas.batchId),
        eq(ideaGenerationBatches.workspaceId, contentGenerationAttempts.workspaceId),
      ),
    )
    .where(
      and(
        eq(contentGenerationAttempts.workspaceId, workspaceId),
        eq(contentGenerationAttempts.id, attemptId),
      ),
    );

  return record?.attempt;
}

export async function findResultingContentId(
  database: ContentReadDatabase,
  workspaceId: string,
  attemptId: string,
): Promise<string | null> {
  const [record] = await database
    .select({ id: contents.id })
    .from(contents)
    .where(
      and(eq(contents.workspaceId, workspaceId), eq(contents.sourceGenerationAttemptId, attemptId)),
    );

  return record?.id ?? null;
}

export async function findResultingContentDetail(
  database: ContentReadDatabase,
  workspaceId: string,
  attemptId: string,
): Promise<ContentDetailRecord | undefined> {
  const [record] = await database
    .select({
      content: contents,
      sourceIdea: {
        id: ideas.id,
        title: ideas.title,
      },
      draft: contentDrafts,
    })
    .from(contents)
    .innerJoin(contentDrafts, eq(contentDrafts.contentId, contents.id))
    .innerJoin(ideas, eq(ideas.id, contents.sourceIdeaId))
    .innerJoin(
      ideaGenerationBatches,
      and(
        eq(ideaGenerationBatches.id, ideas.batchId),
        eq(ideaGenerationBatches.workspaceId, contents.workspaceId),
      ),
    )
    .where(
      and(eq(contents.workspaceId, workspaceId), eq(contents.sourceGenerationAttemptId, attemptId)),
    );

  return record;
}

export async function findIdeaContentUsage(
  database: ContentReadDatabase,
  workspaceId: string,
  sourceIdeaId: string,
): Promise<boolean> {
  const [record] = await database
    .select({ id: contents.id })
    .from(contents)
    .innerJoin(ideas, eq(ideas.id, contents.sourceIdeaId))
    .innerJoin(
      ideaGenerationBatches,
      and(
        eq(ideaGenerationBatches.id, ideas.batchId),
        eq(ideaGenerationBatches.workspaceId, contents.workspaceId),
      ),
    )
    .where(and(eq(contents.workspaceId, workspaceId), eq(contents.sourceIdeaId, sourceIdeaId)))
    .limit(1);

  return record !== undefined;
}

export async function findCurrentContentDnaVersionId(
  database: ContentReadDatabase,
  workspaceId: string,
): Promise<string | undefined> {
  const [record] = await database
    .select({ versionId: contentDna.currentVersionId })
    .from(contentDna)
    .where(eq(contentDna.workspaceId, workspaceId));

  return record?.versionId;
}
