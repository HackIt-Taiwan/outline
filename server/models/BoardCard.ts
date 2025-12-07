import { InferAttributes, InferCreationAttributes } from "sequelize";
import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Length,
  Table,
} from "sequelize-typescript";
import { BoardTag } from "@shared/types";
import Board from "./Board";
import BoardColumn from "./BoardColumn";
import Document from "./Document";
import Team from "./Team";
import User from "./User";
import ParanoidModel from "./base/ParanoidModel";
import Fix from "./decorators/Fix";

@Table({ tableName: "board_cards", modelName: "boardCard" })
@Fix
class BoardCard extends ParanoidModel<
  InferAttributes<BoardCard>,
  Partial<InferCreationAttributes<BoardCard>>
> {
  @Length({
    max: 255,
    msg: `Card title must be 255 characters or less`,
  })
  @Column
  title: string;

  @Column(DataType.TEXT)
  description: string | null;

  @Column(DataType.JSONB)
  tags: BoardTag[] | null;

  @Column(DataType.JSONB)
  metadata: Record<string, unknown> | null;

  @Column
  index: string;

  @BelongsTo(() => Board, "boardId")
  board: Board;

  @ForeignKey(() => Board)
  @Column(DataType.UUID)
  boardId: string;

  @BelongsTo(() => BoardColumn, "columnId")
  column: BoardColumn;

  @ForeignKey(() => BoardColumn)
  @Column(DataType.UUID)
  columnId: string;

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

  @Column(DataType.ARRAY(DataType.UUID))
  assigneeIds: string[] | null;

  @Column(DataType.INTEGER)
  dueOffsetDays: number | null;
}

export default BoardCard;
