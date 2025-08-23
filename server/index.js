// server.js - Backend API
import express from 'express';
import cors from 'cors';
import { InferenceClient } from '@huggingface/inference';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3111; // Ensure this matches your frontend's API_BASE_URL

// Middleware
app.use(cors());
app.use(express.json()); // For parsing JSON request bodies

// Initialize Hugging Face client
const HF_ACCESS_TOKEN = process.env.HF_ACCESS_TOKEN;
if (!HF_ACCESS_TOKEN) {
    console.error("Error: Hugging Face API token not found. Please set HF_ACCESS_TOKEN in your .env file.");
    process.exit(1);
}

const inference = new InferenceClient(HF_ACCESS_TOKEN);
const MODEL_ID = 'google/gemma-2b-it'; // Your chosen model

// --- In-Memory Data Stores ---
// In a real application, these would be persistent databases (e.g., MongoDB, Redis)
// Maps sessionId -> { chatHistory: [], currentOrder: {} }
const sessions = new Map();
// Maps orderId -> { ...completedOrderData }
const completedOrders = new Map();

// --- Restaurant Menu Data ---
const MENU = {
    "categories": {
        "mains": {
            "name": "Main Dishes",
            "items": [
                { "id": "jollof_rice", "name": "Jollof Rice", "price": 2500, "description": "Spicy Nigerian rice with tomatoes and spices and chicken" },
                { "id": "fried_rice", "name": "Fried Rice", "price": 2800, "description": "Mixed vegetables fried rice and chicken" },
                { "id": "chicken_shawarma", "name": "Chicken Shawarma", "price": 2800, "description": "Grilled chicken with vegetables" },
                { "id": "pounded_yam", "name": "Pounded Yam with Egusi", "price": 3500, "description": "Traditional pounded yam with egusi soup" },
                { "id": "suya", "name": "Suya Platter", "price": 2000, "description": "Grilled spiced meat skewers" },
                { "id": "beef_burger", "name": "Beef Burger", "price": 2000, "description": "Beef burger with lettuce, tomato, and onion" }
            ]
        },
        "drinks": {
            "name": "Beverages",
            "items": [
                { "id": "zobo", "name": "Zobo Drink", "price": 800, "description": "Traditional Nigerian hibiscus drink" },
                { "id": "chapman", "name": "Chapman", "price": 1200, "description": "Nigerian cocktail with fruits" },
                { "id": "water", "name": "Bottled Water", "price": 300, "description": "500ml bottled water" },
                { "id": "5_alive", "name": "5 Alive", "price": 1500, "description": "5 Alive drink" },
                { "id": "soft_drink", "name": "Soft Drink", "price": 500, "description": "Coca-Cola, Pepsi, or Sprite" }
            ]
        },
        "sides": {
            "name": "Side Dishes",
            "items": [
                { "id": "plantain", "name": "Fried Plantain", "price": 800, "description": "Sweet fried plantain slices" },
                { "id": "moi_moi", "name": "Moi Moi", "price": 1000, "description": "Steamed bean pudding" },
                { "id": "salad", "name": "Garden Salad", "price": 1200, "description": "Fresh mixed vegetables" }
            ]
        }
    }
};

// --- Helper Functions for Order Management ---

/**
 * Creates a new session object with empty chat history and order.
 */
function createNewSession() {
    return {
        chatHistory: [],
        currentOrder: {
            items: [],
            totalCost: 0
        }
    };
}

/**
 * Finds a menu item by its name (case-insensitive, prefers exact match).
 * @param {string} name - The name of the item to find.
 * @returns {object|null} The menu item object or null if not found.
 */
function findMenuItem(name) {
    const lowerCaseName = name.toLowerCase().trim();
    let bestMatch = null;

    for (const categoryKey in MENU.categories) {
        for (const item of MENU.categories[categoryKey].items) {
            const itemLower = item.name.toLowerCase();
            // Prefer exact match
            if (itemLower === lowerCaseName) {
                return item;
            }
            // Fallback to fuzzy match (e.g., "jollof" for "Jollof Rice")
            if (itemLower.includes(lowerCaseName) || lowerCaseName.includes(itemLower)) {
                bestMatch = item;
            }
            // If the user's name is a subset of the item name or vice-versa
            // This is a simple form of fuzzy matching, you could enhance with a library if needed
        }
    }
    return bestMatch; // Return the best fuzzy match if no exact match
}

/**
 * Calculates the total cost of items in an order.
 * @param {Array<object>} items - An array of item objects with price and quantity.
 * @returns {number} The total cost.
 */
function calculateTotal(items) {
    return items.reduce((total, item) => total + (item.price * item.quantity), 0);
}

/**
 * Formats the menu data into a string for the AI's prompt.
 * @returns {string} The formatted menu text.
 */
function formatMenu() {
    let menuText = "=== RESTAURANT MENU ===\n";

    for (const [categoryKey, category] of Object.entries(MENU.categories)) {
        menuText += `\n${category.name.toUpperCase()}\n`;
        menuText += "".padEnd(category.name.length + 2, '-') + "\n";

        for (const item of category.items) {
            menuText += `${item.name} (₦${item.price.toLocaleString()}) - ${item.description}\n`;
        }
    }
    return menuText;
}

/**
 * Adds an item to the current session's order.
 * @param {object} menuItem - The menu item object from the MENU data.
 * @param {number} quantity - The quantity to add.
 * @param {object} session - The current session object.
 */
function addItemToOrder(menuItem, quantity, session) {
    // Ensure quantity is positive
    if (quantity <= 0) {
        console.warn(`[OrderBot] Attempted to add ${menuItem.name} with non-positive quantity: ${quantity}. Skipping.`);
        return;
    }

    const existingItem = session.currentOrder.items.find(item => item.id === menuItem.id);

    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        session.currentOrder.items.push({
            id: menuItem.id,
            name: menuItem.name,
            price: menuItem.price,
            quantity: quantity
        });
    }
    session.currentOrder.totalCost = calculateTotal(session.currentOrder.items);
}

/**
 * Removes an item from the current session's order.
 * @param {string} itemId - The ID of the item to remove.
 * @param {object} session - The current session object.
 */
function removeItemFromOrder(itemId, session) {
    const initialLength = session.currentOrder.items.length;
    session.currentOrder.items = session.currentOrder.items.filter(item => item.id === itemId);
    if (session.currentOrder.items.length < initialLength) {
        session.currentOrder.totalCost = calculateTotal(session.currentOrder.items);
    } else {
        console.warn(`[OrderBot] Attempted to remove item with ID ${itemId}, but it was not found in the order.`);
    }
}

/**
 * Updates the quantity of an item in the current session's order.
 * @param {string} itemId - The ID of the item to update.
 * @param {number} newQuantity - The new quantity.
 * @param {object} session - The current session object.
 */
function updateItemInOrder(itemId, newQuantity, session) {
    const item = session.currentOrder.items.find(item => item.id === itemId);

    if (item) {
        if (newQuantity <= 0) {
            removeItemFromOrder(itemId, session);
            console.log(`[OrderBot] Removed ${item.name} as new quantity was non-positive.`);
        } else {
            item.quantity = newQuantity;
            session.currentOrder.totalCost = calculateTotal(session.currentOrder.items);
        }
    } else {
        console.warn(`[OrderBot] Attempted to update item with ID ${itemId}, but it was not found in the order.`);
    }
}

/**
 * Processes special order instructions (ORDER_ADD, ORDER_REMOVE, ORDER_UPDATE) from AI's response.
 * @param {string} aiResponse - The raw response string from the AI.
 * @param {object} session - The current session object.
 */
function processOrderInstructions(aiResponse, session) {
    // Process ADDitions first as they might create items that subsequent UPDATES refer to
    const addMatches = aiResponse.match(/ORDER_ADD:([^|]+)\|QUANTITY:(\d+)/gi);
    if (addMatches) {
        addMatches.forEach(match => {
            const [, itemName, quantityStr] = match.match(/ORDER_ADD:([^|]+)\|QUANTITY:(\d+)/i);
            const quantity = parseInt(quantityStr, 10);
            const menuItem = findMenuItem(itemName.trim());

            if (menuItem) {
                addItemToOrder(menuItem, quantity, session);
                console.log(`[OrderBot] Processed ADD: ${quantity}x ${menuItem.name}`);
            } else {
                console.warn(`[OrderBot] Could not find menu item for ORDER_ADD: "${itemName}".`);
            }
        });
    }

    // Process REMOVALS
    const removeMatches = aiResponse.match(/ORDER_REMOVE:([^|]+)/gi);
    if (removeMatches) {
        removeMatches.forEach(match => {
            const [, itemName] = match.match(/ORDER_REMOVE:([^|]+)/i);
            const menuItem = findMenuItem(itemName.trim()); // Find by name, then use its ID for removal

            if (menuItem) {
                removeItemFromOrder(menuItem.id, session);
                console.log(`[OrderBot] Processed REMOVE: ${menuItem.name}`);
            } else {
                console.warn(`[OrderBot] Could not find menu item for ORDER_REMOVE: "${itemName}".`);
            }
        });
    }

    // Process UPDATES
    const updateMatches = aiResponse.match(/ORDER_UPDATE:([^|]+)\|QUANTITY:(\d+)/gi);
    if (updateMatches) {
        updateMatches.forEach(match => {
            const [, itemName, quantityStr] = match.match(/ORDER_UPDATE:([^|]+)\|QUANTITY:(\d+)/i);
            const newQuantity = parseInt(quantityStr, 10);
            const menuItem = findMenuItem(itemName.trim()); // Find by name, then use its ID for update

            if (menuItem) {
                updateItemInOrder(menuItem.id, newQuantity, session);
                console.log(`[OrderBot] Processed UPDATE: ${menuItem.name} to quantity ${newQuantity}`);
            } else {
                console.warn(`[OrderBot] Could not find menu item for ORDER_UPDATE: "${itemName}".`);
            }
        });
    }
}

/**
 * Generates a summary of the current order for the AI's prompt.
 * @param {object} session - The current session object.
 * @returns {string} The formatted order summary.
 */
function getCurrentOrderSummary(session) {
    if (session.currentOrder.items.length === 0) {
        return "Your cart is currently empty.";
    }

    let summary = "=== CURRENT ORDER ===\n";
    session.currentOrder.items.forEach(item => {
        summary += `${item.name} x${item.quantity} - ₦${(item.price * item.quantity).toLocaleString()}\n`;
    });
    summary += `\nTOTAL: ₦${session.currentOrder.totalCost.toLocaleString()}`;

    return summary;
}

// --- API Routes ---

// Get menu
app.get('/api/menu', (req, res) => {
    res.json(MENU);
});

// Start new session
app.post('/api/session/start', (req, res) => {
    const sessionId = uuidv4(); // Generate a unique ID for the session
    const session = createNewSession(); // Create a new empty session object
    sessions.set(sessionId, session); // Store the session

    // Initial greeting message from the AI (can be a fixed string or from an AI call)
    const initialMessage = "Welcome to our Nigerian restaurant! I'm here to help you place your order. What would you like to eat today?";
    session.chatHistory.push({ role: 'assistant', content: initialMessage }); // Add to history

    res.json({
        sessionId,
        message: initialMessage,
        currentOrder: session.currentOrder
    });
});

// Process chat message
app.post('/api/chat', async (req, res) => {
    try {
        const { sessionId, message } = req.body; // Expect sessionId and message from frontend

        // Validate session
        if (!sessionId || !sessions.has(sessionId)) {
            return res.status(400).json({ error: 'Invalid or missing session ID. Please start a new session.' });
        }

        const session = sessions.get(sessionId); // Retrieve the session

        // Add user's message to chat history
        session.chatHistory.push({ role: 'user', content: message });

        // --- AI System Prompt ---
        // This is the core instruction for the AI, including the menu and order commands.
        const systemPrompt = `You are an AI assistant for a Nigerian restaurant taking orders. Your job is to:

1.  Help customers understand the menu.
2.  Take their orders accurately.
3.  Use the special ORDER commands when managing items in their cart.
4.  Provide conversational responses to the user AFTER you have generated any ORDER commands.

MENU:
${formatMenu()}

CURRENT ORDER STATUS:
${getCurrentOrderSummary(session)}

INSTRUCTIONS FOR ORDER MANAGEMENT:
- You MUST use the exact 'Item Name' as it appears in the MENU or is currently in the 'CURRENT ORDER STATUS' for any ORDER commands.
- If the user specifies a quantity, use it. If not, default to 1.
- If an item is not found on the MENU, you MUST respond conversationally that you don't have it and DO NOT generate an ORDER command for it.

ORDER COMMAND FORMATS (generate these directly in your response, then follow with conversation):
- To add an item: ORDER_ADD:Item Name|QUANTITY:number
- To remove an item: ORDER_REMOVE:Item Name
- To update the quantity of an item: ORDER_UPDATE:Item Name|QUANTITY:number (use this for "change to X" or "I want X instead")

IMPORTANT EXAMPLES (for your internal generation, not for user):
Customer: "I want 1 jollof rice" → ORDER_ADD:Jollof Rice|QUANTITY:1 Certainly, Jollof Rice added to your order!
Customer: "Remove the fried rice" → ORDER_REMOVE:Fried Rice Alright, Fried Rice has been removed.
Customer: "Make that 2 jollof rice" → ORDER_UPDATE:Jollof Rice|QUANTITY:2 Got it, updated Jollof Rice to 2!
Customer: "I want sprite" → ORDER_ADD:Soft Drink|QUANTITY:1 Sure, a Soft Drink added. Which type of soft drink would you like (Coca-Cola, Pepsi, or Sprite)?
Customer: "What's on the menu?" → Here is our delightful menu: ...
Customer: "What's my current order?" → Your current order status: ...
Customer: "Do you have pizza?" → I'm sorry, we don't have pizza on our menu. We specialize in Nigerian dishes like Jollof Rice and Suya.
`;

        // Prepare messages for the AI (system prompt + full chat history)
        const messages = [
            { role: 'system', content: systemPrompt },
            // Filter out system messages from chatHistory for the actual AI call if you wish,
            // but for simple models, including them can sometimes help reinforce the persona.
            // A more advanced approach might regenerate the system prompt for each call.
            ...session.chatHistory
        ];

        // Make the API call to Hugging Face
        const response = await inference.chatCompletion({
            model: MODEL_ID,
            messages: messages,
            max_tokens: 200, // Max tokens for AI's response
            temperature: 0.7, // Balance creativity and consistency
        });

        if (response && response.choices && response.choices.length > 0) {
            const aiContent = response.choices[0].message.content;

            // 1. Process any order instructions extracted by the AI
            // IMPORTANT: processOrderInstructions needs to parse commands first, then AI's actual conversational response is used for display
            processOrderInstructions(aiContent, session);

            // 2. Clean up the AI's response for the user (remove internal ORDER commands)
            const cleanResponse = aiContent
                .replace(/ORDER_ADD:[^|]+\|QUANTITY:\d+/gi, '')
                .replace(/ORDER_REMOVE:[^|]+/gi, '')
                .replace(/ORDER_UPDATE:[^|]+\|QUANTITY:\d+/gi, '')
                .trim();

            // 3. Add AI's clean conversational response to chat history
            session.chatHistory.push({ role: 'assistant', content: cleanResponse });

            // 4. Send response back to the client
            res.json({
                response: cleanResponse,
                currentOrder: session.currentOrder // Send the updated order state
            });

        } else {
            console.warn("AI did not return a valid response.");
            const errorResponse = "I'm sorry, I couldn't get a clear response from the AI. Please try again or rephrase.";
            session.chatHistory.push({ role: 'assistant', content: errorResponse });
            res.status(500).json({ error: 'AI did not return a valid response', response: errorResponse });
        }

    } catch (error) {
        console.error("Error in chat endpoint:", error);

        let userFacingError = 'An unexpected error occurred. Please try again.';
        if (error.status === 429) {
            userFacingError = 'We are experiencing high traffic. Please try again in a moment (rate limit).';
            res.status(429).json({ error: userFacingError, response: userFacingError });
        } else if (error.httpResponse && error.httpResponse.status === 401) {
            userFacingError = 'Authentication error with the AI service. Please check your Hugging Face token.';
            res.status(401).json({ error: userFacingError, response: userFacingError });
        } else {
            res.status(500).json({ error: userFacingError, response: userFacingError });
        }
        // Add error message to chat history for continuity if needed
        const session = sessions.get(req.body.sessionId); // Retrieve session again if it exists
        if (session) {
            session.chatHistory.push({ role: 'assistant', content: userFacingError });
        }
    }
});

// Get current order
app.get('/api/order/:sessionId', (req, res) => {
    const { sessionId } = req.params;

    if (!sessions.has(sessionId)) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessions.get(sessionId);
    res.json(session.currentOrder);
});

// Update order item quantity (direct API call, not via AI)
app.put('/api/order/:sessionId/item/:itemId', (req, res) => {
    const { sessionId, itemId } = req.params;
    const { quantity } = req.body;

    if (!sessions.has(sessionId)) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessions.get(sessionId);
    const item = session.currentOrder.items.find(item => item.id === itemId);

    if (!item) {
        return res.status(404).json({ error: 'Item not found in order' });
    }

    // Re-use the update logic
    updateItemInOrder(itemId, quantity, session);
    // Recalculate total is handled inside updateItemInOrder/removeItemFromOrder

    res.json(session.currentOrder);
});

// Complete order (AI will detect intent to finalize, but this is the actual endpoint)
app.post('/api/order/:sessionId/complete', (req, res) => {
    const { sessionId } = req.params;
    const { customerInfo } = req.body; // e.g., { name: "John Doe", address: "123 Main St" }

    if (!sessions.has(sessionId)) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessions.get(sessionId);

    if (session.currentOrder.items.length === 0) {
        return res.status(400).json({ error: 'Cannot complete an empty order.' });
    }

    // Finalize order
    const orderId = uuidv4();
    const completedOrder = {
        ...session.currentOrder, // Copy current items and totalCost
        id: orderId,
        status: 'confirmed',
        timestamp: new Date().toISOString(),
        customerInfo: customerInfo || {} // Add customer details if provided
    };

    // Store completed order (simulating database save)
    completedOrders.set(orderId, completedOrder);

    // Clean up session (important: session is now "done")
    sessions.delete(sessionId);

    res.json({
        message: `Order #${orderId} has been successfully placed!`,
        order: completedOrder
    });
});

// Get a specific completed order
app.get('/api/order/completed/:orderId', (req, res) => {
    const { orderId } = req.params;

    if (!completedOrders.has(orderId)) {
        return res.status(404).json({ error: 'Order not found' });
    }

    res.json(completedOrders.get(orderId));
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📋 API endpoints available:`);
    console.log(`   GET  /api/menu - Get restaurant menu`);
    console.log(`   POST /api/session/start - Start new ordering session`);
    console.log(`   POST /api/chat - Send chat message`);
    console.log(`   GET  /api/order/:sessionId - Get current provisional order`);
    console.log(`   PUT  /api/order/:sessionId/item/:itemId - Update item quantity in provisional order (direct)`);
    console.log(`   POST /api/order/:sessionId/complete - Finalize and complete order`);
    console.log(`   GET  /api/order/completed/:orderId - Get a completed order`);
    console.log(`   GET  /api/health - Health check`);
});

// Export app for potential testing (e.g., with Supertest)
export default app;