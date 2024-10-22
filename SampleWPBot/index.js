const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const OpenAI = require("openai");
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

// Create a new OpenAI client instance
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let qrCodeDataUrl = null;
let clientReady = false; // Variable to track client readiness
let masterPrompt = `Darshana Perera is the Marketing Manager at ABC Company, a Colombo 20-based leader in chatbot solutions for WhatsApp and web platforms. Under the guidance of CEO is Dulangi, the company specializes in AI-driven customer engagement tools. In addition to chatbots, ABC Company offers advanced analytics and CRM integration. Darshana drives marketing strategies to enhance brand visibility and customer growth. Provide simple short replies`;

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// Serve the index.html file for QR code display
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Serve the QR code as JSON
app.get("/qr", (req, res) => {
  if (qrCodeDataUrl) {
    res.json({ qrCode: qrCodeDataUrl });
  } else {
    res.status(503).send("QR code not available yet. Please try again later.");
  }
});

// Endpoint to get the master prompt
app.get("/master-prompt", (req, res) => {
  res.json({ masterPrompt });
});

app.post("/send-bulk-message", async (req, res) => {
  const { csvData } = req.body; // Assume `csvData` is an array of rows
  console.log("Received CSV Data:", csvData);

  if (!csvData || csvData.length === 0) {
    return res.status(400).send("CSV data is empty or invalid.");
  }

  let index = 0;

  // Function to process each row and move to the next row after 30 seconds
  const processNextRow = async () => {
    if (index < csvData.length) {
      const row = csvData[index]; // Get the current row (e.g., [phoneNumber, message])
      console.log(`Processing row ${index + 1}:`, row);

      // Assuming each row is [phoneNumber, message]
      const [phoneNumber, message] = row;
      var t = phoneNumber + "@c.us"; // For testing purposes
      try {
        // Send the message to the specified number
        await client.sendMessage(t, message);
        console.log(`Message sent to ${t}: ${message}`);
      } catch (error) {
        console.error(`Error sending message to ${t}:`, error);
      }

      // Move to the next row after a delay
      index++;
      setTimeout(processNextRow, 3000); // Wait 30 seconds before processing the next row
    } else {
      console.log("All rows processed.");
    }
  };

  // Start processing the first row
  processNextRow();

  // Immediately respond to the request while processing rows in the background
  res
    .status(200)
    .send("Bulk message process started. Check the console for progress.");
});

// Endpoint to update the master prompt
app.post("/master-prompt", (req, res) => {
  const { newPrompt } = req.body;
  if (!newPrompt) {
    return res.status(400).json({ error: "New prompt is required" });
  }
  masterPrompt = newPrompt; // Update the master prompt
  res.json({ message: "Master prompt updated successfully" });
});

// SSE endpoint to notify when the client is ready
app.get("/status", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (clientReady) {
    res.write(`data: ${JSON.stringify({ status: "ready" })}\n\n`);
  } else {
    client.once("ready", () => {
      res.write(`data: ${JSON.stringify({ status: "ready" })}\n\n`);
    });
  }
});

// Initialize WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox"],
    timeout: 60000,
  },
});

// Generate and display the QR code
client.on("qr", (qr) => {
  console.log("QR code has been generated.");
  qrcode.toDataURL(qr, (err, url) => {
    if (err) {
      console.error("Failed to generate QR code:", err);
    } else {
      qrCodeDataUrl = url;
      console.log("QR Code Data URL:", qrCodeDataUrl); // Log the generated QR code
    }
  });
});

// Log a message when successfully authenticated
client.on("ready", () => {
  console.log("Client is ready!");
  clientReady = true; // Update readiness status
});

// Error handling
client.on("error", (error) => {
  console.error("An error occurred:", error);
});

// Handle disconnection events
client.on("disconnected", (reason) => {
  console.log("Client was logged out:", reason);
  clientReady = false; // Reset readiness status on disconnection
});

// Handle incoming WhatsApp messages
client.on("message", async (message) => {
  console.log(`Message received from: ${message.from} : ${message.body}`);

  // Forward the message to OpenAI and get a response
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: masterPrompt,
        },
        { role: "user", content: message.body },
      ],
    });

    // Send the OpenAI response back to the user on WhatsApp
    const aiResponse = completion.choices[0].message.content;
    message.reply(aiResponse);
  } catch (error) {
    console.error("Error with OpenAI API request:", error);
    message.reply("Sorry, there was an error processing your request.");
  }
});

// Start the client
client.initialize().catch((error) => {
  console.error("Failed to initialize client:", error);
});

var t2 = "94771461925@c.us";
var t = "94771461925@c.us";
// API endpoint to send WhatsApp messages
app.post("/send-message", async (req, res) => {
  const { to, message } = req.body;
  console.log(req.body.to);
  t = req.body.to + "@c.us";

  if (!to || !message) {
    return res.status(400).send("Both 'to' and 'message' fields are required.");
  }

  try {
    // console.log(to);
    await client.sendMessage(t, message);
    // await client.sendMessage(to, message);
    res.status(200).send("Message sent successfully.");
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).send("Failed to send message.");
  }
});

// Start the HTTP server on port 4000
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`HTTP server is running on port ${PORT}`);
});
