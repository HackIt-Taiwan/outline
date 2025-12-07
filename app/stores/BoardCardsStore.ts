import { action, computed, runInAction } from "mobx";
import invariant from "invariant";
import fractionalIndex from "fractional-index";
import BoardCard from "~/models/BoardCard";
import { client } from "~/utils/ApiClient";
import { RPCAction } from "./base/Store";
import RootStore from "./RootStore";
import Store from "./base/Store";
import { BoardTag } from "@shared/types";

export default class BoardCardsStore extends Store<BoardCard> {
  actions = [
    RPCAction.Create,
    RPCAction.Update,
    RPCAction.Delete,
    RPCAction.Info,
  ];

  constructor(rootStore: RootStore) {
    super(rootStore, BoardCard);
  }

  inColumn(columnId: string): BoardCard[] {
    return this.orderedData.filter((card) => card.columnId === columnId);
  }

  @computed
  get orderedData(): BoardCard[] {
    return Array.from(this.data.values()).sort((a, b) =>
      a.index.localeCompare(b.index)
    );
  }

  @action
  removeByDocument(documentId: string) {
    const cards = this.orderedData.filter((card) => card.documentId === documentId);
    cards.forEach((card) => this.remove(card.id));
  }

  @action
  async move({
    id,
    columnId,
    beforeId,
    afterId,
  }: {
    id: string;
    columnId: string;
    beforeId?: string;
    afterId?: string;
  }) {
    const card = this.get(id);
    if (!card) {
      return;
    }

    // Save previous state for rollback
    const previousColumnId = card.columnId;
    const previousIndex = card.index;

    // Optimistic update: calculate new index and update immediately
    const beforeCard = beforeId ? this.get(beforeId) : undefined;
    const afterCard = afterId ? this.get(afterId) : undefined;
    const newIndex = fractionalIndex(
      beforeCard?.index ?? null,
      afterCard?.index ?? null
    );

    runInAction(() => {
      card.columnId = columnId;
      card.index = newIndex;
    });

    try {
      const res = await client.post("/boardCards.move", {
        id,
        columnId,
        beforeId,
        afterId,
      });
      invariant(res?.data, "Card data missing");
      runInAction(() => {
        this.add(res.data);
        this.addPolicies(res.policies);
      });
      return this.data.get(res.data.id);
    } catch (err) {
      // Rollback on error
      runInAction(() => {
        card.columnId = previousColumnId;
        card.index = previousIndex;
      });
      throw err;
    }
  }

  @action
  async updateCard(params: {
    id: string;
    title?: string;
    description?: string;
    tags?: BoardTag[];
    assigneeIds?: string[] | null;
    metadata?: Record<string, unknown>;
  }) {
    const card = this.get(params.id);
    if (!card) {
      throw new Error("Card not found");
    }

    // Save previous state for rollback
    const previousState = {
      title: card.title,
      description: card.description,
      tags: card.tags,
      assigneeIds: card.assigneeIds,
      metadata: card.metadata,
    };

    // Optimistic update
    runInAction(() => {
      if (params.title !== undefined) {
        card.title = params.title;
      }
      if (params.description !== undefined) {
        card.description = params.description;
      }
      if (params.tags !== undefined) {
        card.tags = params.tags;
      }
      if (params.assigneeIds !== undefined) {
        card.assigneeIds = params.assigneeIds;
      }
      if (params.metadata !== undefined) {
        card.metadata = params.metadata;
      }
    });

    try {
      const res = await client.post("/boardCards.update", {
        id: params.id,
        title: params.title,
        description: params.description,
        tags: params.tags,
        assigneeIds: params.assigneeIds,
        metadata: params.metadata as Record<string, string | number | boolean | null> | undefined,
      });
      invariant(res?.data, "Card data missing");
      runInAction(() => {
        this.add(res.data);
        this.addPolicies(res.policies);
      });
      return this.data.get(res.data.id);
    } catch (err) {
      // Rollback on error
      runInAction(() => {
        card.title = previousState.title;
        card.description = previousState.description;
        card.tags = previousState.tags;
        card.assigneeIds = previousState.assigneeIds;
        card.metadata = previousState.metadata;
      });
      throw err;
    }
  }
}
