// src/store/useOrderStore.js
import { create } from 'zustand';

const API_BASE_URL = 'http://localhost:3001';

// Generate a simple user ID if not exists
const getUserId = () => {
  let userId = localStorage.getItem('userId') || 12345;
  return userId;
};

export const useOrderStore = create((set, get) => ({
  // State
  messages: [],
  currentOrder: { items: [], totalCost: 0, status: "draft" },
  userId: getUserId(),
  isLoading: false,
  isInitialized: false, // Track if session is initialized
  isOrderComplete: false,
  error: null,
  context: {
    previouslyMentionedItems: [],
    pendingConfirmations: [],
    userPreferences: { allergies: [], frequentOrders: [] }
  },

  // Initialize session only once on first render
  initializeSession: async () => {
    const { isInitialized } = get();
    if (isInitialized) return; // Only initialize once
    
    set({ isLoading: true, error: null });
    try {
      const userId = get().userId;
      const response = await fetch(`${API_BASE_URL}/get-session?userId=${userId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to start session');
      
      const data = await response.json();
      
      const welcomeMessage = "Welcome to NoshBites! 🍽️\n\nI'm your AI assistant here to help you explore our menu, place an order, or answer any questions you might have.\n\nYou can ask me things like:\n• What's on the menu today?\n• I'd like to order a burger\n• What are your specials?\n• I'm vegetarian, what do you recommend?\n\nHow can I assist you today?";
      
      set({
        messages: [
          { role: 'assistant', content: welcomeMessage },
        ],
        currentOrder: data.currentOrder || { items: [], totalCost: 0, status: "draft" },
        context: data.context || get().context,
        isInitialized: true,
        isOrderComplete: data.userIntent === 'complete'
      });
      
      return data;
    } catch (error) {
      set({ 
        error: 'Failed to start session',
        messages: [...get().messages, { role: 'assistant', content: 'Failed to start a new session. Please refresh to try again.' }]
      });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  sendMessage: async (message) => {
    const { userId } = get();
    set({ isLoading: true, error: null });

    try {
      // Add user message to the chat
      const userMessage = { role: 'user', content: message };
      set(state => ({ messages: [...state.messages, userMessage] }));

      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message,
          userId,
          history: get().messages
        }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      console.log(data.userIntent)
      
      const isComplete = data.userIntent === 'complete';
      
      set(state => ({
        messages: [...state.messages, { role: 'assistant', content: data.response }],
        currentOrder: data.currentOrder || state.currentOrder,
        context: data.context || state.context,
        isOrderComplete: isComplete
      }));
      
      return { isComplete };
    } catch (error) {
      set({ 
        error: 'Failed to send message',
        messages: [...get().messages, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]
      });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // Helper to get the current order total
  getOrderTotal: () => {
    const { currentOrder } = get();
    return currentOrder.items.reduce(
      (total, item) => total + (item.price * item.quantity),
      0
    );
  },

  // Clear the current session
  clearSession: () => {
    localStorage.removeItem('userId');
    // Generate a new user ID
    const newUserId = `user_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('userId', newUserId);
    
    set({
      messages: [],
      currentOrder: { items: [], totalCost: 0, status: "draft" },
      userId: newUserId,
      context: {
        previouslyMentionedItems: [],
        pendingConfirmations: [],
        userPreferences: { allergies: [], frequentOrders: [] }
      }
    });
    
    // Initialize a new session
    return get().initializeSession();
  }
}));