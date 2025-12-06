import { observable } from "mobx";
import Board from "~/models/Board";
import BoardCard from "~/models/BoardCard";
import Field from "./decorators/Field";
import Relation from "./decorators/Relation";
import Model from "./base/Model";

class BoardColumn extends Model {
  static modelName = "BoardColumn";

  @Field
  boardId: string;

  @Field
  documentId: string;

  @Field
  teamId: string;

  @observable
  @Field
  title: string;

  @observable
  @Field
  color?: string | null;

  @observable
  @Field
  index: string;

  @Relation(() => Board, { onDelete: "cascade" })
  board?: Board;

  @Relation(() => BoardCard, { onDelete: "cascade" })
  cards?: BoardCard[];
}

export default BoardColumn;
