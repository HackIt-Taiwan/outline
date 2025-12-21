import BoardCard from "~/models/BoardCard";
import BoardColumn from "~/models/BoardColumn";

const normalizeInlineText = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

const formatDueLabel = (dueOffsetDays: number | null | undefined) =>
  dueOffsetDays === null || dueOffsetDays === undefined
    ? "D-"
    : `D-${dueOffsetDays}`;

export default function kanbanToDocumentMarkdown({
  columns,
  cards,
}: {
  columns: BoardColumn[];
  cards: BoardCard[];
}) {
  const cardsByColumnId = new Map<string, BoardCard[]>();

  for (const card of cards) {
    const list = cardsByColumnId.get(card.columnId) ?? [];
    list.push(card);
    cardsByColumnId.set(card.columnId, list);
  }

  for (const list of cardsByColumnId.values()) {
    list.sort((a, b) => a.index.localeCompare(b.index));
  }

  const orderedColumns = [...columns].sort((a, b) =>
    a.index.localeCompare(b.index)
  );

  const lines: string[] = [];

  for (const column of orderedColumns) {
    lines.push(`[${normalizeInlineText(column.title)}]`);

    const columnCards = cardsByColumnId.get(column.id) ?? [];
    for (const card of columnCards) {
      lines.push(
        `- [ ] [${formatDueLabel(card.dueOffsetDays)}] ${normalizeInlineText(card.title)}`
      );

      if (card.description) {
        const description = normalizeInlineText(card.description);
        if (description) {
          lines.push(`  （${description}）`);
        }
      }
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
