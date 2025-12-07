import { Board } from "@server/models";

export default function presentBoard(board: Board) {
  return {
    id: board.id,
    documentId: board.documentId,
    teamId: board.teamId,
    title: board.title,
    tags: board.tags ?? [],
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
}
