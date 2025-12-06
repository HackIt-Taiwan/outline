import { action, computed, runInAction } from "mobx";
import invariant from "invariant";
import BoardCard from "~/models/BoardCard";
import { client } from "~/utils/ApiClient";
import { RPCAction } from "./base/Store";
import RootStore from "./RootStore";
import Store from "./base/Store";

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

  inColumn = (columnId: string) =>
    computed(() =>
      this.orderedData.filter((card) => card.columnId === columnId)
    ).get();

  @computed
  get orderedData(): BoardCard[] {
    return Array.from(this.data.values()).sort((a, b) =>
      a.index.localeCompare(b.index)
    );
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
  }
}
