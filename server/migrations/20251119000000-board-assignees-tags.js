"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("board_cards", "assigneeIds", {
      type: Sequelize.ARRAY(Sequelize.UUID),
      allowNull: true,
    });

    // migrate existing assigneeId into array
    await queryInterface.sequelize.query(`
      UPDATE board_cards
      SET "assigneeIds" = CASE
        WHEN "assigneeId" IS NOT NULL THEN ARRAY["assigneeId"]
        ELSE NULL
      END
    `);

    await queryInterface.removeColumn("board_cards", "assigneeId");

    await queryInterface.addColumn("boards", "tags", {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("board_cards", "assigneeId", {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: "users",
      },
    });

    // migrate first assigneeId back from array
    await queryInterface.sequelize.query(`
      UPDATE board_cards
      SET "assigneeId" = "assigneeIds"[1]
    `);

    await queryInterface.removeColumn("board_cards", "assigneeIds");
    await queryInterface.removeColumn("boards", "tags");
  },
};
