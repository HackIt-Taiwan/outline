import fractionalIndex from "fractional-index";
import Router from "koa-router";
import { Op } from "sequelize";
import { Board, BoardCard, BoardColumn, Document, Event } from "@server/models";
import auth from "@server/middlewares/authentication";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import { authorize } from "@server/policies";
import {
  presentBoard,
  presentBoardCard,
  presentBoardColumn,
  presentPolicies,
} from "@server/presenters";
import { APIContext } from "@server/types";
import * as T from "./schema";

const DEFAULT_COLUMNS = [
  { title: "To Do", color: "#8e9aa6" },
  { title: "Doing", color: "#f5a623" },
  { title: "Done", color: "#2fb344" },
];

const router = new Router();

async function loadDocument(
  userId: string,
  documentId: string | undefined,
  boardId?: string
) {
  if (boardId) {
    const board = await Board.findByPk(boardId);
    if (board) {
      return Document.findByPk(board.documentId, { userId, rejectOnEmpty: true });
    }
  }
  if (!documentId) {
    return null;
  }
  return Document.findByPk(documentId, { userId, rejectOnEmpty: true });
}

async function createBoardWithDefaults(ctx: APIContext, document: Document) {
  const { user } = ctx.state.auth;
  const createdBoard = await Board.createWithCtx(ctx, {
    documentId: document.id,
    teamId: user.teamId,
    title: document.title,
    createdById: user.id,
    updatedById: user.id,
  });

  let lastIndex: string | null = null;
  for (const column of DEFAULT_COLUMNS) {
    const index = fractionalIndex(lastIndex, null);
    await BoardColumn.createWithCtx(ctx, {
      boardId: createdBoard.id,
      documentId: document.id,
      teamId: user.teamId,
      title: column.title,
      color: column.color,
      index,
      createdById: user.id,
      updatedById: user.id,
    });
    lastIndex = index;
  }

  return createdBoard;
}

const emitBoardChange = (
  ctx: APIContext,
  documentId: string,
  data: Record<string, any>
) =>
  Event.createFromContext(ctx, {
    name: "boards.change",
    documentId,
    data: {
      documentId,
      actorId: ctx.state.auth.user.id,
      ...data,
    },
  });

router.post(
  "boards.info",
  auth(),
  transaction(),
  validate(T.BoardsInfoSchema),
  async (ctx: APIContext<T.BoardsInfoReq>) => {
    const { documentId, boardId } = ctx.input.body;
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;

    const document = await loadDocument(user.id, documentId, boardId);
    authorize(user, "read", document);

    const board = boardId
      ? await Board.findByPk(boardId, { transaction })
      : await Board.findOne({
          where: { documentId: document.id, teamId: user.teamId },
          transaction,
        });
    if (!board) {
      ctx.throw(404, "Board not enabled for this document");
      return;
    }

    const [columns, cards] = await Promise.all([
      BoardColumn.findAll({
        where: {
          boardId: board.id,
          deletedAt: { [Op.is]: null },
        },
        order: [["index", "ASC"]],
        transaction,
      }),
      BoardCard.findAll({
        where: {
          boardId: board.id,
          deletedAt: { [Op.is]: null },
        },
        order: [["index", "ASC"]],
        transaction,
      }),
    ]);

    ctx.body = {
      data: {
        board: presentBoard(board),
        columns: columns.map(presentBoardColumn),
        cards: cards.map(presentBoardCard),
      },
      policies: presentPolicies(user, [document]),
    };
  }
);

router.post(
  "boards.enable",
  auth(),
  transaction(),
  validate(T.BoardsEnableSchema),
  async (ctx: APIContext<T.BoardsEnableReq>) => {
    const { documentId } = ctx.input.body;
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;

    const document = await Document.findByPk(documentId, {
      userId: user.id,
      transaction,
      rejectOnEmpty: true,
    });
    authorize(user, "update", document);

    const existing = await Board.findOne({
      where: { documentId, teamId: user.teamId },
      transaction,
    });
    if (existing) {
      ctx.body = {
        data: presentBoard(existing),
        policies: presentPolicies(user, [document]),
      };
      return;
    }

    const board = await createBoardWithDefaults(ctx, document);

    await emitBoardChange(ctx, document.id, {
      board: presentBoard(board),
    });

    ctx.body = {
      data: presentBoard(board),
      policies: presentPolicies(user, [document]),
    };
  }
);

router.post(
  "boards.update",
  auth(),
  transaction(),
  validate(T.BoardsUpdateSchema),
  async (ctx: APIContext<T.BoardsUpdateReq>) => {
    const { id, title } = ctx.input.body;
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;

    const board = await Board.findByPk(id, {
      transaction,
      rejectOnEmpty: true,
    });
    const document = await Document.findByPk(board.documentId, {
      userId: user.id,
      transaction,
      rejectOnEmpty: true,
    });
    authorize(user, "update", document);

    board.title = title;
    board.updatedById = user.id;
    await board.saveWithCtx(ctx, { transaction });

    ctx.body = {
      data: presentBoard(board),
      policies: presentPolicies(user, [document]),
    };

    await emitBoardChange(ctx, document.id, {
      board: presentBoard(board),
    });
  }
);

router.post(
  "boardColumns.create",
  auth(),
  transaction(),
  validate(T.BoardColumnsCreateSchema),
  async (ctx: APIContext<T.BoardColumnsCreateReq>) => {
    const { user } = ctx.state.auth;
    const { documentId, boardId, title, color } = ctx.input.body;
    const { transaction } = ctx.state;

    const document = await loadDocument(user.id, documentId, boardId);
    authorize(user, "update", document);

    const board =
      boardId && (await Board.findByPk(boardId, { transaction }))?.id
        ? await Board.findByPk(boardId, { transaction })
        : await Board.findOne({
            where: { documentId: document.id },
            transaction,
          });
    const ensuredBoard = await ensureBoard(ctx, document, board);

    const lastColumn = await BoardColumn.findOne({
      where: { boardId: ensuredBoard.id },
      order: [["index", "DESC"]],
      transaction,
    });

    const index = fractionalIndex(lastColumn?.index ?? null, null);
    const column = await BoardColumn.createWithCtx(ctx, {
      boardId: ensuredBoard.id,
      documentId: document.id,
      teamId: user.teamId,
      title,
      color,
      index,
      createdById: user.id,
      updatedById: user.id,
    });

    ctx.body = {
      data: presentBoardColumn(column),
      policies: presentPolicies(user, [document]),
    };

    await emitBoardChange(ctx, document.id, {
      columns: [presentBoardColumn(column)],
    });
  }
);

router.post(
  "boardColumns.update",
  auth(),
  transaction(),
  validate(T.BoardColumnsUpdateSchema),
  async (ctx: APIContext<T.BoardColumnsUpdateReq>) => {
    const { id, title, color } = ctx.input.body;
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;

    const column = await BoardColumn.findByPk(id, {
      transaction,
      rejectOnEmpty: true,
    });
    const document = await Document.findByPk(column.documentId, {
      userId: user.id,
      transaction,
      rejectOnEmpty: true,
    });
    authorize(user, "update", document);

    if (title !== undefined) {
      column.title = title;
    }
    if (color !== undefined) {
      column.color = color;
    }
    column.updatedById = user.id;
    await column.saveWithCtx(ctx, { transaction });

    ctx.body = {
      data: presentBoardColumn(column),
      policies: presentPolicies(user, [document]),
    };

    await emitBoardChange(ctx, document.id, {
      columns: [presentBoardColumn(column)],
    });
  }
);

router.post(
  "boardColumns.move",
  auth(),
  transaction(),
  validate(T.BoardColumnsMoveSchema),
  async (ctx: APIContext<T.BoardColumnsMoveReq>) => {
    const { id, beforeId, afterId } = ctx.input.body;
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;

    const column = await BoardColumn.findByPk(id, {
      transaction,
      rejectOnEmpty: true,
    });
    const document = await Document.findByPk(column.documentId, {
      userId: user.id,
      transaction,
      rejectOnEmpty: true,
    });
    authorize(user, "update", document);

    const siblings = await BoardColumn.findAll({
      where: {
        boardId: column.boardId,
        id: { [Op.ne]: column.id },
        deletedAt: { [Op.is]: null },
      },
      order: [["index", "ASC"]],
      transaction,
    });

    const before = siblings.find((col) => col.id === beforeId);
    const after = siblings.find((col) => col.id === afterId);
    const newIndex = fractionalIndex(before?.index ?? null, after?.index ?? null);

    column.index = newIndex;
    column.updatedById = user.id;
    await column.saveWithCtx(ctx, { transaction });

    ctx.body = {
      data: presentBoardColumn(column),
      policies: presentPolicies(user, [document]),
    };

    await emitBoardChange(ctx, document.id, {
      columns: [presentBoardColumn(column)],
    });
  }
);

router.post(
  "boardColumns.delete",
  auth(),
  transaction(),
  validate(T.BoardColumnsDeleteSchema),
  async (ctx: APIContext<T.BoardColumnsDeleteReq>) => {
    const { id } = ctx.input.body;
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;

    const column = await BoardColumn.findByPk(id, {
      transaction,
      rejectOnEmpty: true,
    });
    const document = await Document.findByPk(column.documentId, {
      userId: user.id,
      transaction,
      rejectOnEmpty: true,
    });
    authorize(user, "update", document);

    await column.destroy({ transaction });

    ctx.body = {
      success: true,
      policies: presentPolicies(user, [document]),
    };

    await emitBoardChange(ctx, document.id, {
      deletedColumnIds: [id],
    });
  }
);

router.post(
  "boardCards.create",
  auth(),
  transaction(),
  validate(T.BoardCardsCreateSchema),
  async (ctx: APIContext<T.BoardCardsCreateReq>) => {
    const { user } = ctx.state.auth;
    const { documentId, boardId, columnId, title, description, tags, metadata, assigneeId } =
      ctx.input.body;
    const { transaction } = ctx.state;

    const document = await loadDocument(user.id, documentId, boardId);
    authorize(user, "update", document);

    const column = await BoardColumn.findByPk(columnId, {
      transaction,
      rejectOnEmpty: true,
    });
    if (column.documentId !== document.id) {
      ctx.throw(400, "Column does not belong to document");
      return;
    }

    const lastCard = await BoardCard.findOne({
      where: { columnId },
      order: [["index", "DESC"]],
      transaction,
    });
    const index = fractionalIndex(lastCard?.index ?? null, null);
    const card = await BoardCard.createWithCtx(ctx, {
      boardId: column.boardId,
      columnId,
      documentId: document.id,
      teamId: user.teamId,
      title,
      description,
      tags,
      metadata,
      assigneeId: assigneeId ?? null,
      index,
      createdById: user.id,
      updatedById: user.id,
    });

    ctx.body = {
      data: presentBoardCard(card),
      policies: presentPolicies(user, [document]),
    };

    await emitBoardChange(ctx, document.id, {
      cards: [presentBoardCard(card)],
    });
  }
);

router.post(
  "boardCards.update",
  auth(),
  transaction(),
  validate(T.BoardCardsUpdateSchema),
  async (ctx: APIContext<T.BoardCardsUpdateReq>) => {
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;
    const { id, title, description, tags, metadata, assigneeId } =
      ctx.input.body;

    const card = await BoardCard.findByPk(id, {
      transaction,
      rejectOnEmpty: true,
    });
    const document = await Document.findByPk(card.documentId, {
      userId: user.id,
      transaction,
      rejectOnEmpty: true,
    });
    authorize(user, "update", document);

    if (title !== undefined) {
      card.title = title;
    }
    if (description !== undefined) {
      card.description = description;
    }
    if (tags !== undefined) {
      card.tags = tags;
    }
    if (metadata !== undefined) {
      card.metadata = metadata;
    }
    if (assigneeId !== undefined) {
      card.assigneeId = assigneeId;
    }
    card.updatedById = user.id;
    await card.saveWithCtx(ctx, { transaction });

    ctx.body = {
      data: presentBoardCard(card),
      policies: presentPolicies(user, [document]),
    };

    await emitBoardChange(ctx, document.id, {
      cards: [presentBoardCard(card)],
    });
  }
);

router.post(
  "boardCards.move",
  auth(),
  transaction(),
  validate(T.BoardCardsMoveSchema),
  async (ctx: APIContext<T.BoardCardsMoveReq>) => {
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;
    const { id, columnId, beforeId, afterId } = ctx.input.body;

    const card = await BoardCard.findByPk(id, {
      transaction,
      rejectOnEmpty: true,
    });
    const targetColumn = await BoardColumn.findByPk(columnId, {
      transaction,
      rejectOnEmpty: true,
    });
    const document = await Document.findByPk(card.documentId, {
      userId: user.id,
      transaction,
      rejectOnEmpty: true,
    });
    authorize(user, "update", document);

    if (targetColumn.documentId !== document.id) {
      ctx.throw(400, "Column does not belong to document");
      return;
    }

    const siblings = await BoardCard.findAll({
      where: {
        columnId,
        id: { [Op.ne]: card.id },
        deletedAt: { [Op.is]: null },
      },
      order: [["index", "ASC"]],
      transaction,
    });
    const before = siblings.find((c) => c.id === beforeId);
    const after = siblings.find((c) => c.id === afterId);
    const newIndex = fractionalIndex(before?.index ?? null, after?.index ?? null);

    card.index = newIndex;
    card.columnId = columnId;
    card.boardId = targetColumn.boardId;
    card.updatedById = user.id;
    await card.saveWithCtx(ctx, { transaction });

    ctx.body = {
      data: presentBoardCard(card),
      policies: presentPolicies(user, [document]),
    };

    await emitBoardChange(ctx, document.id, {
      cards: [presentBoardCard(card)],
    });
  }
);

router.post(
  "boardCards.delete",
  auth(),
  transaction(),
  validate(T.BoardCardsDeleteSchema),
  async (ctx: APIContext<T.BoardCardsDeleteReq>) => {
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;
    const { id } = ctx.input.body;

    const card = await BoardCard.findByPk(id, {
      transaction,
      rejectOnEmpty: true,
    });
    const document = await Document.findByPk(card.documentId, {
      userId: user.id,
      transaction,
      rejectOnEmpty: true,
    });
    authorize(user, "update", document);

    await card.destroy({ transaction });

    ctx.body = {
      success: true,
      policies: presentPolicies(user, [document]),
    };

    await emitBoardChange(ctx, document.id, {
      deletedCardIds: [id],
    });
  }
);

export default router;
