import { BoardCard } from "@server/models";

export default function presentBoardCard(card: BoardCard) {
  return {
    id: card.id,
    boardId: card.boardId,
    columnId: card.columnId,
    documentId: card.documentId,
    teamId: card.teamId,
    title: card.title,
    description: card.description,
    tags: card.tags,
    metadata: card.metadata,
    assigneeIds: card.assigneeIds ?? [],
    index: card.index,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}
