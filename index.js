const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@devcluster.s7bmtla.mongodb.net/?retryWrites=true&w=majority&appName=DevCluster`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
});

async function run() {
	try {
		// Connect the client to the server	(optional starting in v4.7)
		await client.connect();

		const histoTrackDB = client.db("histoTrackDB");
		const artifactsCollection = histoTrackDB.collection("artifacts");
		const likedArtifactsCollection = histoTrackDB.collection("likedArtifacts");

		// get all artifacts
		app.get("/artifacts", async (req, res) => {
			const search = req.query.search;
			const email = req.query.email;
			const limit = parseInt(req.query.limit) || 0;
			const sort = req.query.sort;
			let query = {};
			if (search) {
				query = {
					name: { $regex: search, $options: "i" },
				};
			} else if (email) {
				query = {
					adderEmail: email,
				};
			}
			const cursor = artifactsCollection.find(query).sort(sort ? { [sort]: -1 } : {}).limit(limit);
			const result = await cursor.toArray();
			res.send(result);
		});

		// get a single artifact
		app.get("/artifacts/:id", async (req, res) => {
			const id = req.params.id;
			const query = { _id: new ObjectId(id) };
			const result = await artifactsCollection.findOne(query);
			res.send(result);
		});

		// update like count and toggle like
		app.patch("/artifacts/toggle-like/:id", async (req, res) => {
			const artifactId = req.params.id;
			const { email } = req.body;
			if (!email) {
				return res.status(400).send({ message: "Email is required" });
			}

			const filter = { _id: new ObjectId(artifactId) };

			const userLikes = await likedArtifactsCollection.findOne({ email });
			let likedIds = userLikes?.artifactIds || [];
			const alreadyLiked = likedIds.some((id) => id.toString() === artifactId);

			if (alreadyLiked) {
				// Unlike
				likedIds = likedIds.filter((id) => id.toString() !== artifactId);
				await likedArtifactsCollection.updateOne({ email }, { $set: { artifactIds: likedIds } });
				await artifactsCollection.updateOne(filter, { $inc: { likes: -1 } });
				res.send({ liked: false, message: "Artifact disliked" });
			} else {
				// Like
				likedIds.push(new ObjectId(artifactId));
				await likedArtifactsCollection.updateOne({ email }, { $set: { artifactIds: likedIds } }, { upsert: true });
				await artifactsCollection.updateOne(filter, { $inc: { likes: 1 } });
				res.send({ liked: true, message: "Artifact liked" });
			}
		});

		// add an artifact
		app.post("/artifacts", async (req, res) => {
			const artifact = req.body;
			const result = await artifactsCollection.insertOne(artifact);
			res.send(result);
		});

		// get liked artifacts
		app.get("/liked-artifacts", async (req, res) => {
			const email = req.query.email;
			if (!email) {
				return res.status(400).send({ message: "Email is required" });
			}

			const userLikes = await likedArtifactsCollection.findOne({ email });

			if (!userLikes || !userLikes.artifactIds?.length) {
				return res.send([]);
			}

			const objectIds = userLikes.artifactIds.map((id) => new ObjectId(id));
			const likedArtifacts = await artifactsCollection.find({ _id: { $in: objectIds } }).toArray();

			res.send(likedArtifacts);
		});

		// delete an artifact
		app.delete("/artifacts/:id", async (req, res) => {
			const id = req.params.id;
			const query = { _id: new ObjectId(id) };
			const result = await artifactsCollection.deleteOne(query);
			res.send(result);
		});

		// update an artifact
		app.patch("/artifacts/:id", async (req, res) => {
			const id = req.params.id;
			const filter = { _id: new ObjectId(id) };
			const updatedArtifact = req.body;
			const result = await artifactsCollection.updateOne(filter, { $set: updatedArtifact });
            res.send(result);
		});
        
		// Send a ping to confirm a successful connection
		await client.db("admin").command({ ping: 1 });
		console.log("Pinged your deployment. You successfully connected to MongoDB!");
	} finally {
		// Ensures that the client will close when you finish/error
		// await client.close();
	}
}
run().catch(console.dir);

app.get("/", (req, res) => {
	res.send("My Histotrack Server is running!");
});

app.listen(port, () => {
	console.log(`My Histotrack Server is running on port ${port}`);
	console.log(`http://localhost:${port}`);
});
