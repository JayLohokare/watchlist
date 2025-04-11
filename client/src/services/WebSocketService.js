class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.messageHandlers = {};
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
  }

  connect(userId) {
    if (this.socket) {
      this.disconnect();
    }

    console.log(`Connecting to WebSocket with user ID: ${userId}`);
    this.socket = new WebSocket(`ws://localhost:8001/ws/securities/?token=${userId}`);

    this.socket.onopen = () => {
      console.log('WebSocket connection established');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    };

    this.socket.onmessage = (event) => {
      console.log('WebSocket message received:', event.data);
      try {
        const data = JSON.parse(event.data);
        const ticker = data.ticker;
        const price = data.price;
        
        // Call handlers for this specific ticker
        if (ticker && this.messageHandlers[ticker]) {
          this.messageHandlers[ticker].forEach(handler => {
            try {
              handler(ticker, price);
            } catch (handlerError) {
              console.error('Error in message handler:', handlerError);
            }
          });
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.socket.onclose = (event) => {
      this.isConnected = false;
      console.log('WebSocket connection closed:', event.code, event.reason);
      
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
    };
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
      console.log('WebSocket disconnected');
    }
  }

  subscribe(securities) {
    if (!this.isConnected || !this.socket) {
      console.error('Cannot subscribe: WebSocket not connected');
      return false;
    }

    console.log(`Subscribing to securities: ${securities}`);
    this.socket.send(JSON.stringify({
      action: 'subscribe',
      securities: securities
    }));
    return true;
  }

  unsubscribe(securities) {
    if (!this.isConnected || !this.socket) {
      console.error('Cannot unsubscribe: WebSocket not connected');
      return false;
    }

    console.log(`Unsubscribing from securities: ${securities}`);
    this.socket.send(JSON.stringify({
      action: 'unsubscribe',
      securities: securities
    }));
    return true;
  }

  addMessageHandler(ticker, handler) {
    if (!this.messageHandlers[ticker]) {
      this.messageHandlers[ticker] = [];
    }
    this.messageHandlers[ticker].push(handler);
  }

  removeMessageHandler(ticker) {
    delete this.messageHandlers[ticker];
  }
}

// Create a singleton instance
const webSocketService = new WebSocketService();
export default webSocketService; 