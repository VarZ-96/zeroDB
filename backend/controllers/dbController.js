import pkg from "pg";
const { Pool } = pkg;
import User from "../models/User.js";
import { encrypt, decrypt } from "../utils/crypto.js";

// Cache pools in memory keyed by userId to persist connections across requests
const poolCache = new Map();

export const savePostgresUri = async (req, res) => {
  try {
    const { uri } = req.body;
    const userId = req.user.id;

    if (!uri) {
      return res.status(400).json({ error: "No URI provided" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Encrypt connection string before saving to MongoDB
    user.postgresUri = encrypt(uri);
    await user.save();

    // If URI changes, invalidate their existing connection pool
    if (poolCache.has(userId)) {
      await poolCache.get(userId).end();
      poolCache.delete(userId);
    }

    res.status(200).json({ success: true, message: "Postgres URI saved" });
  } catch (error) {
    res.status(500).json({ error: "Failed to save Postgres URI", details: error.message });
  }
};

export const getPostgresUri = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Decrypt on retrieval
    const decryptedUri = decrypt(user.postgresUri);

    res.status(200).json({ success: true, uri: decryptedUri });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch Postgres URI", details: error.message });
  }
};

export const executePostgresQuery = async (req, res) => {
  try {
    const { sql, isPlan } = req.body;
    const userId = req.user.id;

    if (!sql) {
      return res.status(400).json({ error: "No SQL provided" });
    }

    const user = await User.findById(userId);
    if (!user || !user.postgresUri) {
      return res.status(400).json({ error: "No PostgreSQL connection configured. Please set it in Settings." });
    }

    // Get or create a connection pool for this user
    let pool = poolCache.get(userId);
    if (!pool) {
      const decryptedUri = decrypt(user.postgresUri);
      pool = new Pool({ connectionString: decryptedUri, max: 2, idleTimeoutMillis: 30000 });
      pool.on("error", (err) => console.error("Unexpected pg pool error:", err));
      poolCache.set(userId, pool);
    }

    const startTime = performance.now();
    const result = await pool.query(sql);
    const endTime = performance.now();

    const executionTime = endTime - startTime;

    // Convert pg result to match our frontend format { columns, values }
    let columns = [];
    let values = [];

    // pool.query returns an array of results if multiple statements were executed (like in CSV import)
    const finalResult = Array.isArray(result) ? result[result.length - 1] : result;

    if (finalResult && finalResult.fields) {
      columns = finalResult.fields.map(f => f.name);
      values = finalResult.rows.map(row => columns.map(col => row[col]));
    }

    res.status(200).json({
      success: true,
      result: { columns, values },
      isPlan,
      executionTime: parseFloat(executionTime.toFixed(2)),
      memoryUsage: "Remote" // Not available locally
    });
  } catch (error) {
    res.status(500).json({ error: "Query execution failed", details: error.message });
  }
};

export const getPostgresSchema = async (req, res) => {
  try {
    const userId = req.user.id;
    let pool = poolCache.get(userId);
    if (!pool) {
      const user = await User.findById(userId);
      if (!user || !user.postgresUri) {
        return res.status(400).json({ error: "No PostgreSQL connection configured." });
      }
      const decryptedUri = decrypt(user.postgresUri);
      pool = new Pool({ connectionString: decryptedUri, max: 2, idleTimeoutMillis: 30000 });
      pool.on("error", (err) => console.error("Unexpected pg pool error:", err));
      poolCache.set(userId, pool);
    }

    const query = `
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `;
    const result = await pool.query(query);

    const schemaMap = {};
    result.rows.forEach(row => {
      if (!schemaMap[row.table_name]) {
        schemaMap[row.table_name] = [];
      }
      schemaMap[row.table_name].push({ name: row.column_name, type: row.data_type });
    });

    const schema = Object.keys(schemaMap).map(tableName => ({
      tableName,
      columns: schemaMap[tableName]
    }));

    res.status(200).json({ success: true, schema });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch schema", details: error.message });
  }
};
