import { observable } from "mobx";
import { BoardTag } from "@shared/types";
import Board from "~/models/Board";
import BoardColumn from "~/models/BoardColumn";
import User from "~/models/User";
import Field from "./decorators/Field";
import Relation from "./decorators/Relation";
import Model from "./base/Model";

class BoardCard extends Model {
  static modelName = "BoardCard";

  @observable
  @Field
  boardId: string;

  @observable
  @Field
  columnId: string;

  @Field
  documentId: string;

  @Field
  teamId: string;

  @observable
  @Field
  title: string;

  @observable
  @Field
  description?: string | null;

  @observable
  @Field
  tags: BoardTag[] | null;

  @observable
  @Field
  metadata?: Record<string, unknown> | null;

  @observable
  @Field
  index: string;

  @Field
  assigneeId?: string | null;

  @Relation(() => User)
  assignee?: User | null;

  @Relation(() => Board, { onDelete: "cascade" })
  board?: Board;

  @Relation(() => BoardColumn, { onDelete: "cascade" })
  column?: BoardColumn;
}

export default BoardCard;
