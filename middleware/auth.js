const jwt = require("jsonwebtoken");

// Create the app's own JWT once a user has proven who they are
const signToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

// Protect routes: expects "Authorization: Bearer <jwt>"
const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Not logged in" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch (error) {
    res.status(401).json({ message: "Session expired, please log in again" });
  }
};

module.exports = { signToken, requireAuth };
