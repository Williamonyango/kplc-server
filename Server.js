const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bodyParser = require("body-parser");
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
      try {
        return {
          ...permit,
          work_details: isValidJSON(permit.work_details)
            ? JSON.parse(permit.work_details)
            : [],
          earth_points: isValidJSON(permit.earth_points)
            ? JSON.parse(permit.earth_points)
            : [],
        };
      } catch (parseError) {
        console.error(`Error parsing permit:`, parseError);
        console.error(`Problematic permit data:`, permit);
        return {
          ...permit,
          work_details: [],
          earth_points: [],
        };
      }
    });

    res.json(permits);
  } catch (error) {
    console.error("Error fetching permits:", error);
    res.status(500).json({ error: "Failed to fetch permits" });
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
      work_details: isValidJSON(rows[0].work_details)
        ? JSON.parse(rows[0].work_details)
        : [],
      earth_points: isValidJSON(rows[0].earth_points)
        ? JSON.parse(rows[0].earth_points)
        : [],
    };

    res.json(permit);
  } catch (error) {
    console.error("Error fetching permit:", error);
    res.status(500).json({ error: "Failed to fetch permit" });
  }
});

// Start the server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
