import { DoneIcon, SmileyIcon, TrashIcon } from "outline-icons";
import { runInAction } from "mobx";
import { toast } from "sonner";
import Comment from "~/models/Comment";
import CommentDeleteDialog from "~/components/CommentDeleteDialog";
import ViewReactionsDialog from "~/components/Reactions/ViewReactionsDialog";
import { createActionV2 } from "..";
import { ActiveDocumentSection } from "../sections";

export const deleteCommentFactory = ({
  comment,
  onDelete,
}: {
  comment: Comment;
  onDelete: () => void;
}) =>
  createActionV2({
    name: ({ t }) => `${t("Delete")}…`,
    analyticsName: "Delete comment",
    section: ActiveDocumentSection,
    icon: <TrashIcon />,
    keywords: "trash",
    dangerous: true,
    visible: ({ stores }) => stores.policies.abilities(comment.id).delete,
    perform: ({ t, stores, event }) => {
      event?.preventDefault();
      event?.stopPropagation();

      stores.dialogs.openModal({
        title: t("Delete comment"),
        content: <CommentDeleteDialog comment={comment} onSubmit={onDelete} />,
      });
    },
  });

export const resolveCommentFactory = ({
  comment,
  onResolve,
  onRevert,
}: {
  comment: Comment;
  onResolve: () => void;
  onRevert?: () => void;
}) =>
  createActionV2({
    name: ({ t }) => t("Mark as resolved"),
    analyticsName: "Resolve thread",
    section: ActiveDocumentSection,
    icon: <DoneIcon outline />,
    visible: ({ stores }) =>
      stores.policies.abilities(comment.id).resolve &&
      stores.policies.abilities(comment.documentId).update,
    perform: async ({ t, stores, currentUserId }) => {
      const previousResolvedAt = comment.resolvedAt;
      const previousResolvedById = comment.resolvedById ?? null;
      const previousResolvedBy = comment.resolvedBy ?? null;
      const optimisticResolvedAt = new Date().toISOString();

      runInAction(() => {
        comment.resolvedAt = optimisticResolvedAt;
        if (currentUserId) {
          comment.resolvedById = currentUserId;
          const resolvedBy = stores.users.get(currentUserId);
          if (resolvedBy) {
            comment.resolvedBy = resolvedBy;
          }
        }
      });
      onResolve();

      try {
        await comment.resolve();
        toast.success(t("Thread resolved"));
      } catch (error) {
        runInAction(() => {
          if (comment.resolvedAt === optimisticResolvedAt) {
            comment.resolvedAt = previousResolvedAt;
            comment.resolvedById = previousResolvedById;
            comment.resolvedBy = previousResolvedBy;
          }
        });
        onRevert?.();
        throw error;
      }
    },
  });

export const unresolveCommentFactory = ({
  comment,
  onUnresolve,
  onRevert,
}: {
  comment: Comment;
  onUnresolve: () => void;
  onRevert?: () => void;
}) =>
  createActionV2({
    name: ({ t }) => t("Mark as unresolved"),
    analyticsName: "Unresolve thread",
    section: ActiveDocumentSection,
    icon: <DoneIcon outline />,
    visible: ({ stores }) =>
      stores.policies.abilities(comment.id).unresolve &&
      stores.policies.abilities(comment.documentId).update,
    perform: async () => {
      const previousResolvedAt = comment.resolvedAt;
      const previousResolvedById = comment.resolvedById ?? null;
      const previousResolvedBy = comment.resolvedBy ?? null;

      runInAction(() => {
        comment.resolvedAt = null;
        comment.resolvedById = null;
        comment.resolvedBy = null;
      });
      onUnresolve();

      try {
        await comment.unresolve();
      } catch (error) {
        runInAction(() => {
          if (comment.resolvedAt == null) {
            comment.resolvedAt = previousResolvedAt;
            comment.resolvedById = previousResolvedById;
            comment.resolvedBy = previousResolvedBy;
          }
        });
        onRevert?.();
        throw error;
      }
    },
  });

export const viewCommentReactionsFactory = ({
  comment,
}: {
  comment: Comment;
}) =>
  createActionV2({
    name: ({ t }) => `${t("View reactions")}`,
    analyticsName: "View comment reactions",
    section: ActiveDocumentSection,
    icon: <SmileyIcon />,
    visible: ({ stores }) =>
      stores.policies.abilities(comment.id).read &&
      comment.reactions.length > 0,
    perform: ({ t, stores, event }) => {
      event?.preventDefault();
      event?.stopPropagation();

      stores.dialogs.openModal({
        title: t("Reactions"),
        content: <ViewReactionsDialog model={comment} />,
      });
    },
  });
