import express, { json } from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { getRedisClient } from "./lib/redis.js";

dotenv.config();

const app = express();
const PORT = 3001;
const SESSION_TTL = 86400; // 24 hours in seconds
const MODEL_NAME = "gemini-2.5-flash-lite";

// Initialize Redis client
let redis;
(async () => {
  try {
    redis = await getRedisClient();
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    process.exit(1);
  }
})();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Server is running on port 3001" });
});


const MENU = {
  categories: {
    mains: {
      name: "Main Dishes",
      items: [
        {
          id: "jollof_rice",
          name: "Jollof Rice",
          price: 2500,
          description:
            "Spicy Nigerian rice with tomatoes and spices and chicken",
        },
        {
          id: "fried_rice",
          name: "Fried Rice",
          price: 2800,
          description: "Mixed vegetables fried rice and chicken",
        },
        {
          id: "chicken_shawarma",
          name: "Chicken Shawarma",
          price: 2800,
          description: "Grilled chicken with vegetables",
        },
        {
          id: "pounded_yam",
          name: "Pounded Yam with Egusi",
          price: 3500,
          description: "Traditional pounded yam with egusi soup",
        },
        {
          id: "suya",
          name: "Suya Platter",
          price: 2000,
          description: "Grilled spiced meat skewers",
        },
        {
          id: "beef_burger",
          name: "Beef Burger",
          price: 2000,
          description: "Beef burger with lettuce, tomato, and onion",
        },
      ],
    },
    drinks: {
      name: "Beverages",
      items: [
        {
          id: "zobo",
          name: "Zobo Drink",
          price: 800,
          description: "Traditional Nigerian hibiscus drink",
        },
        {
          id: "chapman",
          name: "Chapman",
          price: 1200,
          description: "Nigerian cocktail with fruits",
        },
        {
          id: "water",
          name: "Bottled Water",
          price: 300,
          description: "500ml bottled water",
        },
        {
          id: "5_alive",
          name: "5 Alive",
          price: 1500,
          description: "5 Alive drink",
        },
        {
          id: "soft_drink",
          name: "Soft Drink",
          price: 500,
          description: "Coca-Cola, Pepsi, or Sprite",
        },
      ],
    },
    sides: {
      name: "Side Dishes",
      items: [
        {
          id: "plantain",
          name: "Fried Plantain",
          price: 800,
          description: "Sweet fried plantain slices",
        },
        {
          id: "moi_moi",
          name: "Moi Moi",
          price: 1000,
          description: "Steamed bean pudding",
        },
        {
          id: "salad",
          name: "Garden Salad",
          price: 1200,
          description: "Fresh mixed vegetables",
        },
      ],
    },
  },
};

app.post("/chat", async (req, res) => {
  try {
    const { message, history = [], sessionId } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Server misconfiguration: GEMINI_API_KEY not set",
      });
    }

    // Get or create session using Redis
    if (!redis) {
      throw new Error('Redis client not initialized');
    }
    
    const { sessionId: currentSessionId, session } = await getOrCreateSession(redis, sessionId);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // Format the conversation history
    const formattedHistory = history
      .map(
        (msg) =>
          `${msg.role === "user" ? "CUSTOMER" : "ASSISTANT"}: ${msg.content}`
      )
      .join("\n");

    const prompt = `
        You are a restaurant ordering assistant. Your job is to:
        1. Help customers understand the menu.
        2. Take their orders accurately.
        3. Use the special ORDER commands when managing items in their cart.
        4. Provide conversational responses to the user.
        5. Maintain context from previous messages.

        PREVIOUS MESSAGES:
        ${formattedHistory || "No previous messages"}

        CURRENT ORDER STATE:
        ${JSON.stringify(session.order, null, 2)}

        RESPONSE FORMAT (JSON):
        {
            "userIntent": "order" | "cancel" | "update" | "addItem" | "removeItem" | "increaseQuantity" | "decreaseQuantity" | "query",
            "response": "Your response here",
            "currentOrder": { ... },
            "item": { item from the menu to be added or removed, increase or decrease quantity, blank if no action },
            "requiresConfirmation": false,
            "suggestions": [],
            "context": {
                "previouslyMentionedItems": [],
                "pendingConfirmations": [],
                "userPreferences": { "allergies": [], "frequentOrders": [] }
            }
        }

        MENU:
        ${JSON.stringify(MENU, null, 2)}

        IMPORTANT: Your response MUST be a valid JSON object. Do NOT include any other text, markdown, code blocks, or formatting. 
        Your response will be directly parsed as JSON, so it must be valid JSON and nothing else.
        Here is the current message: ${message}
        `;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        response_mime_type: "application/json",
      },
    });

    const response = result.response;
    let responseText = response.text().trim();


    // Parse the JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseText);

      // Update session
      if (parsedResponse.currentOrder) {
        session.order = parsedResponse.currentOrder;
      }
      if (parsedResponse.context) {
        session.context = parsedResponse.context;
      }

      // Update session in Redis
      await updateSession(redis, currentSessionId, session);

      res.json({
        ...parsedResponse,
        sessionId: currentSessionId,
      });
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      res.status(500).json({
        error: "Failed to process AI response",
        details: parseError.message,
      });
    }
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      error: "An error occurred while processing your request",
      details: error.message,
    });
  }
});

// Helper functions for Redis session management
async function getOrCreateSession(redis, sessionId) {
  try {
    if (!sessionId) {
      const newSessionId = `sess_${Math.random().toString(36).substr(2, 9)}`;
      const newSession = {
        order: { items: [], totalCost: 0, status: "draft" },
        context: {
          previouslyMentionedItems: [],
          pendingConfirmations: [],
          userPreferences: { allergies: [], frequentOrders: [] }
        }
      };
      await redis.set(`session:${newSessionId}`, JSON.stringify(newSession), 'EX', SESSION_TTL);
      return { sessionId: newSessionId, session: newSession };
    }

    const sessionData = await redis.get(`session:${sessionId}`);
    if (!sessionData) {
      throw new Error('Session not found');
    }
    return { sessionId, session: JSON.parse(sessionData) };
  } catch (error) {
    console.error('Error in getOrCreateSession:', error);
    throw error;
  }
}

async function updateSession(redis, sessionId, sessionData) {
  try {
    await redis.set(`session:${sessionId}`, JSON.stringify(sessionData), 'EX', SESSION_TTL);
  } catch (error) {
    console.error('Error updating session:', error);
    throw error;
  }
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
