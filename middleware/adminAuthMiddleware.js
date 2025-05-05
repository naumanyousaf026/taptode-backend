const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const verifyAdminToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token || !token.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access denied. Invalid or missing token." });
  }

  try {
    const tokenString = token.split(" ")[1];
    const decoded = jwt.verify(tokenString, process.env.JWT_SECRET);

    if (decoded.role !== "admin") {
      return res.status(403).json({ error: "Access denied. Not an admin." });
    }

    const admin = await Admin.findById(decoded.id);
    if (!admin) {
      return res.status(404).json({ error: "Admin not found." });
    }

    req.admin = admin;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: "Invalid token." });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "Token has expired." });
    }
    return res.status(500).json({ error: "Authentication failed." });
  }
};

module.exports = verifyAdminToken;
