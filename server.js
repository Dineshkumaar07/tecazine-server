const express = require("express");
const multer = require("multer");
const cors = require("cors");
require("dotenv").config();
const { BlobServiceClient } = require("@azure/storage-blob");

const app = express();
const port = process.env.PORT || 5000;

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const connectionString = process.env.CONNECTIONSTRING;
const containerName = process.env.CONTAINERNAME;

const blobServiceClient =
  BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobServiceClient.getContainerClient(containerName);

app.use(express.json());
app.use(cors());

app.post("/upload", upload.single("file"), async (req, res) => {
  const { name, registerNumber } = req.body;
  const file = req.file;

  if (!name || !registerNumber || !file) {
    return res
      .status(400)
      .send("Please provide name, register number, and a file.");
  }

  const fileName = `${registerNumber}-${name}-${file.originalname}`;
  const blockBlobClient = containerClient.getBlockBlobClient(fileName);

  try {
    await blockBlobClient.upload(file.buffer, file.buffer.length);
    return res.status(200).send("File uploaded successfully.");
  } catch (error) {
    console.error("Error uploading file:", error.message);
    return res.status(500).send("Internal Server Error");
  }
});

app.get("/documents", async (req, res) => {
  try {
    const blobs = [];
    for await (const blob of containerClient.listBlobsFlat()) {
      blobs.push(blob.name);
    }
    res.json(blobs);
  } catch (error) {
    console.error("Error in /documents:", error.message);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/download/:blobName", async (req, res) => {
  const blobName = req.params.blobName;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  try {
    const downloadResponse = await blockBlobClient.download();
    const content = await streamToBuffer(downloadResponse.readableStreamBody);
    res.set("Content-Type", downloadResponse.contentType);
    res.set("Content-Disposition", `attachment; filename="${blobName}"`);
    res.send(content);
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Internal Server Error");
  }
});

function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on("error", reject);
  });
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
