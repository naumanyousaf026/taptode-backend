const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  // Check if Authorization header exists
  if (!authHeader) {
    // console.log("No authorization header found");
    return res.status(401).json({ error: "Access denied. Token is missing." });
  }
  
  // Check if it follows Bearer token format
  if (!authHeader.startsWith('Bearer ')) {
    // console.log("Authorization header doesn't follow Bearer format:", authHeader);
    return res.status(401).json({ error: "Invalid token format. Use 'Bearer TOKEN'" });
  }
  
  const token = authHeader.split(" ")[1];
  
  // Verify the token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    // console.log("Token verified successfully for user:", decoded.id);
    next();
  } catch (err) {
    // console.log("Token verification failed:", err.message);
    return res.status(401).json({ error: "Invalid token" });
  }
};

module.exports = { verifyToken };