const express = require("express");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const withdrawalRoutes = require("./routes/withdrawal");
const whatsappServiceRoutes = require("./routes/whatsappService");
const adminRoutes = require("./routes/admin");
const packageRoutes = require("./routes/packageRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const adminWaRoutes = require("./routes/adminWaRoutes");
const dotenv = require("dotenv");

dotenv.config();
connectDB();

const cors = require("cors");
const app = express();

// Use CORS middleware
app.use(
  cors({
    origin: "http://localhost:3000", // Frontend origin
    allowedHeaders: ["Authorization", "Content-Type"], // Allow Authorization header
  })
);

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/money", withdrawalRoutes);
app.use("/api", whatsappServiceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", packageRoutes);
app.use("/api", subscriptionRoutes);
app.use("/api",adminWaRoutes);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
