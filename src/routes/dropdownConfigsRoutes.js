const express = require("express");
const router = express.Router();
const { verifyToken, requireRole } = require("../middleware/auth"); // adjust to your actual middleware names
const pool = require("../db"); // adjust to your actual db pool import

// GET /dropdown-configs
// Returns everything, grouped by module -> field -> [options], ordered by sort_order
router.get("/", verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT module, field, label, value, bg_color, text_color, sort_order FROM dropdown_configs ORDER BY module, field, sort_order ASC"
    );

    const configs = {};
    for (const row of rows) {
      configs[row.module] ??= {};
      configs[row.module][row.field] ??= [];
      configs[row.module][row.field].push({
        label: row.label,
        value: row.value,
        bgColor: row.bg_color,
        textColor: row.text_color,
      });
    }

    res.json({ success: true, configs });
  } catch (err) {
    console.error("getAllDropdownConfigs error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch dropdown configs." });
  }
});

// PUT /dropdown-configs/:module/:field
// Replaces the full option list for one module+field
router.put("/:module/:field", verifyToken, requireRole("superadmin"), async (req, res) => {
  const { module, field } = req.params;
  const { options } = req.body;

  if (!Array.isArray(options)) {
    return res.status(400).json({ success: false, message: "options must be an array." });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Delete existing rows for this module+field, then re-insert in order.
    // Simpler and safer than diffing for adds/renames/removes/reorders.
    await conn.query(
      "DELETE FROM dropdown_configs WHERE module = ? AND field = ?",
      [module, field]
    );

    if (options.length > 0) {
      const values = options.map((opt, i) => [
        module,
        field,
        opt.label,
        opt.value,
        opt.bgColor,
        opt.textColor,
        i,
      ]);
      await conn.query(
        `INSERT INTO dropdown_configs
          (module, field, label, value, bg_color, text_color, sort_order)
         VALUES ?`,
        [values]
      );
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error("saveDropdownOptions error:", err);
    res.status(500).json({ success: false, message: "Failed to save dropdown options." });
  } finally {
    conn.release();
  }
});

module.exports = router;