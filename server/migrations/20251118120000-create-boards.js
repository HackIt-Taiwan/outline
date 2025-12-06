"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("boards", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
      },
      documentId: {
        type: Sequelize.UUID,
        allowNull: false,
        onDelete: "cascade",
        references: {
          model: "documents",
        },
      },
      teamId: {
        type: Sequelize.UUID,
        allowNull: false,
        onDelete: "cascade",
        references: {
          model: "teams",
        },
      },
      createdById: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
        },
      },
      updatedById: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "users",
        },
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "",
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });
    await queryInterface.addIndex("boards", ["documentId"], {
      unique: true,
      where: {
        deletedAt: null,
      },
    });
    await queryInterface.addIndex("boards", ["teamId"]);

    await queryInterface.createTable("board_columns", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
      },
      boardId: {
        type: Sequelize.UUID,
        allowNull: false,
        onDelete: "cascade",
        references: {
          model: "boards",
        },
      },
      documentId: {
        type: Sequelize.UUID,
        allowNull: false,
        onDelete: "cascade",
        references: {
          model: "documents",
        },
      },
      teamId: {
        type: Sequelize.UUID,
        allowNull: false,
        onDelete: "cascade",
        references: {
          model: "teams",
        },
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "",
      },
      color: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      index: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      createdById: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
        },
      },
      updatedById: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "users",
        },
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });
    await queryInterface.addIndex("board_columns", ["boardId"]);
    await queryInterface.addIndex("board_columns", ["documentId"]);
    await queryInterface.addIndex("board_columns", ["teamId"]);

    await queryInterface.createTable("board_cards", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
      },
      boardId: {
        type: Sequelize.UUID,
        allowNull: false,
        onDelete: "cascade",
        references: {
          model: "boards",
        },
      },
      columnId: {
        type: Sequelize.UUID,
        allowNull: false,
        onDelete: "cascade",
        references: {
          model: "board_columns",
        },
      },
      documentId: {
        type: Sequelize.UUID,
        allowNull: false,
        onDelete: "cascade",
        references: {
          model: "documents",
        },
      },
      teamId: {
        type: Sequelize.UUID,
        allowNull: false,
        onDelete: "cascade",
        references: {
          model: "teams",
        },
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "",
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      tags: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      assigneeId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "users",
        },
      },
      index: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      createdById: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
        },
      },
      updatedById: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "users",
        },
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });
    await queryInterface.addIndex("board_cards", ["boardId"]);
    await queryInterface.addIndex("board_cards", ["columnId"]);
    await queryInterface.addIndex("board_cards", ["documentId"]);
    await queryInterface.addIndex("board_cards", ["teamId"]);
    await queryInterface.addIndex("board_cards", ["assigneeId"]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("board_cards");
    await queryInterface.dropTable("board_columns");
    await queryInterface.dropTable("boards");
  },
};
