const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET);

const admin = require("firebase-admin");

// --- FIREBASE INITIALIZATION START ---
try {
  const base64Key = process.env.FB_SERVICE_KEY;
  const decoded = Buffer.from(base64Key.trim(), "base64").toString("utf8");
  const serviceAccount = JSON.parse(decoded);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
   
      projectId: "style-decor-project-client" 
    });
    console.log("Firebase Admin SDK initialized");
  }
} catch (error) {
  console.error("Firebase Init Error:", error.message);
}

// const serviceAccount = require("./style-decor-project-client-firebase-adminsdk.json");

// const serviceAccount = require("./firebase-admin-key.json");

// const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
//   "utf8"
// );
// const serviceAccount = JSON.parse(decoded);

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xnvicz3.mongodb.net/?appName=Cluster0`;

// Helper function
function generateTrackingId() {
  const datePart = new Date().toISOString().replace(/[-:.TZ]/g, ""); // e.g., 20251218T123456 -> 20251218123456
  const randomPart = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
  return `SD-${datePart}-${randomPart}`; // e.g., SD-20251218123456-4821
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// middleware
app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
console.log("seeing",token)
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;

    next();
  } catch (err) {
    console.log(err)
    return res.status(401).send({ message: "unauthorized access" });
  }
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const db = client.db("style_decor_db");
    const usersCollection = db.collection("users");
    const servicesCollections = db.collection("services");
    const decoratorsCollections = db.collection("decorators");
    const bookingCollections = db.collection("bookings");
    const paymentCollections = db.collection("payments");

    // middle admin before allowing admin activity must be used after verifyfbtoken with database access
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    // user apis

    app.get("/users", async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    // app.get("/users/:id", async (req, res) => {});

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = {};
      user.role = "user";
      user.createdAt = new Date().toISOString();
      user.last_loggedIn = new Date().toISOString();
      if (user.email) {
        query.email = user.email;
      }

      const userExists = await usersCollection.findOne(query);
      if (userExists) {
        const updatedResult = await usersCollection.updateOne(query, {
          $set: {
            last_loggedIn: new Date().toISOString(),
          },
        });
        return res.send(updatedResult);
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });



    //  get logged-in user's profile
app.get("/users/profile", verifyFBToken, async (req, res) => {
  const email = req.decoded_email;

  const user = await usersCollection.findOne({ email });

  if (!user) {
    return res.status(404).send({ message: "User not found" });
  }

  res.send(user);
});


    // user profile update
    app.patch("/users/profile", verifyFBToken, async (req, res) => {
  const email = req.decoded_email;
  const { name, phone, address } = req.body;

  const result = await usersCollection.updateOne(
    { email },
    {
      $set: {
        name,
        phone,
        address,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  res.send({
    success: true,
    message: "Profile updated successfully",
    result,
  });
});


    app.patch(
      "/users/:id/role",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const roleInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: roleInfo.role,
          },
        };

        const result = await usersCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    // decoration service apis
    app.get("/services", async (req, res) => {
      const query = {};

      const cursor = servicesCollections.find(query);
      const result = await cursor.toArray();
      res.send(result);
      console.log(result);
    });
    //single service details
    app.get("/services/:id", async (req, res) => {
      const id = req.params.id;
      const result = await servicesCollections.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // post bookings
    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      booking.createdAt = new Date().toISOString();
      const result = await bookingCollections.insertOne(booking);
      res.send(result);
    });

    // get my booking
    app.get("/bookings", async (req, res) => {
      const query = {};
      const { email, deliveryStatus } = req.query;

      if (email) {
        query.userEmail = email;
      }

      if (deliveryStatus) {
        query.deliveryStatus = deliveryStatus;
      }

      const result = await bookingCollections.find(query).toArray();
      res.send(result);
    });
    // delete my bookings
    app.delete("/bookings/:id", async (req, res) => {
      const id = req.params.id;

      const result = await bookingCollections.deleteOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });

    // get bookings for payment
    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;

      const result = await bookingCollections.findOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });

    // payment related apis
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost * 100);

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (for example, price_1234) of the product you want to sell
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.serviceName,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.userEmail,
        mode: "payment",
        metadata: {
          bookingId: paymentInfo.bookingId,
          serviceName: paymentInfo.serviceName,
        },
        success_url: `${process.env.STRIPE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,

        cancel_url: `${process.env.STRIPE_DOMAIN}/dashboard/payment-cancelled`,
      });

      console.log(session);
      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      // console.log('session  id', sessionId);

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log("session retrieve", session);

      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };

      const paymentExist = await paymentCollections.findOne(query);
      console.log(paymentExist);
      if (paymentExist) {
        return res.send({
          message: "already exists",
          transactionId,
          trackingId: paymentExist.trackingId,
        });
      }

      const trackingId = generateTrackingId();

      if (session.payment_status === "paid") {
        const id = session.metadata.bookingId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: "paid",
            paymentTime: new Date().toISOString(),
            deliveryStatus: "pending-pickup",
            trackingId: trackingId,
          },
        };

        const result = await bookingCollections.updateOne(query, update);

        // save payment history
        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          bookingId: session.metadata.bookingId,
          serviceName: session.metadata.serviceName,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          trackingId: trackingId,
          paidAt: new Date().toISOString(),
        };

        if (session.payment_status === "paid") {
          const resultPayment = await paymentCollections.insertOne(payment);

          res.send({
            success: true,
            modifyBooking: result,
            paymentInfo: resultPayment,
            trackingId: trackingId,
            transactionId: session.payment_intent,
          });
        }

        res.send(result);
      }

      res.send({ success: false, message: "Payment not completed yet" });
    });

    // payment history
    app.get("/payments", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {};

      // console.log('headers', req.headers)

      if (email) {
        query.customerEmail = email;

        // check email address
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "forbidden" });
        }
      }
      const cursor = paymentCollections.find(query).sort({ paidAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    // top decorators apis

    app.get("/all-decorators", async (req, res) => {
      const query = {};

      const cursor = decoratorsCollections.find(query);
      const result = await cursor.sort({ rating: -1 }).limit(3).toArray();
      res.send(result);
    });

    app.get("/decorators", async (req, res) => {
      const query = { status: { $exists: true } };

      const cursor = decoratorsCollections.find(query);
      const result = await cursor.sort({ rating: -1 }).toArray();
      res.send(result);
    });

    // decorators related apis
    app.post("/decorators", async (req, res) => {
      const decorator = req.body;
      decorator.status = "pending";
      decorator.createdAt = new Date();

      const result = await decoratorsCollections.insertOne(decorator);
      res.send(result);
    });

    app.patch(
      "/decorators/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const status = req.body.status; // 'approved', 'pending', or 'rejected'
        const id = req.params.id;
        const email = req.body.email;
        const query = { _id: new ObjectId(id) };

        const updateDoc = {
          $set: {
            status: status,
          },
        };

        const result = await decoratorsCollections.updateOne(query, updateDoc);

        if (email) {
          const userQuery = { email: email };
          let newRole = "user";

          if (status === "approved") {
            newRole = "decorator";
          }

          const updateUser = {
            $set: {
              role: newRole,
            },
          };

          await usersCollection.updateOne(userQuery, updateUser);
        }

        res.send(result);
      }
    );

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("style decor is running!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
