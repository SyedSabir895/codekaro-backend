const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    // Add other fields as needed
  },
  {
    timestamps: true, // Enable createdAt and updatedAt
  }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
