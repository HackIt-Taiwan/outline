import { DndContext, DragEndEvent, useDroppable } from "@dnd-kit/core";
import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { observer } from "mobx-react";
import { EditIcon, TrashIcon } from "outline-icons";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import styled from "styled-components";
import { BoardTag } from "@shared/types";
import { Avatar } from "~/components/Avatar";
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
      <UserSelectorLabel>Assignee</UserSelectorLabel>
      <UserSelectorTrigger onClick={() => setIsOpen(!isOpen)}>
        {selectedUser ? (
          <Flex align="center" gap={8}>
            <Avatar model={selectedUser} size={24} />
            <span>{selectedUser.name}</span>
          </Flex>
        ) : (
          <Text type="secondary">Select assignee...</Text>
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
              <Text type="secondary">No assignee</Text>
            </UserOption>
            {filteredUsers.map((user) => (
              <UserOption
                key={user.id}
                onClick={() => handleSelect(user)}
                $selected={user.id === value}
              >
                <Avatar model={user} size={24} />
                <Flex column style={{ minWidth: 0 }}>
                  <Text weight="bold" ellipsis>
                    {user.name}
                  </Text>
                  {user.email && (
                    <Text type="tertiary" size="small" ellipsis>
                      {user.email}
                    </Text>
                  )}
                </Flex>
              </UserOption>
            ))}
            {filteredUsers.length === 0 && (
              <UserOption>
                <Text type="secondary">No users found</Text>
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [newCardTitle, setNewCardTitle] = useState<Record<string, string>>({});
  const [selectedCard, setSelectedCard] = useState<BoardCardModel | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnTitle, setEditingColumnTitle] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

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
    await boardCards.updateCard({
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
            const isEditing = editingColumnId === column.id;
            return (
              <Column key={column.id}>
                <ColumnHeader>
                  {isEditing ? (
                    <ColumnTitleInput
                      value={editingColumnTitle}
                      onChange={(ev) => setEditingColumnTitle(ev.target.value)}
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
                      <Text weight="bold">{column.title}</Text>
                      {!readOnly && (
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
                                  handleDeleteColumn(column);
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
                    </ColumnTitleRow>
                  )}
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
            <UserSelector
              value={selectedCard.assigneeId}
              onChange={handleSelectAssignee}
              users={users.orderedData}
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
    </BoardSurface>
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

const ColumnTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
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
  width: 24px;
  height: 24px;
  color: ${(props) => (props.$danger ? s("danger") : s("textSecondary"))};

  &:hover {
    color: ${(props) => (props.$danger ? s("danger") : s("text"))};
    background: ${s("secondaryBackground")};
  }
`;

const ColumnTitleInput = styled.input`
  border: 1px solid ${s("inputBorder")};
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 14px;
  font-weight: 600;
  background: ${s("background")};
  color: ${s("text")};
  outline: none;
  width: 150px;

  &:focus {
    border-color: ${s("accent")};
  }
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

// User selector styles
const UserSelectorWrapper = styled.div`
  position: relative;
`;

const UserSelectorLabel = styled.label`
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: ${s("text")};
  margin-bottom: 4px;
`;

const UserSelectorTrigger = styled.button`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 4px;
  background: ${s("background")};
  color: ${s("text")};
  cursor: pointer;
  text-align: left;
  font-size: 14px;

  &:hover {
    border-color: ${s("inputBorderFocused")};
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
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  z-index: 100;
  max-height: 300px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const UserSearchInput = styled.input`
  padding: 12px;
  border: none;
  border-bottom: 1px solid ${s("divider")};
  background: transparent;
  color: ${s("text")};
  font-size: 14px;
  outline: none;

  &::placeholder {
    color: ${s("textSecondary")};
  }
`;

const UserList = styled.div`
  overflow-y: auto;
  max-height: 250px;
`;

const UserOption = styled.div<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  cursor: pointer;
  background: ${(props) =>
    props.$selected ? s("accent") : "transparent"};
  color: ${(props) => (props.$selected ? s("accentText") : s("text"))};

  &:hover {
    background: ${(props) =>
    props.$selected ? s("accent") : s("secondaryBackground")};
  }
`;
