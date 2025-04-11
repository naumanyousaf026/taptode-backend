const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const verifyAdminToken = async (req, res, next) => {
  const token = req.headers.authorization;
  
  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const tokenString = token.split(" ")[1];
    const decoded = jwt.verify(tokenString, process.env.JWT_SECRET);

    if (!decoded.adminId) {
      return res.status(403).json({ error: "Invalid admin token." });
    }

    const admin = await Admin.findById(decoded.adminId);
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

// ✅ Export the function directly
module.exports = verifyAdminToken;
