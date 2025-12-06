import { action, computed, runInAction } from "mobx";
import invariant from "invariant";
import BoardColumn from "~/models/BoardColumn";
import { client } from "~/utils/ApiClient";
import { RPCAction } from "./base/Store";
import RootStore from "./RootStore";
import Store from "./base/Store";

export default class BoardColumnsStore extends Store<BoardColumn> {
  actions = [RPCAction.Create, RPCAction.Update, RPCAction.Delete];

  constructor(rootStore: RootStore) {
    super(rootStore, BoardColumn);
  }

  inBoard = (boardId: string) =>
    computed(() =>
      this.orderedData.filter((col) => col.boardId === boardId)
    ).get();

  @computed
  get orderedData(): BoardColumn[] {
    return Array.from(this.data.values()).sort((a, b) =>
      a.index.localeCompare(b.index)
    );
  }

  @action
  async move({
    id,
    beforeId,
    afterId,
  }: {
    id: string;
    beforeId?: string;
    afterId?: string;
  }) {
    const res = await client.post("/boardColumns.move", {
      id,
      beforeId,
      afterId,
    });
    invariant(res?.data, "Column data missing");
    runInAction(() => {
      this.add(res.data);
      this.addPolicies(res.policies);
    });
    return this.data.get(res.data.id);
  }
}
