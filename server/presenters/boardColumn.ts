import { BoardColumn } from "@server/models";

export default function presentBoardColumn(column: BoardColumn) {
  return {
    id: column.id,
    boardId: column.boardId,
    documentId: column.documentId,
    teamId: column.teamId,
    title: column.title,
    color: column.color,
    index: column.index,
    createdAt: column.createdAt,
    updatedAt: column.updatedAt,
  };
}
