import { InferAttributes, InferCreationAttributes } from "sequelize";
import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Length,
  Table,
} from "sequelize-typescript";
import Board from "./Board";
import BoardCard from "./BoardCard";
import Document from "./Document";
import Team from "./Team";
import User from "./User";
import ParanoidModel from "./base/ParanoidModel";
import Fix from "./decorators/Fix";

@Table({ tableName: "board_columns", modelName: "boardColumn" })
@Fix
class BoardColumn extends ParanoidModel<
  InferAttributes<BoardColumn>,
  Partial<InferCreationAttributes<BoardColumn>>
> {
  @Length({
    max: 255,
    msg: `Column title must be 255 characters or less`,
  })
  @Column
  title: string;

  @Column
  color: string | null;

  @Column
  index: string;

  @BelongsTo(() => Board, "boardId")
  board: Board;

  @ForeignKey(() => Board)
  @Column(DataType.UUID)
  boardId: string;

  @BelongsTo(() => Document, "documentId")
  document: Document;

  @ForeignKey(() => Document)
  @Column(DataType.UUID)
  documentId: string;

  @BelongsTo(() => Team, "teamId")
  team: Team;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;

  @BelongsTo(() => User, "createdById")
  createdBy: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  createdById: string;

  @BelongsTo(() => User, "updatedById")
  updatedBy: User | null;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  updatedById: string | null;

  @HasMany(() => BoardCard)
  cards: BoardCard[];
}

export default BoardColumn;
