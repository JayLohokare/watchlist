class WebSocketService {
  constructor() {
    console.log('🔵 Creating new WebSocketService instance');
    this.socket = null;
    this.isConnected = false;
    this.messageHandlers = {};
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    this.subscribedTickers = new Set();
    this.pendingSubscriptions = new Set();
    this.connectionPromise = null;
    this.globalMessageHandlers = [];
  }

  connect(userId) {
    // If already connecting, return the existing promise
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // If already connected, resolve immediately
    if (this.isConnected && this.socket) {
      return Promise.resolve();
    }

    // Create a new connection promise
    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        if (this.socket) {
          this.disconnect();
        }

        console.log(`Connecting to WebSocket with user ID: ${userId}`);
        this.socket = new WebSocket(`ws://localhost:8001/ws/securities/?token=${userId}`);

        this.socket.onopen = () => {
          console.log('WebSocket connection established');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // Process any pending subscriptions
          if (this.pendingSubscriptions.size > 0) {
            this.processPendingSubscriptions();
          }
          
          resolve();
          this.connectionPromise = null;
        };

        this.socket.onmessage = this.handleMessage.bind(this);

        this.socket.onclose = (event) => {
          this.isConnected = false;
          console.log('WebSocket connection closed:', event.code, event.reason);
          
          // Reject the connection promise if it's still pending
          if (this.connectionPromise) {
            reject(new Error(`WebSocket connection closed: ${event.code}`));
            this.connectionPromise = null;
          }
          
          // Attempt to reconnect if not a normal closure
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectTimeout = setTimeout(() => {
              this.reconnectAttempts++;
              console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
              this.connect(userId);
            }, 3000 * Math.pow(2, this.reconnectAttempts)); // Exponential backoff
          }
        };

        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          
          // Reject the connection promise if it's still pending
          if (this.connectionPromise) {
            reject(error);
            this.connectionPromise = null;
          }
        };
      } catch (error) {
        console.error('Error setting up WebSocket:', error);
        reject(error);
        this.connectionPromise = null;
      }
    });

    return this.connectionPromise;
  }

  disconnect() {
    if (this.socket) {
      // Clear all subscriptions
      this.subscribedTickers.clear();
      this.pendingSubscriptions.clear();
      
      // Clear reconnect timeout if it exists
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      
      // Close the socket if it's open
      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.close(1000, "Disconnecting");
      }
      
      this.socket = null;
      this.isConnected = false;
      this.connectionPromise = null;
    }
  }

  processPendingSubscriptions() {
    if (this.pendingSubscriptions.size > 0 && this.isConnected) {
      const tickersToSubscribe = [...this.pendingSubscriptions];
      this.subscribe(tickersToSubscribe);
      this.pendingSubscriptions.clear();
    }
  }

  subscribe(tickers) {
    if (!tickers || tickers.length === 0) return false;
    
    // Filter out already subscribed tickers
    const newTickers = tickers.filter(ticker => !this.subscribedTickers.has(ticker));
    
    if (newTickers.length === 0) return true; // Already subscribed to all
    
    if (!this.isConnected || !this.socket) {
      // Add to pending subscriptions
      newTickers.forEach(ticker => this.pendingSubscriptions.add(ticker));
      console.log(`WebSocket not connected. Added to pending subscriptions: ${newTickers}`);
      return false;
    }

    console.log(`Subscribing to securities: ${newTickers}`);
    this.socket.send(JSON.stringify({
      action: 'subscribe',
      securities: newTickers
    }));
    
    // Add to subscribed set
    newTickers.forEach(ticker => this.subscribedTickers.add(ticker));
    return true;
  }

  unsubscribe(tickers) {
    if (!tickers || tickers.length === 0) return false;
    
    // Filter to only include currently subscribed tickers
    const tickersToUnsubscribe = tickers.filter(ticker => this.subscribedTickers.has(ticker));
    
    if (tickersToUnsubscribe.length === 0) return true; // None are subscribed
    
    if (!this.isConnected || !this.socket) {
      console.error('Cannot unsubscribe: WebSocket not connected');
      return false;
    }

    console.log(`Unsubscribing from securities: ${tickersToUnsubscribe}`);
    this.socket.send(JSON.stringify({
      action: 'unsubscribe',
      securities: tickersToUnsubscribe
    }));
    
    // Remove from subscribed set
    tickersToUnsubscribe.forEach(ticker => this.subscribedTickers.delete(ticker));
    return true;
  }

  addMessageHandler(ticker, handler) {
    if (!this.messageHandlers[ticker]) {
      this.messageHandlers[ticker] = [];
    }
    this.messageHandlers[ticker].push(handler);
  }

  removeMessageHandler(ticker, handler) {
    if (!this.messageHandlers[ticker]) return;
    
    if (handler) {
      // Remove specific handler
      this.messageHandlers[ticker] = this.messageHandlers[ticker].filter(h => h !== handler);
    } else {
      // Remove all handlers for this ticker
      delete this.messageHandlers[ticker];
    }
  }
  
  getSubscribedTickers() {
    return [...this.subscribedTickers];
  }

  addGlobalMessageHandler(handler) {
    console.log('Adding global message handler', typeof handler);
    if (typeof handler !== 'function') {
      console.error('Handler must be a function, received:', handler);
      return;
    }
    this.globalMessageHandlers.push(handler);
    console.log(`Global handlers count: ${this.globalMessageHandlers.length}`);
  }

  removeGlobalMessageHandler(handler) {
    if (!this.globalMessageHandlers) return;
    
    this.globalMessageHandlers = this.globalMessageHandlers.filter(h => h !== handler);
    console.log('Global handler removed, remaining:', this.globalMessageHandlers.length);
  }

  removeAllGlobalMessageHandlers() {
    console.log('Removing all global message handlers');
    this.globalMessageHandlers = [];
  }

  handleMessage(event) {
    console.log('🔵 Raw WebSocket event received:', event.data);
    try {
      const data = JSON.parse(event.data);
      // console.log('🔵 WebSocket message received:', data);
      // console.log('🔵 globalMessageHandlers type:', typeof this.globalMessageHandlers);
      // console.log('🔵 globalMessageHandlers value:', this.globalMessageHandlers);
      
      // Check if this is a price update message
      if (data.ticker && data.price !== undefined) {
        // console.log(`🔵 Price update received for ${data.ticker}: ${data.price}`);
        
        // Call all global handlers
        const handlerCount = this.globalMessageHandlers.length;
        // console.log(`🔵 Calling ${handlerCount} global handlers`);
        
        if (handlerCount === 0) {
          console.warn('⚠️ No global handlers registered to process this update');
        }
        
        if (Array.isArray(this.globalMessageHandlers)) {
          this.globalMessageHandlers.forEach((handler, index) => {
            try {
              console.log(`🔵 Calling global handler #${index} for ${data.ticker}`);
              handler(data.ticker, data.price);
            } catch (handlerError) {
              console.error(`❌ Error in global handler #${index}:`, handlerError);
            }
          });
        } else {
          console.error('❌ globalMessageHandlers is not an array:', this.globalMessageHandlers);
        }
        
        // Call specific ticker handlers if any
        if (this.messageHandlers[data.ticker]) {
          console.log(`🔵 Calling ${this.messageHandlers[data.ticker].length} specific handlers for ${data.ticker}`);
          this.messageHandlers[data.ticker].forEach(handler => {
            try {
              handler(data.price);
            } catch (handlerError) {
              console.error(`❌ Error in specific handler for ${data.ticker}:`, handlerError);
            }
          });
        }
      }
    } catch (error) {
      console.error('❌ Error handling WebSocket message:', error);
    }
  }
}

// Create a singleton instance
const webSocketService = new WebSocketService();
export default webSocketService; 