import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useDroppable,
} from "@dnd-kit/core";
import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { observer } from "mobx-react";
import { EditIcon, TrashIcon, PlusIcon } from "outline-icons";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import styled, { css, keyframes } from "styled-components";
import { BoardTag } from "@shared/types";
import { Avatar, AvatarSize } from "~/components/Avatar";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import Heading from "~/components/Heading";
import Input from "~/components/Input";
import LoadingIndicator from "~/components/LoadingIndicator";
import Modal from "~/components/Modal";
import NudeButton from "~/components/NudeButton";
import Scrollable from "~/components/Scrollable";
import Text from "~/components/Text";
import BoardCardModel from "~/models/BoardCard";
import BoardColumnModel from "~/models/BoardColumn";
import Document from "~/models/Document";
import User from "~/models/User";
import useStores from "~/hooks/useStores";
import { s } from "@shared/styles";

// Helper function to truncate text
const truncateText = (text: string, maxLength: number = 80) => {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength).trim() + "...";
};

// Default column colors for visual variety
const DEFAULT_COLUMN_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
];

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

// User selector component with search
type UserSelectorProps = {
  value: string | null | undefined;
  onChange: (userId: string | null, user: User | null) => void;
  users: User[];
};

const UserSelector = ({ value, onChange, users }: UserSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedUser = useMemo(
    () => (value ? users.find((u) => u.id === value) : null),
    [value, users]
  );

  const filteredUsers = useMemo(() => {
    if (!search.trim()) {
      return users;
    }
    const searchLower = search.toLowerCase();
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower)
    );
  }, [users, search]);

  const handleSelect = useCallback(
    (user: User | null) => {
      onChange(user?.id ?? null, user);
      setIsOpen(false);
      setSearch("");
    },
    [onChange]
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <UserSelectorWrapper ref={dropdownRef}>
      <UserSelectorTrigger onClick={() => setIsOpen(!isOpen)}>
        {selectedUser ? (
          <Flex align="center" gap={8}>
            <Avatar model={selectedUser} size={AvatarSize.Medium} />
            <span>{selectedUser.name}</span>
          </Flex>
        ) : (
          <Text type="tertiary" size="small">
            Select assignee...
          </Text>
        )}
      </UserSelectorTrigger>
      {isOpen && (
        <UserDropdown>
          <UserSearchInput
            ref={inputRef}
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            placeholder="Search users..."
            autoFocus
          />
          <UserList>
            <UserOption onClick={() => handleSelect(null)}>
              <Text type="tertiary" size="small">
                No assignee
              </Text>
            </UserOption>
            {filteredUsers.map((user) => (
              <UserOption
                key={user.id}
                onClick={() => handleSelect(user)}
                $selected={user.id === value}
              >
                <Avatar model={user} size={AvatarSize.Medium} />
                <Flex column style={{ minWidth: 0 }}>
                  <Text weight="bold" size="small" ellipsis>
                    {user.name}
                  </Text>
                  {user.email && (
                    <Text type="tertiary" size="xsmall" ellipsis>
                      {user.email}
                    </Text>
                  )}
                </Flex>
              </UserOption>
            ))}
            {filteredUsers.length === 0 && (
              <UserOption>
                <Text type="tertiary" size="small">
                  No users found
                </Text>
              </UserOption>
            )}
          </UserList>
        </UserDropdown>
      )}
    </UserSelectorWrapper>
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
  isDragOverlay?: boolean;
};

const SortableCard = ({ card, onSelect, isDragOverlay }: SortableCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: "card", columnId: card.columnId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <CardShell
      ref={setNodeRef}
      style={style}
      $isDragging={isDragging}
      $isDragOverlay={isDragOverlay}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onSelect(card)}
    >
      <CardContent>
        <CardTitle>{card.title}</CardTitle>
        {card.description && (
          <CardDescription>
            {truncateText(card.description, 100)}
          </CardDescription>
        )}
        {card.tags?.length ? (
          <CardTagRow>
            {card.tags.slice(0, 3).map((tag) => (
              <CardTag key={tag.id} $color={tag.color}>
                {tag.name}
              </CardTag>
            ))}
            {card.tags.length > 3 && (
              <CardTagMore>+{card.tags.length - 3}</CardTagMore>
            )}
          </CardTagRow>
        ) : null}
      </CardContent>
      {card.assignee && (
        <CardFooter>
          <Avatar model={card.assignee} size={AvatarSize.Medium} />
        </CardFooter>
      )}
    </CardShell>
  );
};

// Card preview for drag overlay
const CardPreview = ({ card }: { card: BoardCardModel }) => (
  <CardShell $isDragOverlay>
    <CardContent>
      <CardTitle>{card.title}</CardTitle>
      {card.description && (
        <CardDescription>{truncateText(card.description, 100)}</CardDescription>
      )}
      {card.tags?.length ? (
        <CardTagRow>
          {card.tags.slice(0, 3).map((tag) => (
            <CardTag key={tag.id} $color={tag.color}>
              {tag.name}
            </CardTag>
          ))}
        </CardTagRow>
      ) : null}
    </CardContent>
    {card.assignee && (
      <CardFooter>
        <Avatar model={card.assignee} size={AvatarSize.Medium} />
      </CardFooter>
    )}
  </CardShell>
);

function BoardView({ document, abilities, readOnly }: Props) {
  const { boards, boardColumns, boardCards, users } = useStores();
  const [boardId, setBoardId] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [newCardTitle, setNewCardTitle] = useState<Record<string, string>>({});
  const [selectedCard, setSelectedCard] = useState<BoardCardModel | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnTitle, setEditingColumnTitle] = useState("");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [addingCardColumnId, setAddingCardColumnId] = useState<string | null>(
    null
  );
  const addCardInputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const activeCard = activeCardId ? boardCards.get(activeCardId) : null;

  // Fetch all users for the assignee selector
  useEffect(() => {
    void users.fetchPage({ limit: 100 });
  }, [users]);

  useEffect(() => {
    setLoading(true);
    boards
      .fetchForDocument(document.id)
      .then((board) => {
        setBoardId(board.id);
        setLoadError(null);
      })
      .catch((err) => {
        setLoadError(err?.message ?? "Unable to load board");
      })
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
      boardId: boardId ?? undefined,
    });
    setNewCardTitle((prev) => ({ ...prev, [column.id]: "" }));
    setAddingCardColumnId(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleCardMove = async (event: DragEndEvent) => {
    setActiveCardId(null);
    if (readOnly) {
      return;
    }
    const { active, over } = event;
    if (!over) {
      return;
    }
    const draggedCard = boardCards.get(active.id as string);
    if (!draggedCard) {
      return;
    }

    const overId = over.id.toString();
    const overCard = overId.startsWith("column-")
      ? null
      : boardCards.get(overId);
    const targetColumnId =
      overCard?.columnId ??
      over.data?.current?.columnId ??
      (overId.startsWith("column-") ? overId.replace("column-", "") : null);

    if (!targetColumnId) {
      return;
    }

    const targetCards = boardCards
      .inColumn(targetColumnId)
      .filter((card) => card.id !== draggedCard.id);
    const insertionIndex = overCard
      ? targetCards.findIndex((c) => c.id === overCard.id)
      : targetCards.length;

    const beforeId =
      insertionIndex > 0 ? targetCards[insertionIndex - 1]?.id : undefined;
    const afterId = targetCards[insertionIndex]?.id;

    await boardCards.move({
      id: draggedCard.id,
      columnId: targetColumnId,
      beforeId,
      afterId,
    });
  };

  const handleSaveCard = async (card: BoardCardModel) => {
    await boardCards.updateCard({
      id: card.id,
      title: card.title,
      description: card.description ?? "",
      tags: card.tags ?? [],
      assigneeId: card.assigneeId ?? undefined,
      metadata: card.metadata ?? undefined,
    });
  };

  const handleDeleteCard = async (card: BoardCardModel) => {
    await boardCards.delete(card);
    setSelectedCard(null);
  };

  const handleSelectAssignee = (userId: string | null, user: User | null) => {
    setSelectedCard((prev) =>
      prev
        ? Object.assign(
          prev,
          { assigneeId: userId, assignee: user } // mutate observable
        )
        : null
    );
  };

  const handleEditColumn = (column: BoardColumnModel) => {
    setEditingColumnId(column.id);
    setEditingColumnTitle(column.title);
  };

  const handleSaveColumnTitle = async () => {
    if (!editingColumnId || !editingColumnTitle.trim()) {
      setEditingColumnId(null);
      return;
    }
    await boardColumns.update({
      id: editingColumnId,
      title: editingColumnTitle.trim(),
    });
    setEditingColumnId(null);
    setEditingColumnTitle("");
  };

  const handleDeleteColumn = async (column: BoardColumnModel) => {
    // Don't allow deleting the last column
    if (columns.length <= 1) {
      return;
    }

    // Find the first column (that's not the one being deleted) to move cards to
    const targetColumn = columns.find((c) => c.id !== column.id);
    if (!targetColumn) {
      return;
    }

    // Move all cards from this column to the first column
    const cardsInColumn = boardCards.inColumn(column.id);
    for (const card of cardsInColumn) {
      await boardCards.move({
        id: card.id,
        columnId: targetColumn.id,
      });
    }

    // Delete the column
    await boardColumns.delete(column);
  };

  const handleStartAddCard = (columnId: string) => {
    setAddingCardColumnId(columnId);
    // Focus input after render
    setTimeout(() => {
      addCardInputRef.current?.focus();
    }, 0);
  };

  const handleCancelAddCard = () => {
    setAddingCardColumnId(null);
    setNewCardTitle((prev) => {
      if (addingCardColumnId) {
        return { ...prev, [addingCardColumnId]: "" };
      }
      return prev;
    });
  };

  const handleAddCardKeyDown = (
    e: React.KeyboardEvent,
    column: BoardColumnModel
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleAddCard(column);
    } else if (e.key === "Escape") {
      handleCancelAddCard();
    }
  };

  if (isLoading || !boardId) {
    return (
      <LoadingWrap>
        {loadError ? (
          <Flex column gap={12} align="center">
            <Text type="danger">{loadError}</Text>
            <Button onClick={() => (window.location.href = document.url)}>
              返回文件
            </Button>
          </Flex>
        ) : (
          <LoadingIndicator />
        )}
      </LoadingWrap>
    );
  }

  return (
    <BoardSurface flex hiddenScrollbars>
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
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleCardMove}
      >
        <Columns>
          {columns.map((column, columnIndex) => {
            const cards = boardCards.inColumn(column.id);
            const isEditing = editingColumnId === column.id;
            const isAddingCard = addingCardColumnId === column.id;
            const columnColor =
              column.color || DEFAULT_COLUMN_COLORS[columnIndex % DEFAULT_COLUMN_COLORS.length];
            return (
              <Column key={column.id}>
                <ColumnColorBar $color={columnColor} />
                <ColumnHeader>
                  <ColumnHeaderLeft>
                    {isEditing ? (
                      <ColumnTitleInput
                        value={editingColumnTitle}
                        onChange={(ev) =>
                          setEditingColumnTitle(ev.target.value)
                        }
                        onBlur={handleSaveColumnTitle}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") {
                            handleSaveColumnTitle();
                          } else if (ev.key === "Escape") {
                            setEditingColumnId(null);
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <ColumnTitleRow>
                        <ColumnTitle>{column.title}</ColumnTitle>
                        <ColumnBadge $color={columnColor}>
                          {cards.length}
                        </ColumnBadge>
                      </ColumnTitleRow>
                    )}
                  </ColumnHeaderLeft>
                  {!readOnly && !isEditing && (
                    <ColumnActions>
                      <ColumnActionButton
                        onClick={() => handleEditColumn(column)}
                        title="Edit column"
                      >
                        <EditIcon size={16} />
                      </ColumnActionButton>
                      {columns.length > 1 && (
                        <ColumnActionButton
                          onClick={() => {
                            if (
                              window.confirm(
                                `確定要刪除「${column.title}」嗎？該分類中的卡片將移轉到第一個分類。`
                              )
                            ) {
                              void handleDeleteColumn(column);
                            }
                          }}
                          title="Delete column"
                          $danger
                        >
                          <TrashIcon size={16} />
                        </ColumnActionButton>
                      )}
                    </ColumnActions>
                  )}
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
                  <AddCardArea>
                    {isAddingCard ? (
                      <AddCardForm>
                        <AddCardInput
                          ref={
                            addingCardColumnId === column.id
                              ? addCardInputRef
                              : null
                          }
                          placeholder="Enter task title..."
                          value={newCardTitle[column.id] ?? ""}
                          onChange={(ev) =>
                            setNewCardTitle((prev) => ({
                              ...prev,
                              [column.id]: ev.target.value,
                            }))
                          }
                          onKeyDown={(e) => handleAddCardKeyDown(e, column)}
                          autoFocus
                        />
                        <AddCardActions>
                          <Button
                            onClick={() => void handleAddCard(column)}
                            disabled={!newCardTitle[column.id]?.trim()}
                          >
                            Add
                          </Button>
                          <Button neutral onClick={handleCancelAddCard}>
                            Cancel
                          </Button>
                        </AddCardActions>
                      </AddCardForm>
                    ) : (
                      <AddCardButton
                        onClick={() => handleStartAddCard(column.id)}
                      >
                        <PlusIcon size={16} />
                        <span>Add card</span>
                      </AddCardButton>
                    )}
                  </AddCardArea>
                )}
              </Column>
            );
          })}
        </Columns>
        <DragOverlay dropAnimation={{
          duration: 200,
          easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
        }}>
          {activeCard && <CardPreview card={activeCard} />}
        </DragOverlay>
      </DndContext>

      <Modal
        isOpen={!!selectedCard}
        onRequestClose={() => setSelectedCard(null)}
      >
        {selectedCard && (
          <ModalContent>
            <ModalMain>
              <ModalTitleInput
                value={selectedCard.title}
                onChange={(ev) => (selectedCard.title = ev.target.value)}
                placeholder="Card title"
              />
              <ModalDescriptionArea
                value={selectedCard.description ?? ""}
                onChange={(ev) => (selectedCard.description = ev.target.value)}
                placeholder="Add a description..."
                rows={6}
              />
            </ModalMain>
            <ModalSidebar>
              <PropertySection>
                <PropertyLabel>Assignee</PropertyLabel>
                <UserSelector
                  value={selectedCard.assigneeId}
                  onChange={handleSelectAssignee}
                  users={users.orderedData}
                />
              </PropertySection>
              <PropertySection>
                <PropertyLabel>Tags</PropertyLabel>
                <TagEditor
                  value={selectedCard.tags}
                  onChange={(tags) => (selectedCard.tags = tags)}
                />
              </PropertySection>
            </ModalSidebar>
            {!readOnly && (
              <ModalFooter>
                <Button onClick={() => void handleSaveCard(selectedCard)}>
                  Save changes
                </Button>
                <Button
                  onClick={() => void handleDeleteCard(selectedCard)}
                  danger
                >
                  Delete card
                </Button>
              </ModalFooter>
            )}
          </ModalContent>
        )}
      </Modal>
    </BoardSurface>
  );
}

export default observer(BoardView);

// Animations
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
`;

const scaleIn = keyframes`
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
`;

const Header = styled(Flex)`
  padding: 16px 24px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid ${s("divider")};
`;

const Columns = styled.div`
  display: flex;
  gap: 20px;
  padding: 24px 28px 44px;
  overflow-x: auto;
`;

const Column = styled.div`
  background: ${s("background")};
  border: 1px solid ${s("divider")};
  border-radius: 12px;
  min-height: 240px;
  width: 300px;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  animation: ${scaleIn} 200ms ease;
`;

const ColumnColorBar = styled.div<{ $color: string }>`
  height: 3px;
  background: ${(props) => props.$color};
  flex-shrink: 0;
`;

const ColumnHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid ${s("divider")};
  background: ${s("backgroundSecondary")};
`;

const ColumnHeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
`;

const ColumnTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ColumnTitle = styled.span`
  font-weight: 600;
  font-size: 14px;
  color: ${s("text")};
`;

const ColumnBadge = styled.span<{ $color: string }>`
  background: ${(props) => props.$color}20;
  color: ${(props) => props.$color};
  border-radius: 10px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
`;

const ColumnActions = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 150ms ease;

  ${ColumnHeader}:hover & {
    opacity: 1;
  }
`;

const ColumnActionButton = styled(NudeButton) <{ $danger?: boolean }>`
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: ${(props) => (props.$danger ? s("danger") : s("textSecondary"))};

  &:hover {
    color: ${(props) => (props.$danger ? s("danger") : s("text"))};
    background: ${s("backgroundSecondary")};
  }
`;

const ColumnTitleInput = styled.input`
  border: 1px solid ${s("accent")};
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 14px;
  font-weight: 600;
  background: ${s("background")};
  color: ${s("text")};
  outline: none;
  width: 150px;

  &:focus {
    box-shadow: 0 0 0 2px ${s("accent")}30;
  }
`;

const CardsArea = styled.div<{ $isOver?: boolean }>`
  padding: 8px;
  min-height: 100px;
  flex: 1;
  border: 2px dashed ${(props) => (props.$isOver ? s("accent") : "transparent")};
  border-radius: 8px;
  margin: 8px;
  transition: all 150ms ease;
  background: ${(props) =>
    props.$isOver ? `${s("accent")}10` : "transparent"};
`;

const CardShell = styled.div<{ $isDragging?: boolean; $isDragOverlay?: boolean }>`
  padding: 12px;
  margin-bottom: 8px;
  cursor: grab;
  background: ${s("background")};
  border: 1px solid ${s("divider")};
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: all 150ms ease;
  display: flex;
  flex-direction: column;
  gap: 8px;

  ${(props) =>
    props.$isDragging &&
    css`
      opacity: 0.4;
      border: 1px dashed ${s("accent")};
      background: ${s("backgroundSecondary")};
    `}

  ${(props) =>
    props.$isDragOverlay &&
    css`
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      transform: rotate(2deg);
      cursor: grabbing;
    `}

  &:hover {
    border-color: ${s("accent")}50;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  &:active {
    cursor: grabbing;
  }

  &:last-child {
    margin-bottom: 0;
  }
`;

const CardContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const CardTitle = styled.span`
  font-weight: 500;
  font-size: 14px;
  color: ${s("text")};
  line-height: 1.4;
`;

const CardDescription = styled.span`
  font-size: 13px;
  color: ${s("textSecondary")};
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const CardTagRow = styled.div`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
`;

const CardTag = styled.span<{ $color?: string | null }>`
  padding: 2px 8px;
  border-radius: 4px;
  background: ${(props) => (props.$color ? `${props.$color}20` : s("backgroundSecondary"))};
  color: ${(props) => (props.$color ? props.$color : s("textSecondary"))};
  font-size: 11px;
  font-weight: 500;
`;

const CardTagMore = styled.span`
  padding: 2px 6px;
  font-size: 11px;
  color: ${s("textSecondary")};
`;

const CardFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding-top: 4px;
  border-top: 1px solid ${s("divider")};
`;

const AddCardArea = styled.div`
  padding: 8px 12px 12px;
`;

const AddCardButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${s("textSecondary")};
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms ease;

  &:hover {
    background: ${s("backgroundSecondary")};
    color: ${s("text")};
  }
`;

const AddCardForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: ${fadeIn} 150ms ease;
`;

const AddCardInput = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 6px;
  background: ${s("background")};
  color: ${s("text")};
  font-size: 14px;
  outline: none;

  &:focus {
    border-color: ${s("accent")};
    box-shadow: 0 0 0 2px ${s("accent")}20;
  }

  &::placeholder {
    color: ${s("textTertiary")};
  }
`;

const AddCardActions = styled.div`
  display: flex;
  gap: 8px;
`;

const LoadingWrap = styled(Flex)`
  padding: 64px;
  align-items: center;
  justify-content: center;
`;

const BoardSurface = styled(Scrollable)`
  background: ${s("backgroundSecondary")};
`;

// Modal styles
const ModalContent = styled.div`
  display: grid;
  grid-template-columns: 1fr 240px;
  grid-template-rows: 1fr auto;
  gap: 24px;
  min-height: 300px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const ModalMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ModalTitleInput = styled.input`
  width: 100%;
  padding: 8px 0;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: ${s("text")};
  font-size: 20px;
  font-weight: 600;
  outline: none;
  transition: border-color 150ms ease;

  &:focus {
    border-bottom-color: ${s("accent")};
  }

  &::placeholder {
    color: ${s("textTertiary")};
  }
`;

const ModalDescriptionArea = styled.textarea`
  width: 100%;
  padding: 12px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 8px;
  background: ${s("backgroundSecondary")};
  color: ${s("text")};
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  min-height: 120px;

  &:focus {
    border-color: ${s("accent")};
    box-shadow: 0 0 0 2px ${s("accent")}20;
  }

  &::placeholder {
    color: ${s("textTertiary")};
  }
`;

const ModalSidebar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-left: 24px;
  border-left: 1px solid ${s("divider")};

  @media (max-width: 640px) {
    padding-left: 0;
    border-left: none;
    border-top: 1px solid ${s("divider")};
    padding-top: 20px;
  }
`;

const PropertySection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const PropertyLabel = styled.label`
  font-size: 12px;
  font-weight: 600;
  color: ${s("textSecondary")};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const ModalFooter = styled.div`
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  border-top: 1px solid ${s("divider")};
`;

// User selector styles
const UserSelectorWrapper = styled.div`
  position: relative;
`;

const UserSelectorTrigger = styled.button`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 6px;
  background: ${s("background")};
  color: ${s("text")};
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  transition: all 150ms ease;

  &:hover {
    border-color: ${s("accent")}50;
  }
`;

const UserDropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: ${s("menuBackground")};
  border: 1px solid ${s("inputBorder")};
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 100;
  max-height: 280px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: ${fadeIn} 150ms ease;
`;

const UserSearchInput = styled.input`
  padding: 10px 12px;
  border: none;
  border-bottom: 1px solid ${s("divider")};
  background: transparent;
  color: ${s("text")};
  font-size: 13px;
  outline: none;

  &::placeholder {
    color: ${s("textTertiary")};
  }
`;

const UserList = styled.div`
  overflow-y: auto;
  max-height: 220px;
`;

const UserOption = styled.div<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 100ms ease;
  background: ${(props) => (props.$selected ? `${s("accent")}15` : "transparent")};

  &:hover {
    background: ${(props) =>
    props.$selected ? `${s("accent")}20` : s("backgroundSecondary")};
  }
`;
