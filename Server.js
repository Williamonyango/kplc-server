const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const e = require("express");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies (as sent by HTML forms)

const dbUrl = new URL(process.env.DATABASE_URL);

// Database connection pool
const pool = mysql.createPool({
  host: dbUrl.hostname,
  port: dbUrl.port,
  user: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.replace("/", ""),
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 10000,
});

// Helper function to validate JSON
function isValidJSON(data) {
  if (!data || typeof data !== "string") return false; // Handle null, undefined, and non-string cases

  try {
    const parsed = JSON.parse(data);
    return typeof parsed === "object" && parsed !== null; // Ensure it results in a valid object/array
  } catch (e) {
    console.error("Invalid JSON data:", data);
    return false;
  }
}
// Test database connection
app.get("/api/health", async (req, res) => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    res.json({ status: "Connected to database successfully" });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({ error: "Failed to connect to database" });
  }
});

// Create permit
app.post("/api/permits", async (req, res) => {
  console.log("Received request body:", req.body);
  try {
    // Function to safely handle null/undefined values
    const safeValue = (value) => {
      if (value === undefined) return null;
      if (Array.isArray(value)) return JSON.stringify(value);
      return value;
    };

    console.log("Permit Number:", req.body.permitNumber);
    const permit = {
      permit_number: req.body.permit_number,
      issued_to: safeValue(req.body.issued_to),
      substation: safeValue(req.body.substation),
      work_details: safeValue(req.body.work_details),
      safe_work_limits: safeValue(req.body.safe_work_limits),
      safe_hv_work_limits: safeValue(req.body.safe_hv_work_limits),
      mv_lv_equipment: safeValue(req.body.mv_lv_equipment),
      earth_points: safeValue(req.body.earth_points),
      additional_earth_connections: safeValue(
        req.body.additional_earth_connections
      ),
      consent_person: safeValue(req.body.consent_person),
      issue_date: safeValue(req.body.issue_date),
      issue_time: safeValue(req.body.issue_time),
      submitted_at: safeValue(req.body.submitted_at) || new Date(),
      urgency: safeValue(req.body.urgency),
      status: safeValue(req.body.status),
      comments: safeValue(req.body.comments),
      approver_name: safeValue(req.body.approver_name),
      approval_date: safeValue(req.body.approval_date),
      approval_time: safeValue(req.body.approval_time),
      clearance_date: safeValue(req.body.clearance_date),
      clearance_time: safeValue(req.body.clearance_time),
      clearance_signature: safeValue(req.body.clearance_signature),
      connections: safeValue(req.body.connections),
      cancellation_consent_person: safeValue(
        req.body.cancellation_consent_person
      ),
    };

    if (!permit.permit_number) {
      return res
        .status(400)
        .json({ error: "permit_number is required and cannot be null!" });
    }

    const connection = await pool.getConnection();

    try {
      const [result] = await connection.execute(
        `INSERT INTO kplc_permits (
          permit_number, issued_to, work_details, safe_work_limits, safe_hv_work_limits,
          mv_lv_equipment, earth_points, additional_earth_connections,
          consent_person, issue_date, issue_time, submitted_at, urgency, status, 
          comments, approver_name, approval_date, approval_time, clearance_date, clearance_time, clearance_signature, connections, cancellation_consent_person, substation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? , ?, ?, ?, ?, ?, ?)`,
        [
          permit.permit_number,
          permit.issued_to,
          permit.work_details,
          permit.safe_work_limits,
          permit.safe_hv_work_limits,
          permit.mv_lv_equipment,
          permit.earth_points,
          permit.additional_earth_connections,
          permit.consent_person,
          permit.issue_date,
          permit.issue_time,
          permit.submitted_at,
          permit.urgency,
          permit.status,
          permit.comments,
          permit.approver_name,
          permit.approval_date,
          permit.approval_time,
          permit.clearance_date,
          permit.clearance_time,
          permit.clearance_signature,
          permit.connections,
          permit.cancellation_consent_person,
          permit.substation,
        ]
      );

      res.status(201).json({
        message: "Permit created successfully",
        permitId: result.insertId,
      });
    } finally {
      connection.release(); // Always release the connection
    }
  } catch (error) {
    console.error("Error creating permit:", error);
    res
      .status(500)
      .json({ error: "Failed to create permit", details: error.message });
  }
});

// Get all permits
app.get("/api/permits", async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query("SELECT * FROM kplc_permits");
    connection.release();

    const permits = rows.map((permit) => {
      return {
        ...permit,
        work_details: Array.isArray(permit.work_details)
          ? permit.work_details
          : [],
        earth_points: Array.isArray(permit.earth_points)
          ? permit.earth_points
          : [],
      };
    });

    res.json(permits);
  } catch (error) {
    console.error("Error fetching permits:", error);
    res.status(500).json({ error: "Failed to fetch permits" });
  }
});

// Get all users
app.get("/api/users", async (req, res) => {
  const { email, id_number } = req.query;

  try {
    const connection = await pool.getConnection();

    let query = "SELECT * FROM users";
    let values = [];

    if (email && id_number) {
      query += " WHERE Email = ? AND Id_number = ?";
      values.push(email, id_number);
    }

    const [rows] = await connection.query(query, values);
    connection.release();

    // Generate a token for each matched user
    const usersWithTokens = rows.map((user) => {
      const token = jwt.sign(
        { id: user.id, email: user.Email },
        process.env.JWT_SECRET || "your_secret_key",
        { expiresIn: "120d" }
      );

      return {
        ...user,
        token,
      };
    });

    res.status(200).json(usersWithTokens);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Create user
app.post("/api/users", async (req, res) => {
  const { Name, Email, Id_number } = req.body;

  // Basic input validation
  if (!Name || !Email || !Id_number) {
    return res
      .status(400)
      .json({ error: "Please provide Name, Email, and Id_number." });
  }

  try {
    const connection = await pool.getConnection();

    // Check if email or ID number already exists
    const [existing] = await connection.query(
      "SELECT * FROM users WHERE Email = ?",
      [Email]
    );

    if (existing.length > 0) {
      connection.release();
      return res.status(409).json({ error: "Email already exists." });
    }

    // Insert new user
    await connection.query(
      "INSERT INTO users (Name, Email, Id_number) VALUES (?, ?, ?)",
      [Name, Email, Id_number]
    );

    // Retrieve the newly inserted user
    const [newUser] = await connection.query(
      "SELECT * FROM users WHERE Email = ?",
      [Email]
    );
    connection.release();

    // Generate JWT token
    const token = jwt.sign(
      { id: newUser[0].id, email: newUser[0].Email },
      process.env.JWT_SECRET || "your_secret_key",
      { expiresIn: "1h" }
    );

    res.status(201).json({ user: newUser[0], token });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// Get permit by ID
app.get("/api/permits/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      "SELECT * FROM kplc_permits WHERE id = ?",
      [id]
    );
    connection.release();

    if (rows.length === 0) {
      return res.status(404).json({ error: "Permit not found" });
    }

    const permit = {
      ...rows[0],
      work_details: Array.isArray(rows[0].work_details)
        ? rows[0].work_details
        : [],
      earth_points: Array.isArray(rows[0].earth_points)
        ? rows[0].earth_points
        : [],
    };

    res.json(permit);
  } catch (error) {
    console.error("Error fetching permit:", error);
    res.status(500).json({ error: "Failed to fetch permit" });
  }
});

app.put("/api/permits/:permit_number", async (req, res) => {
  const { permit_number } = req.params;

  const updatedData = {
    clearance_date: req.body.clearance_date,
    clearance_time: req.body.clearance_time,
    clearance_signature: req.body.clearance_signature,
    connections: req.body.connections,
    cancellation_consent_person: req.body.cancellation_consent_person,
  };

  // Remove undefined or null fields
  Object.keys(updatedData).forEach(
    (key) => updatedData[key] == null && delete updatedData[key]
  );

  // Check if anything is left to update
  if (Object.keys(updatedData).length === 0) {
    return res
      .status(400)
      .json({ error: "No valid fields provided to update." });
  }

  let connection;

  try {
    connection = await pool.getConnection();

    const fields = Object.keys(updatedData);
    const values = Object.values(updatedData);

    const setClause = fields.map((field) => `${field} = ?`).join(", ");
    values.push(permit_number);

    const sql = `UPDATE kplc_permits SET ${setClause} WHERE permit_number = ?`;

    const [result] = await connection.execute(sql, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Permit not found" });
    }

    res.status(200).json({ message: "Permit updated successfully" });
  } catch (error) {
    console.error("Error updating permit:", error.message);
    res
      .status(500)
      .json({ error: "Failed to update permit", details: error.message });
  } finally {
    if (connection) connection.release();
  }
});
// Route to add Id_number column as an integer to the table
app.post("/api/permits/add-id-column", async (req, res) => {
  try {
    const connection = await pool.getConnection();

    // SQL query to add the new column Id_number as an integer
    const addColumnQuery = `ALTER TABLE kplc_permits ADD COLUMN Id_number INT`;

    await connection.query(addColumnQuery);
    connection.release();

    res.status(200).json({
      message:
        "Column 'Id_number' added successfully as INTEGER to kplc_permits table.",
    });
  } catch (error) {
    console.error("Error adding Id_number column:", error);
    res.status(500).json({
      error: "Failed to add Id_number column",
      details: error.message,
    });
  }
});

// Start the server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
