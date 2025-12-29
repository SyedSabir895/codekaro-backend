const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const router = express.Router();

// Example route to create a new user (register)
router.post("/register", async (req, res) => {
  const { fullName,email, password } = req.body;

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create new user
    const newUser = new User({
      fullName,
      email,
      password: hashedPassword,
    });

    // Save the user to the database
    const savedUser = await newUser.save();

    res.status(201).json({
      message: "User created successfully",
      user: savedUser,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});
// Google OAuth login/register
router.post("/google", async (req, res) => {
  const { fullName, email } = req.body;

  try {
    let user = await User.findOne({ email });

    // If user doesn't exist, create one
    if (!user) {
      user = new User({
        fullName,
        email,
        password: "GOOGLE_AUTH", // dummy value, never used
      });
      await user.save();
    }

    res.status(200).json({
      message: "Google login successful",
      user,
    });
  } catch (error) {
    res.status(500).json({ message: "Google auth failed", error });
  }
});

// Example route to log in a user
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    res.status(200).json({
      message: "Logged in successfully",
      user: user,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

module.exports = router;
