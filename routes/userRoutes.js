const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const admin = require("../firebaseAdmin");
const { signToken, requireAuth } = require("../middleware/auth");
const router = express.Router();

// Marker stored as the password of accounts created through Google sign-in
const GOOGLE_PASSWORD = "GOOGLE_AUTH";

// Never send the password hash back to the browser
const publicUser = (user) => ({ fullName: user.fullName, email: user.email });

// Example route to create a new user (register)
router.post("/register", async (req, res) => {
  const { fullName, email, password } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ message: "Full name, email and password are required" });
  }

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
      user: publicUser(savedUser),
      token: signToken(savedUser),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Google login/register: the browser sends its Firebase ID token, which we verify
router.post("/google", async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: "Missing Google ID token" });
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    return res.status(401).json({ message: "Invalid Google sign-in" });
  }

  if (!decoded.email || !decoded.email_verified) {
    return res.status(401).json({ message: "Google account email is not verified" });
  }

  try {
    let user = await User.findOne({ email: decoded.email });

    // If user doesn't exist, create one
    if (!user) {
      user = new User({
        fullName: decoded.name || decoded.email.split("@")[0],
        email: decoded.email,
        password: GOOGLE_PASSWORD, // dummy value, never used
      });
      await user.save();
    }

    res.status(200).json({
      message: "Google login successful",
      user: publicUser(user),
      token: signToken(user),
    });
  } catch (error) {
    res.status(500).json({ message: "Google auth failed" });
  }
});

// Example route to log in a user
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (user.password === GOOGLE_PASSWORD) {
      return res.status(400).json({ message: "This account uses Google sign-in" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    res.status(200).json({
      message: "Logged in successfully",
      user: publicUser(user),
      token: signToken(user),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Current user, from the JWT
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
