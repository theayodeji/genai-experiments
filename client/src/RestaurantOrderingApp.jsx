import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  CheckCircle,
  ShoppingCart,
  MessageCircle,
  Menu as MenuIcon,
} from "lucide-react";
import { useOrderStore } from "./store/useOrderStore";
import MenuModal from "./components/MenuModal";

const RestaurantOrderingApp = () => {
  const [currentMessage, setCurrentMessage] = useState("");
  const [showCart, setShowCart] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);
  const messagesEndRef = useRef(null);

  const {
    initializeSession,
    sendMessage,
    messages,
    currentOrder,
    isLoading,
    error,
    reset,
    clearSession,
  } = useOrderStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
    setCurrentMessage("");

    try {
      const { isComplete } = await sendMessage(message);
      if (isComplete) {
        setShowCart(true);
      }
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  const completeOrder = useCallback(async () => {
    if (!currentOrder?.items?.length) {
      alert(
        "Your cart is empty. Please add items before completing the order."
      );
      return;
    }
    setCompletedOrder(currentOrder);
    // Clear the current session and start a new one
    await clearSession();
    reset();
    setShowCart(false);
  }, [currentOrder, clearSession, reset]);

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // Prevent new line on Enter
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleMenu = useCallback(() => setIsMenuOpen((prev) => !prev), []);

  // Cart display component
  const CartDisplay = () => {
    const items = currentOrder?.items || [];
    const total = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    return (
      <div className="p-4 bg-white rounded-lg shadow-lg max-h-96 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Your Order</h2>
        {items.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Your cart is empty</p>
        ) : (
          <>
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg mb-2"
              >
                <div className="flex-1">
                  <h4 className="font-medium text-gray-800">{item.name}</h4>
                  <p className="text-sm text-gray-600">
                    ₦{item.price.toLocaleString()} × {item.quantity}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-bold">
                    ₦{(item.price * item.quantity).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
            <div className="border-t pt-4 mt-4">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xl font-bold">
                  Total: ₦{total.toLocaleString()}
                </span>
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

// Memoized OrderConfirmation component outside the main component
const OrderConfirmation = React.memo(({ completedOrder, onClose }) => {
  if (!completedOrder) return null;

  return (
    <AnimatePresence>
      <motion.div 
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div 
          className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ 
            type: "spring",
            damping: 20,
            stiffness: 300
          }}
        >
          <motion.div 
            className="text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 20
              }}
            >
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            </motion.div>
            
            <motion.h3 
              className="text-2xl font-bold text-gray-900 mb-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              Order Placed Successfully!
            </motion.h3>
            
            <motion.p 
              className="text-gray-600 mb-6 text-lg"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              Your order has been received and is being prepared.
            </motion.p>
            
            <motion.div 
              className="bg-gray-50 p-4 rounded-xl mb-6 text-left space-y-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <h4 className="font-semibold text-gray-900 text-lg mb-2">Order Summary:</h4>
                {completedOrder.items.map((item, index) => (
                  <motion.div 
                    key={item.id} 
                    className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-0"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + (index * 0.05) }}
                  >
                    <span className="text-gray-700">
                      {item.name} ×{item.quantity}
                    </span>
                    <span className="font-medium">₦{(item.price * item.quantity).toLocaleString()}</span>
                  </motion.div>
                ))}
                <motion.div 
                  className="border-t border-gray-200 mt-3 pt-3 font-medium text-base"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + (completedOrder.items.length * 0.05) }}
                >
                  <div className="flex justify-between">
                    <span>Total:</span>
                    <span className="text-lg text-green-600">₦{completedOrder.totalCost.toLocaleString()}</span>
                  </div>
                </motion.div>
              </motion.div>
              
              <motion.button
                onClick={() => setCompletedOrder(null)}
                className="w-full bg-green-600 text-white py-3 px-6 rounded-xl hover:bg-green-700 transition-all 
                           font-medium text-lg shadow-md hover:shadow-lg active:scale-95"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + (completedOrder.items.length * 0.05) }}
              >
                Start New Order
              </motion.button>
            </motion.div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-red-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                <img src="/logo.png" alt="Logo" className="w-8 h-8 inline mr-2" />
                NoshBites
              </h1>
              <p className="text-gray-600">AI "Chopping" Assistant</p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={toggleMenu}
                className="p-2 flex items-center rounded-md text-gray-600 hover:bg-gray-100"
                title="View Menu"
              >
                <MenuIcon className="h-5 w-5 inline mr-2"  />
                <span className="inline">Menu</span>
              </button>
              <button
                onClick={() => setShowCart(!showCart)}
                className="flex items-center space-x-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200 transition-colors relative"
              >
                <ShoppingCart size={20} />
                <span>Cart</span>
                {currentOrder?.items?.length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {currentOrder.items.reduce(
                      (sum, item) => sum + (item.quantity || 0),
                      0
                    )}
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
              <div className="p-4 border-b bg-green-600 text-white rounded-t-lg">
                <div className="flex items-center space-x-2">
                  <MessageCircle size={20} />
                  <h2 className="font-medium">Chat with our AI Assistant</h2>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <AnimatePresence>
                  {messages.map((message, index) => (
                    <motion.div
                      key={index}
                      className={`flex ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, x: message.role === "user" ? 20 : -20, scale: 0.9 }}
                      transition={{
                        type: "spring",
                        damping: 25,
                        stiffness: 300,
                        duration: 0.2
                      }}
                      layout
                    >
                      <motion.div
                        className={`max-w-[75%] px-4 py-2 rounded-2xl ${
                          message.role === "user"
                            ? "bg-blue-600 text-white rounded-br-none"
                            : "bg-gray-100 text-gray-800 rounded-bl-none"
                        } shadow-sm`}
                         whileTap={{ 
                          scale: 0.98,
                          boxShadow: "0 2px 6px rgba(0,0,0,0.1)"
                        }}
                        layout="position"
                      >
                        {message.content}
                      </motion.div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div
                          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                          style={{ animationDelay: "0.1s" }}
                        ></div>
                        <div
                          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                          style={{ animationDelay: "0.2s" }}
                        ></div>
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

              <div className="p-4 border-t border-neutral-300">
                <motion.div 
                className="flex items-center p-4 border-t bg-white/50 backdrop-blur-sm"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <motion.div 
                  className="flex-1 relative"
                  whileFocus={{ scale: 1.01 }}
                >
                  <input
                    type="text"
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Type your message..."
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    disabled={isLoading}
                  />
                  <motion.button
                    onClick={handleSendMessage}
                    disabled={isLoading || !currentMessage.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full text-blue-600 hover:bg-blue-50 disabled:text-gray-400 disabled:bg-transparent disabled:cursor-not-allowed transition-colors"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Send size={20} />
                  </motion.button>
                </motion.div>
              </motion.div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 lg:col-span-1">
            {" "}
            {/* Ensure it takes 1 column on large screens */}
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
                      <span>
                        {item.name} x{item.quantity}
                      </span>
                      <span>
                        ₦{(item.price * item.quantity).toLocaleString()}
                      </span>
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
      <OrderConfirmation 
        completedOrder={completedOrder} 
        onClose={() => setCompletedOrder(null)} 
      />
      
      {/* Menu Modal */}
      <MenuModal isOpen={isMenuOpen} onClose={toggleMenu} />
    </div>
  );
};

export default RestaurantOrderingApp;
