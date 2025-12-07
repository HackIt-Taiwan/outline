"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("boards", "deadline", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn("board_cards", "dueOffsetDays", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("board_cards", "dueOffsetDays");
    await queryInterface.removeColumn("boards", "deadline");
  },
};
