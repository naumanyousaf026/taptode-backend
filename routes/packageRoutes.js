const express = require("express");
const router = express.Router();
const Package = require("../models/Package");

const verifyAdminToken = require("../middleware/adminAuthMiddleware");

// Route to add a new package (Admin only)
router.post("/add-package", verifyAdminToken, async (req, res) => {
  try {
    const { name, price, validityDays, maxNumbers, fetchFromGroups, packageType } = req.body;

    // Validate input
    if (!name || !price || !validityDays || !maxNumbers || !packageType) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Validate packageType
    if (![1, 2, 3].includes(packageType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid packageType. Must be 1, 2, or 3.",
      });
    }

    // Check if package already exists
    const existingPackage = await Package.findOne({ name });
    if (existingPackage) {
      return res.status(400).json({
        success: false,
        message: "Package already exists",
      });
    }

    // Create new package
    const newPackage = new Package({
      name,
      price,
      validityDays,
      maxNumbers,
      fetchFromGroups,
      packageType,
    });

    await newPackage.save();

    res.status(201).json({
      success: true,
      message: "Package created successfully",
      data: newPackage,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// Route to update a package (Admin only)
router.put("/update-package/:id", verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, validityDays, maxNumbers, fetchFromGroups, packageType } = req.body;

    // Optional: validate packageType if provided
    if (packageType && ![1, 2, 3].includes(packageType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid packageType. Must be 1, 2, or 3.",
      });
    }

    const updatedPackage = await Package.findByIdAndUpdate(
      id,
      { name, price, validityDays, maxNumbers, fetchFromGroups, packageType },
      { new: true, runValidators: true }
    );

    if (!updatedPackage) {
      return res.status(404).json({
        success: false,
        message: "Package not found",
      });
    }

    res.json({
      success: true,
      message: "Package updated successfully",
      data: updatedPackage,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// Route to get all packages (accessible to all users)
router.get("/all-packages", async (req, res) => {
  try {
    const packages = await Package.find();
    res.status(200).json({ success: true, data: packages });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// Route to delete a package (Admin only)
router.delete("/delete-package/:id", verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;

    const deletedPackage = await Package.findByIdAndDelete(id);

    if (!deletedPackage) {
      return res.status(404).json({
        success: false,
        message: "Package not found"
      });
    }

    res.json({
      success: true,
      message: "Package deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
});

module.exports = router;
