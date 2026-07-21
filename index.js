require("dotenv").config();
const upload = require("./middleware/multer");
const cloudinary = require("./utils/cloudinary");
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
    const projectsCollection = db.collection("projects");
    const designsCollection = db.collection("designs");
    const layoutCollection = db.collection("layouts");
    const blogsCollection = db.collection("blogs");

    // ======================
    // Root
    // ======================

    app.get("/", (req, res) => {
      res.send("Admin Server Running...");
    });

  // ======================
// Upload Helper
// ======================

async function uploadToCloudinary(file, options = {}) {
  const {
    folder = "portfolio-projects",
    resourceType = "image",
  } = options;

  const base64 = `data:${file.mimetype};base64,${file.buffer.toString(
    "base64"
  )}`;

  const result = await cloudinary.uploader.upload(base64, {
    folder,
    resource_type: resourceType,
  });

  return {
    url: result.secure_url,
    public_id: result.public_id,
  };
}

  // ======================
// Upload Image
// ======================

app.post(
  "/upload-image",
  verifyToken,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file received. Ensure the field name is 'image' and Content-Type is multipart/form-data.",
        });
      }

      if (!req.file.buffer) {
        return res.status(400).json({
          success: false,
          message: "File buffer is empty. The file may be corrupted.",
        });
      }

      if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({
          success: false,
          message: `Invalid file type '${req.file.mimetype}'. Only image files are allowed.`,
        });
      }

      const image = await uploadToCloudinary(req.file, {
        folder: "portfolio-projects",
        resourceType: "image",
      });

      res.status(200).json({
        success: true,
        message: "Image uploaded successfully.",
        file: image,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: error.message || "Image upload failed.",
        ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
      });
    }
  }
);

// ======================
// Upload PDF
// ======================

app.post(
  "/upload-pdf",
  verifyToken,
  upload.single("pdf"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No PDF file received. Ensure the field name is 'pdf' and Content-Type is multipart/form-data.",
        });
      }

      if (!req.file.buffer) {
        return res.status(400).json({
          success: false,
          message: "File buffer is empty. The file may be corrupted.",
        });
      }

      if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({
          success: false,
          message: `Invalid file type '${req.file.mimetype}'. Only PDF files are allowed.`,
        });
      }

      const pdf = await uploadToCloudinary(req.file, {
        folder: "portfolio-projects/pdfs",
        resourceType: "raw",
      });

      res.status(200).json({
        success: true,
        message: "PDF uploaded successfully.",
        file: pdf,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: error.message || "PDF upload failed.",
        ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
      });
    }
  }
);

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


// 2. GET All Inquiry in dashboard (Admin)

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

// ======================
    // projects create
    // ======================

// 1.Create Project

app.post("/projects", verifyToken, async (req, res) => {
  try {
    const project = req.body;
  // console.dir(req.body, { depth: null });
    project.createdAt = new Date();

    const result = await projectsCollection.insertOne(project);

    res.send({
      success: true,
      insertedId: result.insertedId,
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});

// 2.Get All Projects

app.get("/projects", async (req, res) => {
  try {
    const { search = "" } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        {
          title: {
            $regex: search,
            $options: "i",
          },
        },
        {
          category: {
            $regex: search,
            $options: "i",
          },
        },
        {
          description: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const projects = await projectsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(projects);
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});

//2.1 Get all data in main client side 

app.get("/projects/slug/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const project = await projectsCollection.findOne({ slug });

    if (!project) {
      return res.status(404).send({
        success: false,
        message: "Project not found",
      });
    }

    res.send(project);
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});

// 3. Get Single Project

app.get("/projects/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const project = await projectsCollection.findOne({
      _id: new ObjectId(id),
    });

    res.send(project);
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});

// 4.Update Project

app.patch("/projects/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;

    const data = req.body;

    const result = await projectsCollection.updateOne(
      {
        _id: new ObjectId(id),
      },
      {
        $set: data,
      }
    );

    res.send({
      success: true,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});

// 5.Delete Project

app.delete("/projects/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    console.log("Delete ID:", id);

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid project id",
      });
    }

    const result = await projectsCollection.deleteOne({
      _id: new ObjectId(id),
    });

    console.log(result);

    res.send({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error(err);

    res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});

    // ======================
    // blogs
    // ======================

// 1. Create Blog

app.post("/blogs", verifyToken, async (req, res) => {
  try {
    const blog = req.body;

    if (!blog.title?.trim()) {
      return res.status(400).send({
        success: false,
        message: "Blog title is required.",
      });
    }

    // Check slug uniqueness
    if (blog.slug) {
      const existing = await blogsCollection.findOne({ slug: blog.slug });
      if (existing) {
        return res.status(409).send({
          success: false,
          message: `A blog with slug "${blog.slug}" already exists.`,
        });
      }
    }

    blog.createdAt = new Date();
    blog.updatedAt = new Date();
    blog.views = blog.views || 0;

    if (blog.publishDate) {
      blog.publishDate = new Date(blog.publishDate);
    }

    const result = await blogsCollection.insertOne(blog);

    res.send({
      success: true,
      insertedId: result.insertedId,
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});

// 2. Get All Blogs

app.get("/blogs", async (req, res) => {
  try {
    const { search = "" } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { author: { $regex: search, $options: "i" } },
        { "author.name": { $regex: search, $options: "i" } },
        { excerpt: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
      ];
    }

    const blogs = await blogsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(blogs);
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});



// 3. Get Blog by Slug

app.get("/blogs/slug/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const blog = await blogsCollection.findOne({ slug });

    if (!blog) {
      return res.status(404).send({
        success: false,
        message: "Blog not found",
      });
    }

    res.send(blog);
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});

// 4. Get Single Blog

app.get("/blogs/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid blog id",
      });
    }

    const blog = await blogsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!blog) {
      return res.status(404).send({
        success: false,
        message: "Blog not found",
      });
    }

    res.send(blog);
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});

// 5. Update Blog

app.patch("/blogs/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid blog id",
      });
    }

    const data = req.body;

    // Check slug uniqueness if slug changed
    if (data.slug) {
      const existing = await blogsCollection.findOne({
        slug: data.slug,
        _id: { $ne: new ObjectId(id) },
      });
      if (existing) {
        return res.status(409).send({
          success: false,
          message: `A blog with slug "${data.slug}" already exists.`,
        });
      }
    }

    if (data.publishDate) {
      data.publishDate = new Date(data.publishDate);
    }

    data.updatedAt = new Date();

    const result = await blogsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: data }
    );

    res.send({
      success: true,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});

// 6. Delete Blog

app.delete("/blogs/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid blog id",
      });
    }

    const result = await blogsCollection.deleteOne({
      _id: new ObjectId(id),
    });

    res.send({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});

// 7. Increment Blog Views

app.patch("/blogs/views/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid blog id",
      });
    }

    const result = await blogsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $inc: { views: 1 } }
    );

    res.send({
      success: true,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});

    // ======================
    // interior-design
    // ======================
// 1. Validation Helper

    const validateDesign = (data) => {
  const errors = [];

  if (!data.title?.trim()) {
    errors.push("Title is required");
  }

  if (!data.description?.trim()) {
    errors.push("Description is required");
  }

  if (!Array.isArray(data.images) || data.images.length === 0) {
    errors.push("At least one image is required");
  }

  return errors;
};



// 3. GET All Designs

app.get("/designs", async (req, res) => {
  try {
    const result = await designsCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch designs",
      error: error.message,
    });
  }
});

// 4.GET Single Design

app.get("/designs/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await designsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!result) {
      return res.status(404).send({
        message: "Design not found",
      });
    }

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch design",
      error: error.message,
    });
  }
});

// 5.POST Design

app.post("/designs", async (req, res) => {
  try {
    const body = req.body;

    const errors = validateDesign(body);

    if (errors.length) {
      return res.status(400).send({
        message: errors,
      });
    }

    const design = {
      title: body.title.trim(),
      description: body.description.trim(),
      images: body.images,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await designsCollection.insertOne(design);

    res.send({
      insertedId: result.insertedId,
      message: "Design created successfully",
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to create design",
      error: error.message,
    });
  }
});

// 6.PATCH Design

app.patch("/designs/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const body = req.body;

    const errors = validateDesign(body);

    if (errors.length) {
      return res.status(400).send({
        message: errors,
      });
    }

    const updateDoc = {
      $set: {
        title: body.title.trim(),
        description: body.description.trim(),
        images: body.images,
        updatedAt: new Date(),
      },
    };

    const result = await designsCollection.updateOne(
      {
        _id: new ObjectId(id),
      },
      updateDoc
    );

    res.send({
      modifiedCount: result.modifiedCount,
      message: "Design updated successfully",
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to update design",
      error: error.message,
    });
  }
});

// 7.DELETE Design

app.delete("/designs/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await designsCollection.deleteOne({
      _id: new ObjectId(id),
    });

    res.send({
      deletedCount: result.deletedCount,
      message: "Design deleted successfully",
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to delete design",
      error: error.message,
    });
  }
});

// ======================
    // layout design
    // ======================
// 1.Create Layout

app.post("/layouts", verifyToken, async (req, res) => {
  try {
    const {
      title,
      description,
      image,
      pdfUrl,
    } = req.body;

    if (!title || !description || !image || !pdfUrl) {
      return res.status(400).send({
        success: false,
        message: "Title, description, image and PDF URL are required.",
      });
    }

    const layout = {
      title,
      description,
      image,
      pdfUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await layoutCollection.insertOne(layout);

    res.send({
      success: true,
      message: "Layout created successfully",
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

// 2.Get All Layouts

app.get("/layouts", async (req, res) => {
  try {
    const layouts = await layoutCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.send(layouts);
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

// 3.Get Single Layout

app.get("/layouts/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const layout = await layoutCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!layout) {
      return res.status(404).send({
        success: false,
        message: "Layout not found.",
      });
    }

    res.send(layout);
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

// 4.Update Layout

app.patch("/layouts/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;

    const {
      title,
      description,
      image,
      pdfUrl,
    } = req.body;

    const result = await layoutCollection.updateOne(
      {
        _id: new ObjectId(id),
      },
      {
        $set: {
          title,
          description,
          image,
          pdfUrl,
          updatedAt: new Date(),
        },
      }
    );

    res.send({
      success: true,
      message: "Layout updated successfully",
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

// 5.Delete Layout

app.delete("/layouts/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;

    const result = await layoutCollection.deleteOne({
      _id: new ObjectId(id),
    });

    res.send({
      success: true,
      message: "Layout deleted successfully",
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
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