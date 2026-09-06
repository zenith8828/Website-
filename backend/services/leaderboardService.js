"use strict";

const { LEADERBOARD_LIMIT } = require("../config/constants");
const { getAllUsers } = require("../models/user");

// Get Top 20 users by valid Likes
function getTopUsers(limit = LEADERBOARD_LIMIT) {
  const users = getAllUsers();

  return users
    .filter((user) => user && user.status !== "banned")
    .sort((a, b) => {
      if (b.validLikes !== a.validLikes) {
        return b.validLikes - a.validLikes;
      }

      return new Date(a.createdAt) - new Date(b.createdAt);
    })
    .slice(0, limit)
    .map((user, index) => ({
      rank: index + 1,
      userId: user.id,
      name: user.name,
      photo: user.photo,
      validLikes: user.validLikes,
      totalEarnings: user.totalEarnings
    }));
}

function getUserRank(userId) {
  if (!userId) {
    return null;
  }

  const users = getAllUsers()
    .filter((user) => user && user.status !== "banned")
    .sort((a, b) => b.validLikes - a.validLikes);

  const index = users.findIndex((user) => user.id === userId);

  if (index === -1) {
    return null;
  }

  return index + 1;
}

module.exports = {
  getTopUsers,
  getUserRank
};
