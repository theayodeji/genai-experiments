import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { getRedisClient } from './lib/redis.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { MENU } from './lib/constants.js';
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const SESSION_TTL = 86400; // 24 hours in seconds
const MODEL_NAME = "gemini-2.5-flash-lite";
const apiKey = process.env.GEMINI_API_KEY;

const app = express();

app.use(express.json());
app.use(cors());

// API routes with /api prefix
const apiRouter = express.Router();

// API root
apiRouter.get("/", (req, res) => {
    res.json({ message: "API is running" });
});

// Chat endpoint
apiRouter.post('/chat', async (req, res) => {
    try {
        const {message, history, userId} = req.body;
        const userSession = await getUserSession(userId);
        
        if (!userId) {
            return res.status(400).json({error: 'User ID is required'});
        }
        
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
        4. Provide conversational responses to the user, be semi-formal.
        5. Maintain context from previous messages and follow the train of thought.
        6. Try to use a nigerian tone and style of speech once in a few messages

        PREVIOUS MESSAGES:
        ${formattedHistory || "No previous messages"}

        CURRENT ORDER STATE:
        ${JSON.stringify(userSession.order, null, 2)}

        RESPONSE FORMAT (JSON):
        {
            "userIntent": "order" | "cancel" | "update" | "complete",
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
            When the user specifies an order, ask if that will be all and try to add some suggestions.
            When the order is completed, userIntent MUST be set to "complete" in the response object, then direct the user to the order confirmation page that will be displayed below the final message.

        MENU:
        ${JSON.stringify(MENU, null, 2)}

        IMPORTANT: Your response MUST be a valid JSON object. Do NOT include any other text, markdown, code blocks, or formatting. 
        Your response will be directly parsed as JSON, so it must be valid JSON and nothing else.
        Here is the current message: ${message}
        `
        
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                response_mime_type: "application/json",
            },
        });

        const response = JSON.parse(result.response.text().trim());

        const newSession = {
            ...userSession,
            order: response.currentOrder,
            context: response.context,
        }

        await updateSession(userId, newSession);

        return res.json({
            ...response,
            sessionId: userId,
        });

        
    } catch (error) {
        console.error('Error in chat endpoint:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});

// Get session endpoint
apiRouter.get('/get-session', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        const session = await getUserSession(userId);
        res.json(session);
    } catch (error) {
        console.error('Error in getSession endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Mount API router at /api
app.use('/api', apiRouter);

// Serve static files from React app (Vite uses 'dist' as the default output directory)
const clientBuildPath = path.join(__dirname, "../client/dist");
app.use(express.static(clientBuildPath));

// Handle React routing, return all requests to React app
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(clientBuildPath, "index.html"));
});

let redis; 

(async () => {
    try {
        redis = await getRedisClient();
    } catch (error) {
        console.error('Failed to connect to Redis:', error);
        process.exit(1);
    }
})();

async function getUserSession(userId){
    try {
        const userSession = await redis.get(`user:${userId}`);
        if(!userSession){
            const sessionData = {
                order: {items: [], totalCost: 0, status: "draft"},
                context: {
                    previouslyMentionedItems: [],
                    pendingConfirmations: [],
                    userPreferences: { allergies: [], frequentOrders: [] }
                }
            }
            await redis.set(`user:${userId}`, JSON.stringify({data: sessionData}), 'EX', SESSION_TTL);
            return sessionData;
        }

        return JSON.parse(userSession).data;
    } catch (error) {
        console.error('Error in getUserSession:', error);
        throw error;
    }
}

async function updateSession(userId, sessionData){
    try {
        await redis.set(`user:${userId}`, JSON.stringify({data: sessionData}), 'EX', SESSION_TTL);
    } catch (error) {
        console.error('Error updating session:', error);
        throw error;
    }
}

app.listen(3001, () => {
    console.log("Server is running on port 3001");
});
