import { DndContext, DragEndEvent, useDroppable } from "@dnd-kit/core";
import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { observer } from "mobx-react";
import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { BoardTag } from "@shared/types";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import Heading from "~/components/Heading";
import Input from "~/components/Input";
import LoadingIndicator from "~/components/LoadingIndicator";
import Modal from "~/components/Modal";
import Scrollable from "~/components/Scrollable";
import Text from "~/components/Text";
import BoardCardModel from "~/models/BoardCard";
import BoardColumnModel from "~/models/BoardColumn";
import Document from "~/models/Document";
import useStores from "~/hooks/useStores";
import { s } from "@shared/styles";

type Props = {
  document: Document;
  abilities: Record<string, boolean>;
  readOnly: boolean;
};

type TagEditorProps = {
  value: BoardTag[] | null | undefined;
  onChange: (tags: BoardTag[]) => void;
};

const TagEditor = ({ value, onChange }: TagEditorProps) => {
  const [raw, setRaw] = useState(
    value?.map((tag) => tag.name).join(", ") ?? ""
  );

  useEffect(() => {
    setRaw(value?.map((tag) => tag.name).join(", ") ?? "");
  }, [value]);

  return (
    <Input
      value={raw}
      onChange={(ev) => {
        const next = ev.target.value;
        setRaw(next);
        const tags = next
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .map((name) => ({
            id: name,
            name,
          }));
        onChange(tags);
      }}
      placeholder="tag1, tag2"
    />
  );
};

function ColumnDroppable({
  columnId,
  children,
}: {
  columnId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${columnId}`,
    data: {
      type: "column",
      columnId,
    },
  });

  return (
    <CardsArea ref={setNodeRef} $isOver={isOver}>
      {children}
    </CardsArea>
  );
}

type SortableCardProps = {
  card: BoardCardModel;
  onSelect: (card: BoardCardModel) => void;
};

const SortableCard = ({ card, onSelect }: SortableCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: card.id,
      data: { type: "card", columnId: card.columnId },
    });

  return (
    <CardShell
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(card)}
    >
      <Text weight="bold">{card.title}</Text>
      {card.tags?.length ? (
        <TagRow>
          {card.tags.map((tag) => (
            <Tag key={tag.id} $color={tag.color}>
              {tag.name}
            </Tag>
          ))}
        </TagRow>
      ) : null}
      {card.assigneeId ? (
        <MetaLine>{`Assignee: ${card.assignee?.name ?? "Unknown"}`}</MetaLine>
      ) : null}
    </CardShell>
  );
};

function BoardView({ document, abilities, readOnly }: Props) {
  const { boards, boardColumns, boardCards, users } = useStores();
  const [boardId, setBoardId] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [newCardTitle, setNewCardTitle] = useState<Record<string, string>>({});
  const [selectedCard, setSelectedCard] = useState<BoardCardModel | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  useEffect(() => {
    setLoading(true);
    boards
      .fetchForDocument(document.id)
      .then((board) => setBoardId(board.id))
      .finally(() => setLoading(false));
  }, [boards, document.id]);

  const columns = useMemo(
    () => (boardId ? boardColumns.inBoard(boardId) : []),
    [boardColumns, boardId]
  );

  const handleAddColumn = async () => {
    if (!newColumnTitle.trim() || !boardId) {
      return;
    }
    await boardColumns.create({
      title: newColumnTitle.trim(),
      boardId,
      documentId: document.id,
    });
    setNewColumnTitle("");
  };

  const handleAddCard = async (column: BoardColumnModel) => {
    const title = newCardTitle[column.id];
    if (!title?.trim()) {
      return;
    }
    await boardCards.create({
      title: title.trim(),
      columnId: column.id,
      documentId: document.id,
      boardId,
    });
    setNewCardTitle((prev) => ({ ...prev, [column.id]: "" }));
  };

  const handleCardMove = async (event: DragEndEvent) => {
    if (readOnly) {
      return;
    }
    const { active, over } = event;
    if (!over) {
      return;
    }
    const activeCard = boardCards.get(active.id as string);
    if (!activeCard) {
      return;
    }

    const overId = over.id.toString();
    const overCard =
      overId.startsWith("column-") ? null : boardCards.get(overId);
    const targetColumnId =
      overCard?.columnId ??
      over.data?.current?.columnId ??
      (overId.startsWith("column-") ? overId.replace("column-", "") : null);

    if (!targetColumnId) {
      return;
    }

    const targetCards = boardCards
      .inColumn(targetColumnId)
      .filter((card) => card.id !== activeCard.id);
    const insertionIndex = overCard
      ? targetCards.findIndex((c) => c.id === overCard.id)
      : targetCards.length;

    const beforeId =
      insertionIndex > 0 ? targetCards[insertionIndex - 1]?.id : undefined;
    const afterId = targetCards[insertionIndex]?.id;

    await boardCards.move({
      id: activeCard.id,
      columnId: targetColumnId,
      beforeId,
      afterId,
    });
  };

  const handleSaveCard = async (card: BoardCardModel) => {
    await boardCards.update({
      id: card.id,
      title: card.title,
      description: card.description ?? "",
      tags: card.tags ?? [],
      assigneeId: card.assigneeId,
      metadata: card.metadata,
    });
  };

  const handleDeleteCard = async (card: BoardCardModel) => {
    await boardCards.delete(card);
    setSelectedCard(null);
  };

  const handleSelectAssignee = (userId: string | null) => {
    setSelectedCard((prev) =>
      prev
        ? Object.assign(
            prev,
            { assigneeId: userId, assignee: userId ? users.get(userId) : null } // mutate observable
          )
        : null
    );
  };

  if (isLoading || !boardId) {
    return (
      <LoadingWrap>
        <LoadingIndicator />
      </LoadingWrap>
    );
  }

  return (
    <BoardSurface auto hideScrollbars>
      <Header>
        <div>
          <Heading>{document.title}</Heading>
          <Text type="secondary">Kanban board</Text>
        </div>
        <Flex align="center" gap={8}>
          <Button
            neutral
            onClick={() => {
              window.location.href = document.url;
            }}
          >
            查看文件
          </Button>
          {!readOnly && (
            <>
              <Input
                placeholder="New column name"
                value={newColumnTitle}
                onChange={(ev) => setNewColumnTitle(ev.target.value)}
              />
              <Button onClick={handleAddColumn} disabled={!newColumnTitle.trim()}>
                Add column
              </Button>
            </>
          )}
        </Flex>
      </Header>
      <DndContext sensors={sensors} onDragEnd={handleCardMove}>
        <Columns>
          {columns.map((column) => {
            const cards = boardCards.inColumn(column.id);
            return (
              <Column key={column.id}>
                <ColumnHeader>
                  <Text weight="bold">{column.title}</Text>
                  <Count>{cards.length}</Count>
                </ColumnHeader>
                <SortableContext
                  items={cards.map((card) => card.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ColumnDroppable columnId={column.id}>
                    {cards.map((card) => (
                      <SortableCard
                        key={card.id}
                        card={card}
                        onSelect={(c) => setSelectedCard(c)}
                      />
                    ))}
                  </ColumnDroppable>
                </SortableContext>
                {!readOnly && (
                  <AddCardRow>
                    <Input
                      placeholder="New task"
                      value={newCardTitle[column.id] ?? ""}
                      onChange={(ev) =>
                        setNewCardTitle((prev) => ({
                          ...prev,
                          [column.id]: ev.target.value,
                        }))
                      }
                    />
                    <Button
                      onClick={() => handleAddCard(column)}
                      disabled={!newCardTitle[column.id]?.trim()}
                      neutral
                    >
                      Add
                    </Button>
                  </AddCardRow>
                )}
              </Column>
            );
          })}
        </Columns>
      </DndContext>

      <Modal
        isOpen={!!selectedCard}
        title={selectedCard?.title}
        onRequestClose={() => setSelectedCard(null)}
      >
        {selectedCard && (
          <Flex column gap={12}>
            <Input
              label="Title"
              value={selectedCard.title}
              onChange={(ev) => (selectedCard.title = ev.target.value)}
            />
            <Input
              label="Description"
              type="textarea"
              value={selectedCard.description ?? ""}
              onChange={(ev) => (selectedCard.description = ev.target.value)}
            />
            <TagEditor
              value={selectedCard.tags}
              onChange={(tags) => (selectedCard.tags = tags)}
            />
            <Input
              label="Assignee (user id)"
              value={selectedCard.assigneeId ?? ""}
              onChange={(ev) =>
                handleSelectAssignee(ev.target.value || null)
              }
            />
            {!readOnly && (
              <Flex gap={8}>
                <Button onClick={() => handleSaveCard(selectedCard)}>
                  Save
                </Button>
                <Button onClick={() => handleDeleteCard(selectedCard)} neutral>
                  Delete
                </Button>
              </Flex>
            )}
          </Flex>
        )}
      </Modal>
    </Scrollable>
  );
}

export default observer(BoardView);

const Header = styled(Flex)`
  padding: 16px 24px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid ${s("divider")};
`;

const Columns = styled.div`
  display: flex;
  gap: 18px;
  padding: 20px 28px 44px;
  overflow-x: auto;
`;

const Column = styled.div`
  background: linear-gradient(
      145deg,
      ${s("background")} 0%,
      ${s("backgroundSecondary")} 100%
    ),
    ${s("cardBackground")};
  border: 1px solid ${s("divider")};
  border-radius: 14px;
  min-height: 240px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow:
    0 14px 30px rgba(0, 0, 0, 0.08),
    0 1px 0 rgba(255, 255, 255, 0.05);
`;

const ColumnHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 0 16px;
`;

const CardsArea = styled.div<{ $isOver?: boolean }>`
  padding: 10px 14px 14px;
  min-height: 140px;
  border: 1px dashed
    ${(props) => (props.$isOver ? s("accent") : "transparent")};
  border-radius: 10px;
  transition: border 120ms ease, background 120ms ease;
  background: ${(props) =>
    props.$isOver ? "rgba(255,255,255,0.03)" : "transparent"};
  backdrop-filter: blur(4px);
`;

const CardShell = styled.div`
  padding: 14px;
  margin-bottom: 10px;
  cursor: grab;
  background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.02),
      rgba(255, 255, 255, 0)
    ),
    ${s("cardBackground")};
  border: 1px solid ${s("divider")};
  border-radius: 12px;
  box-shadow:
    0 12px 30px rgba(0, 0, 0, 0.08),
    0 1px 0 rgba(255, 255, 255, 0.04);
  transition: transform 120ms ease, box-shadow 120ms ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow:
      0 18px 36px rgba(0, 0, 0, 0.12),
      0 1px 0 rgba(255, 255, 255, 0.05);
  }
`;

const Count = styled.span`
  background: ${s("accent")};
  color: ${s("accentText")};
  border-radius: 10px;
  padding: 2px 10px;
  font-size: 12px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
`;

const AddCardRow = styled(Flex)`
  padding: 0 12px 12px;
  gap: 8px;
`;

const TagRow = styled.div`
  display: flex;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
`;

const Tag = styled.span<{ $color?: string | null }>`
  padding: 2px 10px;
  border-radius: 12px;
  background: ${(props) =>
    props.$color ? props.$color : s("backgroundSecondary")};
  color: ${s("text")};
  font-size: 12px;
  border: 1px solid ${s("divider")};
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
`;

const MetaLine = styled(Text)`
  margin-top: 6px;
  color: ${s("textSecondary")};
`;

const LoadingWrap = styled(Flex)`
  padding: 64px;
  align-items: center;
  justify-content: center;
`;

const BoardSurface = styled(Scrollable)`
  background: radial-gradient(
      circle at 20% 20%,
      rgba(255, 255, 255, 0.04),
      transparent 32%
    ),
    radial-gradient(
      circle at 80% 10%,
      rgba(255, 255, 255, 0.03),
      transparent 28%
    ),
    linear-gradient(
      135deg,
      ${s("background")} 0%,
      ${s("backgroundSecondary")} 100%
    );
`;
