import invariant from "invariant";
import { action, runInAction } from "mobx";
import Board from "~/models/Board";
import { RPCAction } from "~/stores/base/Store";
import { client } from "~/utils/ApiClient";
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
      return board;
    });
  }
}
