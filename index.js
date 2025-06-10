// index.js
import { InferenceClient } from '@huggingface/inference';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid'; // You'll need to install: npm install uuid

// Load environment variables
dotenv.config();

const HF_ACCESS_TOKEN = process.env.HF_ACCESS_TOKEN;

if (!HF_ACCESS_TOKEN) {
    console.error("Error: Hugging Face API token not found. Please set HF_ACCESS_TOKEN in your .env file.");
    process.exit(1);
}

const inference = new InferenceClient(HF_ACCESS_TOKEN);

// --- Define the AI Model to Use ---
const MODEL_ID = 'gemma-2b-it';

// --- Sample Restaurant Menu ---
const MENU = {
    "categories": {
        "mains": {
            "name": "Main Dishes",
            "items": [
                { "id": "jollof_rice", "name": "Jollof Rice", "price": 2500, "description": "Spicy Nigerian rice with tomatoes and spices" },
                { "id": "fried_rice", "name": "Fried Rice", "price": 2800, "description": "Mixed vegetables fried rice" },
                { "id": "pounded_yam", "name": "Pounded Yam with Egusi", "price": 3500, "description": "Traditional pounded yam with egusi soup" },
                { "id": "suya", "name": "Suya Platter", "price": 2000, "description": "Grilled spiced meat skewers" }
            ]
        },
        "drinks": {
            "name": "Beverages",
            "items": [
                { "id": "zobo", "name": "Zobo Drink", "price": 800, "description": "Traditional Nigerian hibiscus drink" },
                { "id": "chapman", "name": "Chapman", "price": 1200, "description": "Nigerian cocktail with fruits" },
                { "id": "water", "name": "Bottled Water", "price": 300, "description": "500ml bottled water" },
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

// --- Global variables for order management ---
let chatHistory = [];
let currentOrder = {
    id: null,
    items: [],
    totalCost: 0,
    status: 'pending',
    timestamp: null
};

// --- Helper Functions ---
function generateOrderId() {
    return uuidv4();
}

function findMenuItem(itemName) {
    const normalizedName = itemName.toLowerCase().trim();
    
    for (const category of Object.values(MENU.categories)) {
        for (const item of category.items) {
            if (item.name.toLowerCase().includes(normalizedName) || 
                item.id.toLowerCase().includes(normalizedName) ||
                normalizedName.includes(item.name.toLowerCase().split(' ')[0])) {
                return item;
            }
        }
    }
    return null;
}

function calculateTotal(items) {
    return items.reduce((total, item) => total + (item.price * item.quantity), 0);
}

function formatMenu() {
    let menuText = "=== RESTAURANT MENU ===\n";
    
    for (const [categoryKey, category] of Object.entries(MENU.categories)) {
        menuText += `\n${category.name.toUpperCase()}\n`;
        menuText += "".padEnd(category.name.length + 2, '-') + "\n";
        
        for (const item of category.items) {
            menuText += `${item.name} - ₦${item.price.toLocaleString()}\n`;
            menuText += `  ${item.description}\n\n`;
        }
    }
    
    return menuText;
}

function processOrderInstructions(aiResponse) {
    // Look for specific order-related instructions in AI response
    const orderMatches = aiResponse.match(/ORDER_ADD:([^|]+)\|QUANTITY:(\d+)/gi);
    
    if (orderMatches) {
        orderMatches.forEach(match => {
            const [, itemName, quantity] = match.match(/ORDER_ADD:([^|]+)\|QUANTITY:(\d+)/i);
            const menuItem = findMenuItem(itemName.trim());
            
            if (menuItem) {
                addItemToOrder(menuItem, parseInt(quantity));
            }
        });
    }
}

function addItemToOrder(menuItem, quantity = 1) {
    const existingItem = currentOrder.items.find(item => item.id === menuItem.id);
    
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        currentOrder.items.push({
            id: menuItem.id,
            name: menuItem.name,
            price: menuItem.price,
            quantity: quantity
        });
    }
    
    currentOrder.totalCost = calculateTotal(currentOrder.items);
}

function finalizeOrder() {
    if (currentOrder.items.length === 0) {
        return null;
    }
    
    currentOrder.id = generateOrderId();
    currentOrder.timestamp = new Date().toISOString();
    currentOrder.status = 'confirmed';
    
    return { ...currentOrder };
}

function getCurrentOrderSummary() {
    if (currentOrder.items.length === 0) {
        return "Your cart is currently empty.";
    }
    
    let summary = "=== CURRENT ORDER ===\n";
    currentOrder.items.forEach(item => {
        summary += `${item.name} x${item.quantity} - ₦${(item.price * item.quantity).toLocaleString()}\n`;
    });
    summary += `\nTOTAL: ₦${currentOrder.totalCost.toLocaleString()}`;
    
    return summary;
}

// --- AI Order Processing Function ---
async function processOrderWithAI(userMessage) {
    try {
        chatHistory.push({ role: 'user', content: userMessage });

        console.log(`\nCustomer: ${userMessage}`);

        const systemPrompt = `You are an AI assistant for a Nigerian restaurant taking orders. Your job is to:

1. Help customers understand the menu
2. Take their orders accurately
3. Use the special ORDER_ADD format when adding items

MENU:
${formatMenu()}

CURRENT ORDER STATUS:
${getCurrentOrderSummary()}

INSTRUCTIONS:
- When a customer wants to add an item, use this exact format: ORDER_ADD:item_name|QUANTITY:number
- Be friendly and helpful
- Suggest items when appropriate
- Ask for clarification if needed
- Keep responses concise and natural
- Don't include internal processing in your response

EXAMPLES:
Customer: "I want jollof rice" → Response should include: ORDER_ADD:Jollof Rice|QUANTITY:1
Customer: "Two bottles of water" → Response should include: ORDER_ADD:Bottled Water|QUANTITY:2`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...chatHistory
        ];

        const response = await inference.chatCompletion({
            model: MODEL_ID,
            messages: messages,
            max_tokens: 200,
            temperature: 0.7,
        });

        if (response && response.choices && response.choices.length > 0) {
            const aiContent = response.choices[0].message.content;
            
            // Process any order instructions
            processOrderInstructions(aiContent);
            
            // Clean up the response (remove ORDER_ADD instructions from customer-facing response)
            const cleanResponse = aiContent.replace(/ORDER_ADD:[^|]+\|QUANTITY:\d+/gi, '').trim();
            
            chatHistory.push({ role: 'assistant', content: cleanResponse });

            console.log("\nAI Response:");
            console.log(cleanResponse);
            
            if (currentOrder.items.length > 0) {
                console.log("\n" + getCurrentOrderSummary());
            }
            
            return cleanResponse;
        } else {
            console.warn("AI did not return a valid response.");
            return "I'm sorry, I couldn't process your request right now.";
        }

    } catch (error) {
        console.error("Error calling Hugging Face API:", error);
        if (error.status === 429) {
            return "I'm experiencing high traffic right now. Please try again in a moment.";
        } else if (error.httpResponse && error.httpResponse.status === 401) {
            return "Authentication error. Please check your API access.";
        }
        return "I'm sorry, an unexpected error occurred. Please try again.";
    }
}

// --- Main Functions ---
async function startOrderSession() {
    console.log("=== WELCOME TO OUR NIGERIAN RESTAURANT ===");
    console.log("AI-powered ordering system ready!");
    console.log(formatMenu());
    
    // Reset order for new session
    currentOrder = {
        id: null,
        items: [],
        totalCost: 0,
        status: 'pending',
        timestamp: null
    };
    chatHistory = [];
    
    return await processOrderWithAI("Hello! I'd like to see your menu and place an order.");
}

async function takeOrder(customerMessage) {
    return await processOrderWithAI(customerMessage);
}

function completeOrder() {
    const finalOrder = finalizeOrder();
    
    if (finalOrder) {
        console.log("\n=== ORDER COMPLETED ===");
        console.log("Final Order JSON:");
        console.log(JSON.stringify(finalOrder, null, 2));
        
        // Reset for next customer
        currentOrder = {
            id: null,
            items: [],
            totalCost: 0,
            status: 'pending',
            timestamp: null
        };
        
        return finalOrder;
    } else {
        console.log("No items in order to complete.");
        return null;
    }
}

// --- Demo Usage ---
async function runOrderDemo() {
    // Start the session
    await startOrderSession();
    
    // Simulate customer ordering
    await takeOrder("I want jollof rice and chapman drink");
    await takeOrder("Can I also get fried plantain?");
    await takeOrder("Actually, make that two jollof rice");
    await takeOrder("That's all, I'm ready to order");
    
    // Complete the order
    const finalOrder = completeOrder();
    
    return finalOrder;
}

// --- Export functions for use in other modules ---
export {
    startOrderSession,
    takeOrder,
    completeOrder,
    getCurrentOrderSummary,
    MENU
};

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runOrderDemo().then(order => {
        console.log("\n=== DEMO COMPLETED ===");
        if (order) {
            console.log("Final order object:", order);
        }
    }).catch(console.error);
}