const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xnvicz3.mongodb.net/?appName=Cluster0`;

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

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const db = client.db("style_decor_db");
    const usersCollection = db.collection("users");
    const servicesCollections = db.collection("services");
    const decoratorsCollections = db.collection("decorators");
    const bookingCollections = db.collection("bookings");

    // user apis
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
      const email = req.query.email;

      const result = await bookingCollections
        .find({ userEmail: email })
        .toArray();

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
      const amount = parseInt(paymentInfo.cost * 100)

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (for example, price_1234) of the product you want to sell
            price_data: {
              currency: 'usd',
              unit_amount: amount,
              product_data: {
                name: paymentInfo.serviceName
              }
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.userEmail,
        mode: "payment",
         metadata:{
          serviceId: paymentInfo.serviceId
        },
        success_url: `${process.env.STIPE_DOMAIN}/dashboard/payment-success`,
        cancel_url: `${process.env.STIPE_DOMAIN}/dashboard/payment-cancelled`,
      });

      console.log(session);
      res.send({url:session.url})

    });

    // top decorators apis
    app.get("/decorators", async (req, res) => {
      const query = {};
      const cursor = decoratorsCollections.find(query);
      const result = await cursor.sort({ rating: -1 }).limit(3).toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
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
