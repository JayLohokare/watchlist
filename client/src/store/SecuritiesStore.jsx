import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import webSocketService from '../services/WebSocketService';

// Create context
const SecuritiesContext = createContext(null);

// Provider component
export function SecuritiesProvider({ children }) {
  const [securities, setSecurities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const connectedUserIdRef = useRef(null);
  const [dataFetched, setDataFetched] = useState(false);
  
  // Subscribe to specific tickers - MOVED UP
  const subscribeToTickers = useCallback((tickers) => {
    if (!isWebSocketConnected || !tickers || tickers.length === 0) return;
    
    webSocketService.subscribe(tickers);
  }, [isWebSocketConnected]);
  
  // Fetch securities from API
  const fetchSecurities = useCallback(async (userId) => {
    if (!userId) return;
    
    // Skip if we've already fetched the data
    if (dataFetched && securities.length > 0) {
      return securities;
    }
    
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/securities/', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${userId}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch securities');
      
      const data = await response.json();
      setSecurities(data);
      setLastUpdated(new Date());
      setDataFetched(true);
      
      // After fetching securities data
      const tickers = data.map(security => security.ticker);
      subscribeToTickers(tickers);
      
      return data;
    } catch (err) {
      console.error('Error fetching securities:', err);
      setError('Failed to load securities data');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [securities.length, dataFetched, subscribeToTickers]);
  
  // Update a single security price (used by WebSocket updates)
  const updateSecurityPrice = useCallback((ticker, price) => {
    console.log(`🟠 Updating price for ${ticker} to $${price}`);
    
    if (!ticker || price === undefined) {
      console.error('❌ Invalid ticker or price:', ticker, price);
      return;
    }
    
    // Ensure price is a number
    const numericPrice = typeof price === 'string' ? parseFloat(price) : price;
    
    if (isNaN(numericPrice)) {
      console.error('❌ Invalid price format:', price);
      return;
    }
    
    // console.log(`🟠 About to call setSecurities with ticker=${ticker}, price=${numericPrice}`);
    
    setSecurities(prevSecurities => {
      // console.log(`🟠 Inside setSecurities callback with ${prevSecurities.length} securities`);
      
      // Check if we have the security in our list
      const securityExists = prevSecurities.some(s => s.ticker === ticker);
      if (!securityExists) {
        console.warn(`⚠️ Security with ticker ${ticker} not found in securities list`);
        return prevSecurities; // Return unchanged if security not found
      }
      
      const updatedSecurities = prevSecurities.map(security => {
        if (security.ticker === ticker) {
          // console.log(`🟠 Found security to update: ${security.name} (${security.ticker})`);
          // console.log(`🟠 Old price: $${security.last_price}, New price: $${numericPrice}`);
          return { ...security, last_price: numericPrice };
        }
        return security;
      });
      
      // Log the entire securities store after update
      // console.log('===== SECURITIES STORE UPDATE =====');
      // console.log(`Timestamp: ${new Date().toISOString()}`);
      // console.log(`Updated ticker: ${ticker}`);
      // console.log(`New price: $${numericPrice}`);
      // console.log('Updated securities state:');
      // console.table(updatedSecurities.map(s => ({
      //   id: s.id,
      //   ticker: s.ticker,
      //   name: s.name,
      //   price: s.last_price
      // })));
      // console.log('==================================');
      
      return updatedSecurities;
    });
    
    setLastUpdated(new Date());
    console.log(`🟠 Last updated timestamp set to: ${new Date().toISOString()}`);
  }, []);
  
  // Connect to WebSocket and set up handlers
  const connectWebSocket = useCallback(async (userId) => {
    if (!userId) return null;
    
    // If already connected for this user, don't reconnect
    if (isWebSocketConnected && connectedUserIdRef.current === userId) {
      console.log('🟢 Already connected to WebSocket for this user');
      console.log('🟢 Current global handlers count:', webSocketService.globalMessageHandlers.length);
      return () => {};
    }
    
    try {
      // Clear any existing handlers first
      console.log('🟢 Removing any existing global handlers');
      webSocketService.removeAllGlobalMessageHandlers();
      
      // Connect to WebSocket
      // console.log('🟢 Connecting to WebSocket...');
      await webSocketService.connect(userId);
      setIsWebSocketConnected(true);
      connectedUserIdRef.current = userId;
      // console.log('🟢 WebSocket connected successfully');
      
      // Set up a single handler for all price updates
      const handlePriceUpdate = (ticker, price) => {
        // console.log(`🟢 Price update handler called with: ${ticker} = $${price}`);
        updateSecurityPrice(ticker, price);
      };
      
      // Register the handler with the WebSocket service
      // console.log('🟢 Registering global handler for price updates');
      webSocketService.addGlobalMessageHandler(handlePriceUpdate);
      // console.log('🟢 Global handlers after registration:', webSocketService.globalMessageHandlers.length);
      
      // Return cleanup function
      return () => {
        // console.log('🟢 Cleaning up WebSocket handlers');
        webSocketService.removeGlobalMessageHandler(handlePriceUpdate);
      };
    } catch (error) {
      console.error('❌ Error connecting to WebSocket:', error);
      setError('Failed to connect to real-time updates');
      setIsWebSocketConnected(false);
      return null;
    }
  }, [updateSecurityPrice, isWebSocketConnected]);
  
  // Unsubscribe from specific tickers
  const unsubscribeFromTickers = useCallback((tickers) => {
    if (!isWebSocketConnected || !tickers || tickers.length === 0) return;
    
    webSocketService.unsubscribe(tickers);
  }, [isWebSocketConnected]);
  
  // Find a security by ID
  const getSecurityById = useCallback((id) => {
    return securities.find(security => security.id === id) || null;
  }, [securities]);
  
  // Find a security by ticker
  const getSecurityByTicker = useCallback((ticker) => {
    return securities.find(security => security.ticker === ticker) || null;
  }, [securities]);
  
  // Get ticker for a security ID
  const getTickerById = useCallback((id) => {
    const security = securities.find(security => security.id === id);
    return security ? security.ticker : null;
  }, [securities]);
  
  // Create value object
  const value = {
    securities,
    loading,
    error,
    lastUpdated,
    isWebSocketConnected,
    fetchSecurities,
    connectWebSocket,
    subscribeToTickers,
    unsubscribeFromTickers,
    getSecurityById,
    getSecurityByTicker,
    getTickerById
  };
  
  return (
    <SecuritiesContext.Provider value={value}>
      {children}
    </SecuritiesContext.Provider>
  );
}

// Custom hook to use the securities context
export function useSecurities() {
  const context = useContext(SecuritiesContext);
  if (context === null) {
    throw new Error('useSecurities must be used within a SecuritiesProvider');
  }
  return context;
} 