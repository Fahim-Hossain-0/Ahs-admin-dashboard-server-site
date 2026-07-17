require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
} = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// ======================
// Middleware
// ======================

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// ======================
// MongoDB
// ======================

const uri=`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@contentdata.udrbmpj.mongodb.net/?retryWrites=true&w=majority&appName=ContentData`
console.log(uri,process.env.DB_USER,process.env.DB_PASS);

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ======================
// JWT Middleware
// ======================

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid Token",
      });
    }

    req.user = decoded;

    next();
  });
};

// ======================
// Database
// ======================

async function run() {
  try {
    // await client.connect();

    const db = client.db("adminPanel");

    const usersCollection = db.collection("users");
    const inquiriesCollection = db.collection("inquiries");

    // ======================
    // Root
    // ======================

    app.get("/", (req, res) => {
      res.send("Admin Server Running...");
    });

    // ======================
    // create admin
    // ======================
 app.post("/create-admin", async (req, res) => {
  const { email, password, setupKey } = req.body;

  if (setupKey !== process.env.ADMIN_SETUP_KEY) {
    return res.status(403).send({
      success: false,
      message: "Invalid setup key",
    });
  }

  const existingAdmin = await usersCollection.findOne({ email });

  if (existingAdmin) {
    return res.status(400).send({
      success: false,
      message: "Admin already exists",
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const result = await usersCollection.insertOne({
    email,
    password: hashedPassword,
    role: "admin",
    createdAt: new Date(),
  });

  res.send({
    success: true,
    message: "Admin created successfully",
    insertedId: result.insertedId,
  });
});


    // ======================
    // Login
    // ======================

   app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and Password are required.",
      });
    }

    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid Email",
      });
    }

    const matched = await bcrypt.compare(password, user.password);

    if (!matched) {
      return res.status(401).json({
        success: false,
        message: "Wrong Password",
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });

    return res.status(200).json({
      success: true,
      message: "Login Successful",
      user: {
        _id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});

    // ======================
    // Logout
    // ======================

    app.post("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite:
            process.env.NODE_ENV === "production" ? "none" : "lax",
        })
        .send({
          success: true,
          message: "Logout Successful",
        });
    });

    // ======================
    // Verify Login
    // ======================

    app.get("/verify-token", verifyToken, async (req, res) => {
  try {
    res.set({
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      Expires: "0",
    });

    const user = await usersCollection.findOne(
      {
        _id: new ObjectId(req.user.id),
      },
      {
        projection: {
          password: 0,
        },
      }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});

    // ======================
    // Inquiry 
    // ======================

    // 1. POST Inquiry (Public)

    app.post("/inquiries", async (req, res) => {
  try {
    const inquiry = req.body;

    if (
      !inquiry.firstName ||
      !inquiry.lastName ||
      !inquiry.email ||
      !inquiry.phone ||
      !inquiry.message
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    inquiry.status = "Unread";
    inquiry.createdAt = new Date();

    const result = await inquiriesCollection.insertOne(inquiry);

    
    res.status(201).json({
      success: true,
      insertedId: result.insertedId,
      message: "Inquiry submitted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});

// 2. GET All Inquiry (Admin)

app.get("/inquiries", verifyToken, async (req, res) => {
  try {
    const { search = "", status = "All" } = req.query;

    const query = {};

    // Search
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { message: { $regex: search, $options: "i" } },
      ];
    }

    // Status filter
    if (status !== "All") {
      query.status = status;
    }

    const result = await inquiriesCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send({
      success: true,
      inquiries: result,
    });
  } catch (error) {
    console.log(error);

    res.status(500).send({
      success: false,
      message: "Internal Server Error",
    });
  }
});

// 3. PATCH Status

app.patch("/inquiries/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await inquiriesCollection.updateOne(
      {
        _id: new ObjectId(id),
      },
      {
        $set: {
          status,
        },
      }
    );

    res.json({
      success: true,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});

// 4. DELETE

app.delete("/inquiries/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await inquiriesCollection.deleteOne({
      _id: new ObjectId(id),
    });

    res.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});

    console.log("✅ MongoDB Connected");
  } finally {
  }
}

run().catch(console.dir);

// ======================
// Server
// ======================

app.listen(port, () => {
  console.log(`🚀 Server Running On Port ${port}`);
});