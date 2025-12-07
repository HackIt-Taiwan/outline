import { z } from "zod";
import { BoardTag } from "@shared/types";
import { BaseSchema } from "@server/routes/api/schema";

const IdSchema = z.object({
  id: z.string().uuid(),
});

const BoardLocatorBase = z.object({
  documentId: z.string().uuid().optional(),
  boardId: z.string().uuid().optional(),
});

const withLocator = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine((val) => val.documentId || val.boardId, {
    message: "documentId or boardId is required",
  });

const TagSchema: z.ZodType<BoardTag> = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable().optional(),
});

export const BoardsInfoSchema = BaseSchema.extend({
  body: withLocator(BoardLocatorBase),
});
export type BoardsInfoReq = z.infer<typeof BoardsInfoSchema>;

export const BoardsEnableSchema = BaseSchema.extend({
  body: z.object({
    documentId: z.string().uuid(),
  }),
});
export type BoardsEnableReq = z.infer<typeof BoardsEnableSchema>;

export const BoardsUpdateSchema = BaseSchema.extend({
  body: IdSchema.extend({
    title: z.string().min(1).max(255),
  }),
});
export type BoardsUpdateReq = z.infer<typeof BoardsUpdateSchema>;

export const BoardColumnsCreateSchema = BaseSchema.extend({
  body: withLocator(
    BoardLocatorBase.extend({
      title: z.string().min(1).max(255),
      color: z.string().nullable().optional(),
    })
  ),
});
export type BoardColumnsCreateReq = z.infer<typeof BoardColumnsCreateSchema>;

export const BoardColumnsUpdateSchema = BaseSchema.extend({
  body: IdSchema.extend({
    title: z.string().min(1).max(255).optional(),
    color: z.string().nullable().optional(),
  }),
});
export type BoardColumnsUpdateReq = z.infer<typeof BoardColumnsUpdateSchema>;

export const BoardColumnsMoveSchema = BaseSchema.extend({
  body: IdSchema.extend({
    beforeId: z.string().uuid().optional(),
    afterId: z.string().uuid().optional(),
  }),
});
export type BoardColumnsMoveReq = z.infer<typeof BoardColumnsMoveSchema>;

export const BoardColumnsDeleteSchema = BaseSchema.extend({
  body: IdSchema,
});
export type BoardColumnsDeleteReq = z.infer<typeof BoardColumnsDeleteSchema>;

export const BoardCardsCreateSchema = BaseSchema.extend({
  body: withLocator(
    BoardLocatorBase.extend({
      columnId: z.string().uuid(),
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      tags: TagSchema.array().optional(),
      metadata: z.record(z.any()).optional(),
      assigneeIds: z.array(z.string().uuid()).optional(),
    })
  ),
});
export type BoardCardsCreateReq = z.infer<typeof BoardCardsCreateSchema>;

export const BoardCardsUpdateSchema = BaseSchema.extend({
  body: IdSchema.extend({
    title: z.string().min(1).max(255).optional(),
    description: z.string().nullable().optional(),
    tags: TagSchema.array().nullable().optional(),
    metadata: z.record(z.any()).nullable().optional(),
    assigneeIds: z.array(z.string().uuid()).nullable().optional(),
  }),
});
export type BoardCardsUpdateReq = z.infer<typeof BoardCardsUpdateSchema>;

export const BoardCardsMoveSchema = BaseSchema.extend({
  body: IdSchema.extend({
    columnId: z.string().uuid(),
    beforeId: z.string().uuid().optional(),
    afterId: z.string().uuid().optional(),
  }),
});
export type BoardCardsMoveReq = z.infer<typeof BoardCardsMoveSchema>;

export const BoardCardsDeleteSchema = BaseSchema.extend({
  body: IdSchema,
});
export type BoardCardsDeleteReq = z.infer<typeof BoardCardsDeleteSchema>;

export const BoardsUpdateTagsSchema = BaseSchema.extend({
  body: IdSchema.extend({
    tags: TagSchema.array(),
  }),
});
export type BoardsUpdateTagsReq = z.infer<typeof BoardsUpdateTagsSchema>;
