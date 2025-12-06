import { observable } from "mobx";
import type { BoardTag } from "@shared/types";
import BoardCard from "~/models/BoardCard";
import BoardColumn from "~/models/BoardColumn";
import Document from "~/models/Document";
import Field from "./decorators/Field";
import Relation from "./decorators/Relation";
import Model from "./base/Model";

class Board extends Model {
  static modelName = "Board";

  /** The document that owns this board. */
  @Field
  documentId: string;

  /** The team this board belongs to. */
  @Field
  teamId: string;

  /** Title of the board, defaults to the document title. */
  @observable
  @Field
  title: string;

  @Relation(() => Document, { onDelete: "cascade" })
  document?: Document;

  @Relation(() => BoardColumn, { onDelete: "cascade" })
  columns?: BoardColumn[];

  @Relation(() => BoardCard, { onDelete: "cascade" })
  cards?: BoardCard[];

  get searchContent(): string | string[] {
    return [this.title];
  }

  get tags(): BoardTag[] {
    return [];
  }
}

export default Board;
