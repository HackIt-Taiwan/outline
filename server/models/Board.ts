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
import BoardCard from "./BoardCard";
import BoardColumn from "./BoardColumn";
import Document from "./Document";
import Team from "./Team";
import User from "./User";
import ParanoidModel from "./base/ParanoidModel";
import Fix from "./decorators/Fix";

@Table({ tableName: "boards", modelName: "board" })
@Fix
class Board extends ParanoidModel<
  InferAttributes<Board>,
  Partial<InferCreationAttributes<Board>>
> {
  @Length({
    max: 255,
    msg: `Board title must be 255 characters or less`,
  })
  @Column
  title: string;

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

  @HasMany(() => BoardColumn)
  columns: BoardColumn[];

  @HasMany(() => BoardCard)
  cards: BoardCard[];
}

export default Board;
