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
import {
  EditIcon,
  TrashIcon,
  PlusIcon,
  SettingsIcon,
  MoreIcon,
} from "outline-icons";
import { runInAction } from "mobx";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import styled, { css } from "styled-components";
import { BoardTag } from "@shared/types";
import { Avatar, AvatarSize } from "~/components/Avatar";
import Button from "~/components/Button";
import Collaborators from "~/components/Collaborators";
import Flex from "~/components/Flex";
import Heading from "~/components/Heading";
import Input from "~/components/Input";
import LoadingIndicator from "~/components/LoadingIndicator";
import Modal from "~/components/Modal";
import NudeButton from "~/components/NudeButton";
import Scrollable from "~/components/Scrollable";
import ShareButton from "~/scenes/Document/components/ShareButton";
import Text from "~/components/Text";
import BoardCardModel from "~/models/BoardCard";
import BoardColumnModel from "~/models/BoardColumn";
import Document from "~/models/Document";
import User from "~/models/User";
import useStores from "~/hooks/useStores";
import useCurrentUser from "~/hooks/useCurrentUser";
import { s } from "@shared/styles";
import { v4 as uuidv4 } from "uuid";
import { format as formatDate } from "date-fns";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "~/components/primitives/Popover";

// Helper function to truncate text
const truncateText = (text: string, maxLength: number = 80) => {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength).trim() + "...";
};

type Props = {
  document: Document;
  abilities: Record<string, boolean>;
  readOnly: boolean;
  showDocumentLink?: boolean;
};

const TAG_COLORS = [
  "#3366FF",
  "#00B894",
  "#FFB020",
  "#E84A5F",
  "#7C4DFF",
  "#1BC8C8",
  "#FF6B6B",
  "#8D99AE",
];

type TagSelectorProps = {
  boardTags: BoardTag[];
  value: BoardTag[] | null | undefined;
  onChange: (tags: BoardTag[]) => void;
  onCreateTag: (tag: BoardTag) => void;
  onDeleteTag: (tagId: string) => void;
  disabled?: boolean;
};

const TagSelector = ({
  boardTags,
  value,
  onChange,
  onCreateTag,
  onDeleteTag,
  disabled,
}: TagSelectorProps) => {
  const [newTagName, setNewTagName] = useState("");
  const selectedIds = useMemo(
    () => new Set(value?.map((tag) => tag.id) ?? []),
    [value]
  );
  const availableTags = useMemo(() => {
    const map = new Map<string, BoardTag>();
    boardTags.forEach((tag) => map.set(tag.id, tag));
    (value ?? []).forEach((tag) => {
      if (!map.has(tag.id)) {
        map.set(tag.id, tag);
      }
    });
    return Array.from(map.values());
  }, [boardTags, value]);

  if (disabled) {
    const tagsToShow = availableTags;
    return (
      <TagSelectorWrapper>
        <TagList>
          {tagsToShow.length ? (
            tagsToShow.map((tag) => (
              <TagChip key={tag.id} $selected $color={tag.color} as="div">
                <span>{tag.name}</span>
                <Dot $color={tag.color} />
              </TagChip>
            ))
          ) : (
            <Text type="tertiary" size="small">
              尚未設定
            </Text>
          )}
        </TagList>
      </TagSelectorWrapper>
    );
  }

  const toggleTag = useCallback(
    (tag: BoardTag) => {
      const next = selectedIds.has(tag.id)
        ? (value ?? []).filter((t) => t.id !== tag.id)
        : [...(value ?? []), tag];
      onChange(next);
    },
    [onChange, selectedIds, value]
  );

  const handleCreate = useCallback(() => {
    const name = newTagName.trim();
    if (!name) {
      return;
    }
    const color = TAG_COLORS[boardTags.length % TAG_COLORS.length];
    const tag = { id: uuidv4(), name, color };
    onCreateTag(tag);
    const existing = value ?? [];
    const alreadySelected = existing.find((t) => t.id === tag.id);
    if (!alreadySelected) {
      onChange([...existing, tag]);
    }
    setNewTagName("");
  }, [boardTags.length, newTagName, onChange, onCreateTag, value]);

  return (
    <TagSelectorWrapper>
      <TagList>
        {availableTags.map((tag) => (
          <TagChip
            key={tag.id}
            $selected={selectedIds.has(tag.id)}
            $color={tag.color}
            onClick={() => toggleTag(tag)}
          >
            <span>{tag.name}</span>
            <ChipActions>
              <Dot $color={tag.color} />
              <TagRemove
                onClick={(ev) => {
                  ev.stopPropagation();
                  onDeleteTag(tag.id);
                }}
                aria-label="Delete tag"
              >
                ×
              </TagRemove>
            </ChipActions>
          </TagChip>
        ))}
      </TagList>
      <TagInputRow>
        <TagInput
          value={newTagName}
          placeholder="新增標籤"
          onChange={(ev) => setNewTagName(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              handleCreate();
            }
          }}
        />
        <Button neutral onClick={handleCreate} disabled={!newTagName.trim()}>
          新增
        </Button>
      </TagInputRow>
    </TagSelectorWrapper>
  );
};

type MultiUserSelectorProps = {
  value: string[] | null | undefined;
  onChange: (userIds: string[]) => void;
  users: User[];
  disabled?: boolean;
};

const MultiUserSelector = ({
  value,
  onChange,
  users,
  disabled,
}: MultiUserSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedIds = value ?? [];
  const selectedUsers = useMemo(
    () =>
      selectedIds
        .map((id) => users.find((u) => u.id === id))
        .filter(Boolean) as User[],
    [selectedIds, users]
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

  const toggleUser = useCallback(
    (userId: string) => {
      const next = selectedIds.includes(userId)
        ? selectedIds.filter((id) => id !== userId)
        : [...selectedIds, userId];
      onChange(next);
    },
    [onChange, selectedIds]
  );

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

  if (disabled) {
    return (
      <SelectedAssignees>
        {selectedUsers.length ? (
          selectedUsers.map((user) => (
            <AssigneeChip key={user.id}>
              <Avatar model={user} size={AvatarSize.Small} />
              <span>{user.name}</span>
            </AssigneeChip>
          ))
        ) : (
          <Text type="tertiary" size="small">
            尚未指派
          </Text>
        )}
      </SelectedAssignees>
    );
  }

  return (
    <UserSelectorWrapper ref={dropdownRef}>
      <SelectedAssignees>
        {selectedUsers.map((user) => (
          <AssigneeChip key={user.id} onClick={() => toggleUser(user.id)}>
            <Avatar model={user} size={AvatarSize.Small} />
            <span>{user.name}</span>
            <ChipClose>×</ChipClose>
          </AssigneeChip>
        ))}
        <AssigneeAdd onClick={() => setIsOpen((open) => !open)}>
          <PlusIcon size={14} />
          指派成員
        </AssigneeAdd>
      </SelectedAssignees>
      {isOpen && (
        <UserDropdown>
          <UserSearchInput
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            placeholder="搜尋成員…"
            autoFocus
          />
          <UserList>
            {filteredUsers.map((user) => (
              <UserOption
                key={user.id}
                onClick={() => toggleUser(user.id)}
                $selected={selectedIds.includes(user.id)}
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
  assignees: User[];
  dueLabel?: string | null;
};

const SortableCard = ({
  card,
  onSelect,
  assignees,
  isDragOverlay,
  dueLabel,
}: SortableCardProps) => {
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
        <CardTitle>
          {dueLabel && <DueBadge>{dueLabel}</DueBadge>}
          {card.title}
        </CardTitle>
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
      {assignees.length > 0 && (
        <CardFooter>
          <AssigneeRow>
            <AvatarStack>
              {assignees.slice(0, 3).map((assignee) => (
                <Avatar
                  key={assignee.id}
                  model={assignee}
                  size={AvatarSize.Small}
                />
              ))}
            </AvatarStack>
            <AssigneeNames title={assignees.map((a) => a.name).join(", ")}>
              {assignees
                .slice(0, 2)
                .map((a) => a.name)
                .join(", ")}
              {assignees.length > 2 ? ` +${assignees.length - 2}` : ""}
            </AssigneeNames>
          </AssigneeRow>
        </CardFooter>
      )}
    </CardShell>
  );
};

// Card preview for drag overlay
const CardPreview = ({
  card,
  assignees,
  dueLabel,
}: {
  card: BoardCardModel;
  assignees: User[];
  dueLabel?: string | null;
}) => (
  <CardShell $isDragOverlay>
    <CardContent>
      <CardTitle>
        {dueLabel && <DueBadge>{dueLabel}</DueBadge>}
        {card.title}
      </CardTitle>
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
    {assignees.length > 0 && (
      <CardFooter>
        <AssigneeRow>
          <AvatarStack>
            {assignees.slice(0, 3).map((assignee) => (
              <Avatar
                key={assignee.id}
                model={assignee}
                size={AvatarSize.Small}
              />
            ))}
          </AvatarStack>
          <AssigneeNames>
            {assignees
              .slice(0, 2)
              .map((a) => a.name)
              .join(", ")}
            {assignees.length > 2 ? ` +${assignees.length - 2}` : ""}
          </AssigneeNames>
        </AssigneeRow>
      </CardFooter>
    )}
  </CardShell>
);

function BoardView({
  document,
  abilities,
  readOnly,
  showDocumentLink = true,
}: Props) {
  const { boards, boardColumns, boardCards, users, presence } = useStores();
  const currentUser = useCurrentUser();
  const [boardId, setBoardId] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState<Record<string, string>>({});
  const [selectedCard, setSelectedCard] = useState<BoardCardModel | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnTitle, setEditingColumnTitle] = useState("");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [addingCardColumnId, setAddingCardColumnId] = useState<string | null>(
    null
  );
  const [deadlineInput, setDeadlineInput] = useState<string>("");
  const [sortMode, setSortMode] = useState<"manual" | "name" | "dueAsc" | "dueDesc">("manual");
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [filterMode, setFilterMode] = useState<"any" | "all">("any");
  const addCardInputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const activeCard = activeCardId ? boardCards.get(activeCardId) : null;
  const activeCardAssignees = activeCard
    ? ((activeCard.assigneeIds ?? [])
        .map((id) => users.get(id))
        .filter(Boolean) as User[])
    : [];

  // Fetch all users for the assignee selector
  useEffect(() => {
    void users.fetchPage({ limit: 100 });
  }, [users]);

  // Touch presence so collaborators facepile stays in sync when viewing Kanban
  useEffect(() => {
    if (!currentUser) {
      return;
    }
    presence.touch(document.id, currentUser.id, false);
    const interval = setInterval(
      () => presence.touch(document.id, currentUser.id, false),
      20000
    );
    return () => clearInterval(interval);
  }, [currentUser, document.id, presence]);

  useEffect(() => {
    setLoading(true);
    boards
      .fetchForDocument(document.id)
      .then((board) => {
        setBoardId(board.id);
        setDeadlineInput(
          board.deadline
            ? new Date(board.deadline).toISOString().slice(0, 16)
            : ""
        );
        setLoadError(null);
      })
      .catch((err: any) => {
        if (err?.status === 404) {
          setLoadError("此文件尚未啟用看板，請在指令列輸入 /kanban 開啟。");
        } else {
          setLoadError(err?.message ?? "Unable to load board");
        }
      })
      .finally(() => setLoading(false));
  }, [boards, document.id]);

  const board = boardId ? boards.get(boardId) : null;
  const deadline = board?.deadline ? new Date(board.deadline) : null;
  const [countdown, setCountdown] = useState<string>("-- 天 --:--:--");

  const columns = useMemo(
    () => (boardId ? boardColumns.inBoard(boardId) : []),
    [boardColumns, boardId]
  );
  const boardTags = board?.tags ?? [];

  useEffect(() => {
    if (board?.deadline) {
      setDeadlineInput(new Date(board.deadline).toISOString().slice(0, 16));
    } else {
      setDeadlineInput("");
    }
  }, [board?.deadline]);

  useEffect(() => {
    if (!deadline) {
      setCountdown("-- 天 --:--:--");
      return;
    }
    const tick = () => {
      const now = Date.now();
      const diffMs = new Date(deadline).getTime() - now;
      if (diffMs <= 0) {
        setCountdown("00 天 00:00:00");
        return;
      }
      const seconds = Math.floor(diffMs / 1000);
      const days = Math.floor(seconds / 86400);
      const hrs = Math.floor((seconds % 86400) / 3600)
        .toString()
        .padStart(2, "0");
      const mins = Math.floor((seconds % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const secs = Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0");
      setCountdown(`${days.toString().padStart(2, "0")} 天 ${hrs}:${mins}:${secs}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

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
    setShowColumnModal(false);
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
      assigneeIds: card.assigneeIds ?? [],
      metadata: card.metadata ?? undefined,
      dueOffsetDays: card.dueOffsetDays ?? null,
    });
    setSelectedCard(null);
  };

  const handleDeleteCard = async (card: BoardCardModel) => {
    await boardCards.delete(card);
    setSelectedCard(null);
  };

  const handleAssigneesChange = async (userIds: string[]) => {
    if (!selectedCard) {
      return;
    }
    runInAction(() => {
      selectedCard.assigneeIds = userIds;
    });
    await boardCards.updateCard({
      id: selectedCard.id,
      assigneeIds: userIds,
    });
  };

  const handleCardTagsChange = async (tags: BoardTag[]) => {
    if (!selectedCard) {
      return;
    }
    runInAction(() => {
      selectedCard.tags = tags;
    });
    await boardCards.updateCard({
      id: selectedCard.id,
      tags,
    });
  };

  const persistBoardTags = useCallback(
    async (tags: BoardTag[]) => {
      if (!boardId) {
        return;
      }
      await boards.updateTags(boardId, tags);
    },
    [boardId, boards]
  );

  const handleCreateBoardTag = useCallback(
    (tag: BoardTag) => {
      const next = [...boardTags, tag];
      if (board) {
        runInAction(() => {
          board.tags = next;
        });
      }
      void persistBoardTags(next);
    },
    [board, boardTags, persistBoardTags]
  );

  const handleDeleteBoardTag = useCallback(
    (tagId: string) => {
      const next = boardTags.filter((tag) => tag.id !== tagId);
      if (board) {
        runInAction(() => {
          board.tags = next;
        });
      }
      void persistBoardTags(next);
      setSelectedCard((prev) => {
        if (prev?.tags) {
          prev.tags = prev.tags.filter((tag) => tag.id !== tagId);
        }
        return prev;
      });
    },
    [board, boardTags, persistBoardTags]
  );

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

  const handleSaveDeadline = async () => {
    if (!board || readOnly) {
      return;
    }
    const iso = deadlineInput ? new Date(deadlineInput).toISOString() : null;
    await boards.updateBoard({ id: board.id, deadline: iso });
  };

  const formatDueLabel = (offset: number | null | undefined) => {
    if (!deadline || offset == null) {
      return null;
    }
    const dueDate = new Date(deadline.getTime() - offset * 86400000);
    return `D-${offset} (${formatDate(dueDate, "yyyy/MM/dd HH:mm")})`;
  };

  const getDueDateValue = (card: BoardCardModel) => {
    if (!deadline || card.dueOffsetDays == null) {
      return null;
    }
    return new Date(deadline.getTime() - card.dueOffsetDays * 86400000);
  };

  const filteredAndSortedCards = useCallback(
    (columnId: string) => {
      const base = boardCards.inColumn(columnId);
      const filtered = filterTagIds.length
        ? base.filter((card) => {
            const cardTagIds = (card.tags ?? []).map((t) => t.id);
            if (!cardTagIds.length) {
              return false;
            }
            return filterMode === "any"
              ? filterTagIds.some((id) => cardTagIds.includes(id))
              : filterTagIds.every((id) => cardTagIds.includes(id));
          })
        : base;

      const sorted = [...filtered].sort((a, b) => {
        if (sortMode === "name") {
          const name = a.title.localeCompare(b.title, undefined, {
            sensitivity: "base",
          });
          if (name !== 0) {
            return name;
          }
        } else if (sortMode === "dueAsc" || sortMode === "dueDesc") {
          const dueA = getDueDateValue(a)?.getTime() ?? Infinity;
          const dueB = getDueDateValue(b)?.getTime() ?? Infinity;
          if (dueA !== dueB) {
            return sortMode === "dueAsc" ? dueA - dueB : dueB - dueA;
          }
        }
        return a.index.localeCompare(b.index);
      });
      return sorted;
    },
    [boardCards, filterMode, filterTagIds, getDueDateValue, sortMode, deadline]
  );

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
        <Flex column gap={4}>
          <Heading as="h2" size="small">
            {document.title}
          </Heading>
          <CountdownRow>
            <Text type="tertiary">專案截止：</Text>
            <CountdownPill>{countdown}</CountdownPill>
          </CountdownRow>
        </Flex>
        <HeaderActions gap={8} align="center">
          <Collaborators document={document} limit={4} />
          {abilities.share && (
            <ShareButton document={document} view="kanban" key="share-button" />
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button neutral icon={<MoreIcon />} aria-label="更多">
                更多
              </Button>
            </PopoverTrigger>
            <PopoverContent width={280} shrink>
              <Panel>
                <PanelHeader>
                  <Text weight="bold">截止時間</Text>
                  <Text type="tertiary" size="small">
                    影響倒數與 D-Day
                  </Text>
                </PanelHeader>
                <Input
                  type="datetime-local"
                  value={deadlineInput}
                  onChange={(e) => setDeadlineInput(e.target.value)}
                  onBlur={handleSaveDeadline}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSaveDeadline();
                    }
                  }}
                  disabled={readOnly}
                  style={{ width: "100%", fontSize: 12 }}
                />
              </Panel>
            </PopoverContent>
          </Popover>
          {showDocumentLink && (
            <Button
              neutral
              onClick={() => {
                const url = document.url.includes("?")
                  ? `${document.url}&view=document`
                  : `${document.url}?view=document`;
                window.location.href = url;
              }}
            >
              查看文件
            </Button>
          )}
        </HeaderActions>
      </Header>
      <ViewControls>
        <Popover>
          <PopoverTrigger asChild>
            <IconButton aria-label="視圖選項">
              <SettingsIcon size={16} />
              <span>視圖</span>
            </IconButton>
          </PopoverTrigger>
          <PopoverContent width={340} shrink style={{ padding: "10px 16px" }}>
            <Panel>
              <PanelHeader>
                <Text weight="bold">排序</Text>
                <Text type="tertiary" size="small">
                  應用於所有分類
                </Text>
              </PanelHeader>
              <SelectInput
                value={sortMode}
                onChange={(ev) => setSortMode(ev.target.value as typeof sortMode)}
              >
                <option value="manual">自由排序</option>
                <option value="name">名稱</option>
                <option value="dueAsc">倒數時間（近）</option>
                <option value="dueDesc">倒數時間（久）</option>
              </SelectInput>
            </Panel>
            <Panel>
              <PanelHeader>
                <Text weight="bold">Tag 過濾</Text>
                <Text type="tertiary" size="small">
                  {filterTagIds.length ? `${filterTagIds.length} 個已選` : "未啟用"}
                </Text>
              </PanelHeader>
              <TagFilterRow>
                <SelectInput
                  value={filterMode}
                  onChange={(ev) =>
                    setFilterMode(ev.target.value as typeof filterMode)
                  }
                >
                  <option value="any">符合任一</option>
                  <option value="all">符合全部</option>
                </SelectInput>
                <GhostLink
                  onClick={() => setFilterTagIds([])}
                  disabled={filterTagIds.length === 0}
                >
                  清除
                </GhostLink>
              </TagFilterRow>
              <TagList>
                {boardTags.map((tag) => {
                  const selected = filterTagIds.includes(tag.id);
                  return (
                    <TagChip
                      key={tag.id}
                      $selected={selected}
                      $color={tag.color}
                      onClick={() => {
                        setFilterTagIds((prev) =>
                          prev.includes(tag.id)
                            ? prev.filter((id) => id !== tag.id)
                            : [...prev, tag.id]
                        );
                      }}
                    >
                      <span>{tag.name}</span>
                      <Dot $color={tag.color} />
                    </TagChip>
                  );
                })}
                {boardTags.length === 0 && (
                  <Text type="tertiary" size="small">
                    尚未有標籤
                  </Text>
                )}
              </TagList>
            </Panel>
          </PopoverContent>
        </Popover>
        {(filterTagIds.length > 0 || sortMode !== "manual") && (
          <QuietHint>
            {sortMode !== "manual" && <span>排序：{sortMode}</span>}
            {filterTagIds.length > 0 && <span>Tag 過濾</span>}
          </QuietHint>
        )}
      </ViewControls>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleCardMove}
      >
        <Columns>
          {columns.map((column) => {
            const cards = filteredAndSortedCards(column.id);
            const isEditing = editingColumnId === column.id;
            const isAddingCard = addingCardColumnId === column.id;
            return (
              <Column key={column.id}>
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
                        <ColumnBadge>{cards.length}</ColumnBadge>
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
                    {cards.map((card) => {
                      const cardAssignees = (card.assigneeIds ?? [])
                        .map((id) => users.get(id))
                        .filter(Boolean) as User[];
                      const dueLabel = formatDueLabel(card.dueOffsetDays);
                      return (
                        <SortableCard
                          key={card.id}
                          card={card}
                          assignees={cardAssignees}
                          dueLabel={dueLabel}
                          onSelect={(c) => setSelectedCard(c)}
                        />
                      );
                    })}
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
                          placeholder="輸入卡片標題..."
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
                            新增
                          </Button>
                          <Button neutral onClick={handleCancelAddCard}>
                            取消
                          </Button>
                        </AddCardActions>
                      </AddCardForm>
                    ) : (
                      <AddCardButton
                        onClick={() => handleStartAddCard(column.id)}
                      >
                        <PlusIcon size={16} />
                        <span>新增卡片</span>
                      </AddCardButton>
                    )}
                  </AddCardArea>
                )}
              </Column>
            );
          })}
          {!readOnly && (
            <AddColumnCard onClick={() => setShowColumnModal(true)}>
              <PlusIcon size={18} />
              <span>新增分類</span>
            </AddColumnCard>
          )}
        </Columns>
        <DragOverlay
          dropAnimation={{
            duration: 200,
            easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
          }}
        >
          {activeCard && (
            <CardPreview
              card={activeCard}
              assignees={activeCardAssignees}
              dueLabel={formatDueLabel(activeCard.dueOffsetDays)}
            />
          )}
        </DragOverlay>
      </DndContext>

      <Modal
        isOpen={showColumnModal}
        title="新增分類"
        onRequestClose={() => setShowColumnModal(false)}
      >
        <Flex column gap={12}>
          <Input
            label="分類名稱"
            value={newColumnTitle}
            onChange={(ev) => setNewColumnTitle(ev.target.value)}
            autoFocus
          />
          <Flex gap={8} justify="flex-end">
            <Button neutral onClick={() => setShowColumnModal(false)}>
              取消
            </Button>
            <Button onClick={handleAddColumn} disabled={!newColumnTitle.trim()}>
              新增
            </Button>
          </Flex>
        </Flex>
      </Modal>

      <Modal
        isOpen={!!selectedCard}
        onRequestClose={() => setSelectedCard(null)}
      >
        {selectedCard && (
          <ModalContent>
            <ModalMain>
              <ModalTitleInput
                value={selectedCard.title}
                onChange={(ev) => {
                  if (readOnly) {
                    return;
                  }
                  selectedCard.title = ev.target.value;
                }}
                placeholder="卡片標題"
                readOnly={readOnly}
              />
              <ModalDescriptionArea
                value={selectedCard.description ?? ""}
                onChange={(ev) => {
                  if (readOnly) {
                    return;
                  }
                  selectedCard.description = ev.target.value;
                }}
                placeholder="加入描述..."
                rows={6}
                readOnly={readOnly}
              />
            </ModalMain>
            <ModalSidebar>
              <PropertySection>
                <PropertyLabel>Assignees</PropertyLabel>
                <MultiUserSelector
                  value={selectedCard.assigneeIds ?? []}
                  onChange={handleAssigneesChange}
                  users={users.orderedData}
                  disabled={readOnly}
                />
              </PropertySection>
              <PropertySection>
                <PropertyLabel>Tags</PropertyLabel>
                <TagSelector
                  boardTags={boardTags}
                  value={selectedCard.tags}
                  onChange={handleCardTagsChange}
                  onCreateTag={handleCreateBoardTag}
                  onDeleteTag={handleDeleteBoardTag}
                  disabled={readOnly}
                />
              </PropertySection>
              <PropertySection>
                <PropertyLabel>倒數天數 (D-N)</PropertyLabel>
                <Input
                  type="number"
                  min="0"
                  value={selectedCard.dueOffsetDays ?? ""}
                  placeholder="例如 50 代表 D-50"
                  onChange={(ev) => {
                    const val = ev.target.value;
                    const num = val === "" ? null : Math.max(0, Number(val));
                    runInAction(() => {
                      selectedCard.dueOffsetDays =
                        Number.isFinite(num as number) && num !== null ? num : null;
                    });
                  }}
                  onBlur={() => void handleSaveCard(selectedCard)}
                  readOnly={readOnly}
                />
                {formatDueLabel(selectedCard.dueOffsetDays) && deadline && (
                  <Text type="tertiary" size="small">
                    到期：{formatDueLabel(selectedCard.dueOffsetDays)}
                  </Text>
                )}
              </PropertySection>
            </ModalSidebar>
            {!readOnly && (
              <ModalFooter>
                <Button onClick={() => void handleSaveCard(selectedCard)}>
                  儲存變更
                </Button>
                <Button
                  onClick={() => void handleDeleteCard(selectedCard)}
                  danger
                >
                  刪除卡片
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

const Header = styled(Flex)`
  padding: 12px 20px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid ${s("divider")};
`;

const HeaderActions = styled(Flex)`
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

const CountdownRow = styled(Flex)`
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const ViewControls = styled(Flex)`
  padding: 8px 20px;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid ${s("divider")};
  flex-wrap: wrap;
`;

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 4px;

  &:not(:last-child) {
    border-bottom: 1px solid ${s("divider")};
  }
`;

const PanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
`;

const SelectInput = styled.select`
  height: 32px;
  padding: 4px 8px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 6px;
  background: ${s("menuBackground")};
  color: ${s("text")};
  font-size: 13px;

  &:focus {
    outline: none;
    border-color: ${s("accent")};
  }
`;

const TagFilterRow = styled(Flex)`
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const ClearFilter = styled.button`
  border: none;
  background: transparent;
  color: ${s("textTertiary")};
  cursor: pointer;
  font-size: 12px;

  &:hover {
    color: ${s("text")};
  }
`;

const QuietHint = styled.div`
  display: inline-flex;
  gap: 8px;
  align-items: center;
  color: ${s("textTertiary")};
  font-size: 12px;
`;

const Columns = styled.div`
  display: flex;
  gap: 16px;
  padding: 16px 20px 32px;
  overflow-x: auto;
`;

const Column = styled.div`
  background: ${s("menuBackground")};
  border-radius: 8px;
  min-height: 200px;
  width: 280px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
`;

const ColumnHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
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
  gap: 6px;
`;

const ColumnTitle = styled.span`
  font-weight: 500;
  font-size: 13px;
  color: ${s("textSecondary")};
`;

const ColumnBadge = styled.span`
  color: ${s("textTertiary")};
  font-size: 12px;
`;

const ColumnActions = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 100ms ease;

  ${ColumnHeader}:hover & {
    opacity: 1;
  }
`;

const ColumnActionButton = styled(NudeButton)<{ $danger?: boolean }>`
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: ${(props) => (props.$danger ? s("danger") : s("textTertiary"))};

  &:hover {
    color: ${(props) => (props.$danger ? s("danger") : s("text"))};
  }
`;

const ColumnTitleInput = styled.input`
  border: 1px solid ${s("inputBorder")};
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 13px;
  font-weight: 500;
  background: ${s("background")};
  color: ${s("text")};
  outline: none;
  width: 140px;

  &:focus {
    border-color: ${s("accent")};
  }
`;

const CardsArea = styled.div<{ $isOver?: boolean }>`
  padding: 0 8px 8px;
  min-height: 80px;
  flex: 1;
  border-radius: 4px;
  transition: background 100ms ease;
  background: ${(props) =>
    props.$isOver ? `${s("accent")}08` : "transparent"};
`;

const CardShell = styled.div<{
  $isDragging?: boolean;
  $isDragOverlay?: boolean;
}>`
  padding: 10px 12px;
  margin-bottom: 6px;
  cursor: grab;
  background: ${s("menuBackground")};
  border: 1px solid ${s("divider")};
  border-radius: 6px;
  transition: border-color 100ms ease;

  ${(props) =>
    props.$isDragging &&
    css`
      opacity: 0.5;
    `}

  ${(props) =>
    props.$isDragOverlay &&
    css`
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    `}

  &:hover {
    border-color: ${s("inputBorderFocused")};
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
  gap: 4px;
`;

const CardTitle = styled.span`
  font-size: 13px;
  color: ${s("text")};
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const CardDescription = styled.span`
  font-size: 12px;
  color: ${s("textTertiary")};
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
  padding: 1px 6px;
  border-radius: 3px;
  background: ${(props) => (props.$color ? `${props.$color}22` : s("divider"))};
  color: ${(props) => props.$color ?? s("textSecondary")};
  border: 1px solid
    ${(props) => (props.$color ? `${props.$color}55` : s("divider"))};
  font-size: 11px;
`;

const CardTagMore = styled.span`
  font-size: 11px;
  color: ${s("textTertiary")};
`;

const CardFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-top: 6px;
`;

const AddCardArea = styled.div`
  padding: 4px 8px 8px;
`;

const AddCardButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: ${s("textTertiary")};
  font-size: 12px;
  cursor: pointer;

  &:hover {
    color: ${s("textSecondary")};
  }
`;

const AddCardForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const AddCardInput = styled.input`
  width: 100%;
  padding: 8px 10px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 4px;
  background: ${s("menuBackground")};
  color: ${s("text")};
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: ${s("accent")};
  }

  &::placeholder {
    color: ${s("textTertiary")};
  }
`;

const AddCardActions = styled.div`
  display: flex;
  gap: 6px;
`;

const LoadingWrap = styled(Flex)`
  padding: 64px;
  align-items: center;
  justify-content: center;
`;

const AddColumnCard = styled.button`
  min-width: 220px;
  min-height: 120px;
  border: 2px dashed ${s("divider")};
  border-radius: 12px;
  background: transparent;
  color: ${s("textSecondary")};
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: var(--pointer);
  transition:
    border 120ms ease,
    transform 120ms ease,
    color 120ms ease;

  &:hover {
    border-color: ${s("accent")};
    color: ${s("text")};
    transform: translateY(-2px);
  }
`;

const BoardSurface = styled(Scrollable)`
  background: ${s("background")};
`;

// Modal styles
const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ModalMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ModalTitleInput = styled.input`
  width: 100%;
  padding: 4px 0;
  border: none;
  background: transparent;
  color: ${s("text")};
  font-size: 16px;
  font-weight: 500;
  outline: none;

  &::placeholder {
    color: ${s("textTertiary")};
  }
`;

const ModalDescriptionArea = styled.textarea`
  width: 100%;
  padding: 8px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 4px;
  background: transparent;
  color: ${s("text")};
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  min-height: 80px;

  &:focus {
    border-color: ${s("accent")};
  }

  &::placeholder {
    color: ${s("textTertiary")};
  }
`;

const ModalSidebar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid ${s("divider")};
`;

const PropertySection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const PropertyLabel = styled.label`
  font-size: 11px;
  font-weight: 500;
  color: ${s("textTertiary")};
  text-transform: uppercase;
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid ${s("divider")};
`;

// User selector styles
const UserSelectorWrapper = styled.div`
  position: relative;
`;

const UserDropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: ${s("menuBackground")};
  border: 1px solid ${s("inputBorder")};
  border-radius: 4px;
  box-shadow: ${s("menuShadow")};
  z-index: 100;
  max-height: 240px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const UserSearchInput = styled.input`
  padding: 8px 10px;
  border: none;
  border-bottom: 1px solid ${s("divider")};
  background: transparent;
  color: ${s("text")};
  font-size: 12px;
  outline: none;

  &::placeholder {
    color: ${s("textTertiary")};
  }
`;

const UserList = styled.div`
  overflow-y: auto;
  max-height: 200px;
`;

const UserOption = styled.div<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  background: ${(props) =>
    props.$selected ? s("menuItemSelected") : "transparent"};

  &:hover {
    background: ${s("listItemHoverBackground")};
  }
`;

const SelectedAssignees = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const AssigneeChip = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid ${s("divider")};
  background: ${s("menuBackground")};
  color: ${s("textSecondary")};
  cursor: pointer;
  font-size: 12px;

  &:hover {
    border-color: ${s("accent")};
    color: ${s("text")};
  }
`;

const ChipClose = styled.span`
  font-weight: 600;
  color: ${s("textTertiary")};
`;

const AssigneeAdd = styled(NudeButton)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px dashed ${s("divider")};
  color: ${s("textSecondary")};

  &:hover {
    border-color: ${s("accent")};
    color: ${s("text")};
  }
`;

const AssigneeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
`;

const AvatarStack = styled.div`
  display: flex;
  align-items: center;

  > * {
    position: relative;
    margin-left: -8px;
    border: 2px solid ${s("background")};
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
    z-index: 1;
  }

  > *:first-child {
    margin-left: 0;
    z-index: 2;
  }
`;

const AssigneeNames = styled.span`
  font-size: 11px;
  color: ${s("textSecondary")};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DueBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 6px;
  background: ${s("accent")}22;
  color: ${s("accent")};
  font-size: 11px;
  font-weight: 600;
`;

const TagSelectorWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TagList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const IconButton = styled(Button)`
  padding: 6px 10px;
  gap: 6px;
  font-size: 13px;
  min-width: 0;
  justify-content: center;
`;

const CountdownPill = styled.span`
  padding: 4px 10px;
  border-radius: 12px;
  background: ${s("menuBackground")};
  border: 1px solid ${s("divider")};
  font-weight: 600;
  color: ${s("textSecondary")};
`;

const GhostLink = styled.button<{ disabled?: boolean }>`
  border: none;
  background: transparent;
  color: ${(p) => (p.disabled ? s("textTertiary") : s("textSecondary"))};
  cursor: ${(p) => (p.disabled ? "default" : "pointer")};
  font-size: 12px;
  padding: 4px 6px;

  &:hover {
    color: ${(p) => (p.disabled ? s("textTertiary") : s("text"))};
  }
`;

const TagChip = styled.button<{ $selected?: boolean; $color?: string | null }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid ${(props) => (props.$selected ? s("accent") : s("divider"))};
  background: ${(props) =>
    props.$selected
      ? `${props.$color ?? s("accent")}1a`
      : props.$color
        ? `${props.$color}12`
        : s("menuBackground")};
  color: ${(props) => props.$color ?? s("textSecondary")};
  cursor: pointer;
  font-size: 12px;
  transition:
    border 120ms ease,
    transform 120ms ease;

  &:hover {
    border-color: ${s("accent")};
    transform: translateY(-1px);
  }
`;

const ChipActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const Dot = styled.span<{ $color?: string | null }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(props) => props.$color ?? s("textTertiary")};
  display: inline-block;
`;

const TagRemove = styled.button`
  border: none;
  background: transparent;
  color: ${s("textTertiary")};
  cursor: pointer;
  font-size: 12px;
  padding: 0;
`;

const TagInputRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const TagInput = styled.input`
  flex: 1;
  padding: 8px 10px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 6px;
  background: transparent;
  color: ${s("text")};
  font-size: 13px;

  &:focus {
    outline: none;
    border-color: ${s("accent")};
  }

  &::placeholder {
    color: ${s("textTertiary")};
  }
`;
