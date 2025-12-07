import invariant from "invariant";
import { action, runInAction } from "mobx";
import type { BoardTag } from "@shared/types";
import Board from "~/models/Board";
import { RPCAction } from "~/stores/base/Store";
import { client } from "~/utils/ApiClient";
import { NotFoundError } from "~/utils/errors";
import RootStore from "./RootStore";
import Store from "./base/Store";

export default class BoardsStore extends Store<Board> {
  actions = [RPCAction.Info, RPCAction.Update];

  constructor(rootStore: RootStore) {
    super(rootStore, Board);
  }

  @action
  async fetchForDocument(documentId: string) {
    const res = await client.post("/boards.info", { documentId });
    invariant(res?.data, "Board response missing data");

    return runInAction(() => {
      const board = this.add(res.data.board);
      res.data.columns?.forEach(this.rootStore.boardColumns.add);
      res.data.cards?.forEach(this.rootStore.boardCards.add);
      this.addPolicies(res.policies);
      this.isLoaded = true;
      return board;
    });
  }

  @action
  async checkEnabled(documentId: string) {
    try {
      const res = await client.post("/boards.info", { documentId });
      invariant(res?.data, "Board response missing data");
      return runInAction(() => {
        const board = this.add(res.data.board);
        res.data.columns?.forEach(this.rootStore.boardColumns.add);
        res.data.cards?.forEach(this.rootStore.boardCards.add);
        this.addPolicies(res.policies);
        this.isLoaded = true;
        return board;
      });
    } catch (err) {
      if (err instanceof NotFoundError || err?.status === 404) {
        return null;
      }
      throw err;
    }
  }

  @action
  async updateTags(id: string, tags: BoardTag[]) {
    const res = await client.post("/boards.updateTags", { id, tags });
    invariant(res?.data, "Board response missing data");

    return runInAction(() => {
      const board = this.add(res.data.board ?? res.data);
      this.addPolicies(res.policies);
      return board;
    });
  }

  @action
  removeByDocument(documentId: string) {
    this.filter((b) => b.documentId === documentId).forEach((b) =>
      this.remove(b.id)
    );
  }
}
