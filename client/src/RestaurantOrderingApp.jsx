import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ShoppingCart, CheckCircle, MessageCircle, Menu as MenuIcon } from 'lucide-react';
import { useOrderStore } from './store/useOrderStore';

const API_BASE_URL = 'http://localhost:3001';

const RestaurantOrderingApp = () => {
  const [currentMessage, setCurrentMessage] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);
  const messagesEndRef = useRef(null);

  const {
    initializeSession,
    sendMessage,
    messages,
    currentOrder,
    isLoading,
    error,
    userId,
    clearSession,
    isOrderCompleted
  } = useOrderStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();

  }, [messages]);

  useEffect(() => {
    initializeSession();
    
    return () => clearSession();
    
  }, [initializeSession]);

  const handleSendMessage = async () => {
    if (!currentMessage.trim()) return;
    
    const message = currentMessage.trim();
    setCurrentMessage('');
    
    try {
      const { isComplete } = await sendMessage(message);
      if (isComplete) {
        setShowCart(true);
      }
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const completeOrder = useCallback(async () => {
    if (!currentOrder?.items?.length) {
      alert("Your cart is empty. Please add items before completing the order.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/complete-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          order: currentOrder,
          customerInfo: {
            name: "Guest Customer",
            phone: "N/A",
            address: "N/A"
          },
        }),
      });

      if (response.ok) {
        const { order } = await response.json();
        setCompletedOrder(order);
        // Clear the current session and start a new one
        await clearSession();
        setShowCart(false);
      } else {
        const errorData = await response.json();
        console.error('Error completing order:', errorData.error);
        alert(`Failed to complete order: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error completing order:', error);
      alert('Network error while completing order.');
    }
  }, [currentOrder, userId, clearSession]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { // Prevent new line on Enter
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Menu is now handled through the chat interface
  const MenuDisplay = () => (
    <div className="p-4 bg-white rounded-lg shadow-lg max-h-96 overflow-y-auto">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">How to Order</h2>
      <p className="mb-4 text-gray-600">You can ask our AI assistant about our menu items, prices, and place your order through the chat.</p>
      <div className="space-y-2">
        <p className="font-medium">Try saying:</p>
        <ul className="list-disc pl-5 space-y-1 text-gray-700">
          <li>"What's on the menu?"</li>
          <li>"I'd like to order a burger"</li>
          <li>"What are your specials?"</li>
          <li>"I'm vegetarian, what do you recommend?"</li>
        </ul>
      </div>
    </div>
  );

  // Cart display component
  const CartDisplay = () => {
    const items = currentOrder?.items || [];
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    return (
      <div className="p-4 bg-white rounded-lg shadow-lg max-h-96 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Your Order</h2>
        {items.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Your cart is empty</p>
        ) : (
          <>
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg mb-2">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-800">{item.name}</h4>
                  <p className="text-sm text-gray-600">₦{item.price.toLocaleString()} × {item.quantity}</p>
                </div>
                <div className="text-right">
                  <span className="font-bold">₦{(item.price * item.quantity).toLocaleString()}</span>
                </div>
              </div>
            ))}
            <div className="border-t pt-4 mt-4">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xl font-bold">Total: ₦{total.toLocaleString()}</span>
              </div>
              <button
                onClick={completeOrder}
                className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading || items.length === 0}
              >
                Complete Order
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  // Component for Order Confirmation Modal
  const OrderConfirmation = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="text-center">
          <CheckCircle className="mx-auto text-green-600 mb-4" size={48} />
          <h2 className="text-2xl font-bold mb-4 text-gray-800">Order Confirmed!</h2>
          <p className="text-gray-600 mb-4">
            Your order has been successfully placed. Thank you for your business!
          </p>
          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <p className="font-medium">Order ID: {completedOrder?.id || 'N/A'}</p>
            <p className="text-sm text-gray-600">Total: ₦{completedOrder?.totalCost?.toLocaleString() || '0'}</p>
          </div>
          <button
            onClick={() => {
              setCompletedOrder(null); // Hide modal
              initializeSession(); // Start a new session
            }}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Start New Order
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">🍽️ NoshBites</h1>
              <p className="text-gray-600">AI "Chopping" Assistant</p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center space-x-2 bg-orange-100 text-orange-700 px-4 py-2 rounded-lg hover:bg-orange-200 transition-colors"
              >
                <MenuIcon size={20} />
                <span>Menu</span>
              </button>
              <button
                onClick={() => setShowCart(!showCart)}
                className="flex items-center space-x-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200 transition-colors relative"
              >
                <ShoppingCart size={20} />
                <span>Cart</span>
                {currentOrder?.items?.length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {currentOrder.items.reduce((sum, item) => sum + (item.quantity || 0), 0)}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Chat Interface */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-lg h-[80dvh] flex flex-col">
              <div className="p-4 border-b bg-orange-600 text-white rounded-t-lg">
                <div className="flex items-center space-x-2">
                  <MessageCircle size={20} />
                  <h2 className="font-medium">Chat with our AI Assistant</h2>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((message, index) => (
                  <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] px-4 py-2 rounded-lg ${
                      message.role === 'user' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {message.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                    </div>
                  </div>
                )}
                {error && (
                  <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
                    <p>{error}</p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              
              <div className="p-4 border-t">
                <div className="flex">
                  <input
                    type="text"
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your message..."
                    className="flex-1 border rounded-l-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300"
                    disabled={isLoading}
                  />
                  <button
                    onClick={handleSendMessage}
                    className="bg-orange-600 text-white px-4 py-2 rounded-r-lg hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-50"
                    disabled={!currentMessage.trim() || isLoading}
                  >
                    <Send size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 lg:col-span-1"> {/* Ensure it takes 1 column on large screens */}
            {showMenu && <MenuDisplay />}
            {showCart && <CartDisplay />}
            
            {/* Order Summary (always visible) */}
            <div className="bg-white rounded-lg shadow-lg p-4">
              <h3 className="font-bold text-gray-800 mb-2">Quick Summary</h3>
              {currentOrder.items.length === 0 ? (
                <p className="text-gray-500 text-sm">No items in cart</p>
              ) : (
                <div className="space-y-1">
                  {currentOrder.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span>{item.name} x{item.quantity}</span>
                      <span>₦{(item.price * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between font-bold">
                      <span>Total:</span>
                      <span>₦{currentOrder.totalCost.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Order Confirmation Modal */}
      {completedOrder && <OrderConfirmation />}
    </div>
  );
};

export default RestaurantOrderingApp;