// ─── OFFICE INVENTORY ROUTES ───────────────────────────────────────────────
// Paste this block into your existing server.js, anywhere after `const db =
// mysql.createPool(...)` and before `app.listen(...)`. It reuses your
// existing `db` pool, `jwt`, and `JWT_SECRET` — no new imports needed beyond
// `crypto` for UUIDs (Node's built-in, require it once near your other
// requires at the top: `const crypto = require("crypto");`).

function computeStockStatus(currentStock, inStockThreshold) {
  if (currentStock <= 0) return "out_of_stock";
  if (currentStock <= inStockThreshold) return "low_stock";
  return "in_stock";
}

// ─── GET /office-inventory ─────────────────────────────────────────────────
app.get("/office-inventory", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ success: false, message: "No token provided." });
  try { jwt.verify(authHeader.split(" ")[1], JWT_SECRET); }
  catch { return res.status(401).json({ success: false, message: "Invalid token." }); }

  try {
    const [rows] = await db.query("SELECT * FROM office_inventory ORDER BY name ASC");
    return res.json({ success: true, count: rows.length, items: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /office-inventory — create item ──────────────────────────────────
app.post("/office-inventory", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ success: false, message: "No token provided." });
  try { jwt.verify(authHeader.split(" ")[1], JWT_SECRET); }
  catch { return res.status(401).json({ success: false, message: "Invalid token." }); }

  const {
    itemCode, name, brand, category, unit,
    pricePerUnit, currentStock, lowStockThreshold, inStockThreshold,
  } = req.body;

  if (!itemCode || !name || !category || !unit) {
    return res.status(400).json({
      success: false,
      message: "itemCode, name, category, and unit are required.",
    });
  }

  try {
    const [existing] = await db.query(
      "SELECT id FROM office_inventory WHERE item_code = ?",
      [itemCode],
    );
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Item code "${itemCode}" already exists.`,
      });
    }

    const id = crypto.randomUUID();
    const lowThresh = lowStockThreshold ?? 5;
    const inThresh = inStockThreshold ?? 10;
    const stock = currentStock ?? 0;
    const stockStatus = computeStockStatus(stock, inThresh);

    await db.query(
      `INSERT INTO office_inventory
        (id, item_code, name, brand, category, unit, price_per_unit,
         current_stock, stock_status, low_stock_threshold, in_stock_threshold,
         is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [id, itemCode, name, brand ?? "", category, unit, pricePerUnit ?? 0,
       stock, stockStatus, lowThresh, inThresh],
    );

    const [rows] = await db.query("SELECT * FROM office_inventory WHERE id = ?", [id]);
    return res.status(201).json({ success: true, item: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /office-inventory/:id — update item ─────────────────────────────
app.patch("/office-inventory/:id", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ success: false, message: "No token provided." });
  try { jwt.verify(authHeader.split(" ")[1], JWT_SECRET); }
  catch { return res.status(401).json({ success: false, message: "Invalid token." }); }

  const { id } = req.params;
  const { name, brand, category, unit, pricePerUnit, lowStockThreshold, inStockThreshold } = req.body;

  try {
    const [rows] = await db.query("SELECT * FROM office_inventory WHERE id = ?", [id]);
    if (rows.length === 0)
      return res.status(404).json({ success: false, message: "Item not found" });

    const current = rows[0];
    const inThresh = inStockThreshold ?? current.in_stock_threshold;
    const stockStatus = computeStockStatus(current.current_stock, inThresh);

    await db.query(
      `UPDATE office_inventory SET
         name = ?, brand = ?, category = ?, unit = ?, price_per_unit = ?,
         low_stock_threshold = ?, in_stock_threshold = ?, stock_status = ?,
         updated_at = NOW()
       WHERE id = ?`,
      [
        name ?? current.name,
        brand ?? current.brand,
        category ?? current.category,
        unit ?? current.unit,
        pricePerUnit ?? current.price_per_unit,
        lowStockThreshold ?? current.low_stock_threshold,
        inThresh,
        stockStatus,
        id,
      ],
    );

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /office-inventory/:id/archive ───────────────────────────────────
app.patch("/office-inventory/:id/archive", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ success: false, message: "No token provided." });
  try { jwt.verify(authHeader.split(" ")[1], JWT_SECRET); }
  catch { return res.status(401).json({ success: false, message: "Invalid token." }); }

  const { id } = req.params;
  try {
    const [result] = await db.query(
      "UPDATE office_inventory SET is_active = 0, updated_at = NOW() WHERE id = ?",
      [id],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: "Item not found" });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /office-inventory/:id/adjust-stock — deduct stock ────────────────
app.post("/office-inventory/:id/adjust-stock", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ success: false, message: "No token provided." });
  try { jwt.verify(authHeader.split(" ")[1], JWT_SECRET); }
  catch { return res.status(401).json({ success: false, message: "Invalid token." }); }

  const { id } = req.params;
  const { quantity, date, reason, performedByName } = req.body;

  if (!quantity || quantity <= 0)
    return res.status(400).json({ success: false, message: "Quantity must be greater than 0." });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query("SELECT * FROM office_inventory WHERE id = ? FOR UPDATE", [id]);
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    const item = rows[0];
    const stockBefore = item.current_stock;

    if (quantity > stockBefore) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Cannot deduct more than current stock." });
    }

    const stockAfter = stockBefore - quantity;
    const stockStatus = computeStockStatus(stockAfter, item.in_stock_threshold);

    await conn.query(
      "UPDATE office_inventory SET current_stock = ?, stock_status = ?, updated_at = NOW() WHERE id = ?",
      [stockAfter, stockStatus, id],
    );

    await conn.query(
      `INSERT INTO stock_transactions
        (id, item_id, item_code, item_name, type, quantity_change, stock_before,
         stock_after, price_per_unit, total_amount, reason, performed_by_name,
         transaction_date, created_at)
       VALUES (?, ?, ?, ?, 'manual_adjustment', ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        crypto.randomUUID(), id, item.item_code, item.name,
        -quantity, stockBefore, stockAfter, item.price_per_unit,
        quantity * Number(item.price_per_unit),
        reason ?? "", performedByName ?? "Unknown", date,
      ],
    );

    await conn.commit();
    return res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// ─── POST /office-inventory/:id/deliver — restock ──────────────────────────
app.post("/office-inventory/:id/deliver", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ success: false, message: "No token provided." });
  try { jwt.verify(authHeader.split(" ")[1], JWT_SECRET); }
  catch { return res.status(401).json({ success: false, message: "Invalid token." }); }

  const { id } = req.params;
  const { quantity, date, pricePerUnit, notes, performedByName } = req.body;

  if (!quantity || quantity <= 0)
    return res.status(400).json({ success: false, message: "Quantity must be greater than 0." });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query("SELECT * FROM office_inventory WHERE id = ? FOR UPDATE", [id]);
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    const item = rows[0];
    const stockBefore = item.current_stock;
    const stockAfter = stockBefore + quantity;
    const stockStatus = computeStockStatus(stockAfter, item.in_stock_threshold);
    const price = pricePerUnit ?? item.price_per_unit;

    await conn.query(
      "UPDATE office_inventory SET current_stock = ?, price_per_unit = ?, stock_status = ?, updated_at = NOW() WHERE id = ?",
      [stockAfter, price, stockStatus, id],
    );

    await conn.query(
      `INSERT INTO stock_transactions
        (id, item_id, item_code, item_name, type, quantity_change, stock_before,
         stock_after, price_per_unit, total_amount, reason, performed_by_name,
         transaction_date, created_at)
       VALUES (?, ?, ?, ?, 'delivery', ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        crypto.randomUUID(), id, item.item_code, item.name,
        quantity, stockBefore, stockAfter, price,
        quantity * Number(price),
        notes ?? "", performedByName ?? "Unknown", date,
      ],
    );

    await conn.commit();
    return res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});