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
  console.log("Cookies:", req.cookies);

  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({
      success: false,
      message: "Unauthorized",
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({
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
  console.log("NODE_ENV:", process.env.NODE_ENV);

  const { email, password } = req.body;

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

  console.log("JWT:", token);

  res.cookie("token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });

  console.log("Cookie added");

  return res.status(200).json({
    success: true,
    message: "Login Successful",
  });
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

      res.send({
        success: true,
        user,
      });
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