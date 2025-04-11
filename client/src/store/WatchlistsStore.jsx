import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useSecurities } from './SecuritiesStore';

// Create context
const WatchlistsContext = createContext(null);

// Provider component
export function WatchlistsProvider({ children }) {
  const [watchlists, setWatchlists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const subscribedSecurityIdsRef = useRef(new Set());
  const lastFetchedRef = useRef(null);
  
  // Add this to track if we need to refetch
  const [needsRefetch, setNeedsRefetch] = useState(false);
  
  const { 
    securities, 
    isWebSocketConnected, 
    subscribeToTickers, 
    unsubscribeFromTickers,
    getTickerById
  } = useSecurities();
  
  // Fetch watchlists from API
  const fetchWatchlists = useCallback(async (userId) => {
    if (!userId) return;
    
    // Skip if we don't need to refetch and have data already
    if (watchlists.length > 0 && !needsRefetch && lastFetchedRef.current) {
      return watchlists;
    }
    
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/watchlists/', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${userId}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch watchlists');
      
      const data = await response.json();
      setWatchlists(data);
      lastFetchedRef.current = new Date();
      setNeedsRefetch(false);
      return data;
    } catch (err) {
      console.error('Error fetching watchlists:', err);
      setError('Failed to load watchlists data');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [watchlists.length, needsRefetch]);
  
  // Add security to watchlist
  const addToWatchlist = useCallback(async (userId, securityId, watchlistId) => {
    try {
      const response = await fetch(`http://localhost:8000/watchlists/${watchlistId}/add_security/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${userId}`
        },
        body: JSON.stringify({ security_id: securityId }),
      });
      
      if (!response.ok) throw new Error('Failed to add security to watchlist');
      
      // Mark that we need to refetch
      setNeedsRefetch(true);
      
      // Refresh watchlists after adding
      await fetchWatchlists(userId);
      return true;
    } catch (err) {
      console.error('Error adding to watchlist:', err);
      setError('Failed to add security to watchlist');
      return false;
    }
  }, [fetchWatchlists]);
  
  // Remove security from watchlist
  const removeFromWatchlist = useCallback(async (userId, securityId, watchlistId) => {
    try {
      const response = await fetch(`http://localhost:8000/watchlists/${watchlistId}/remove_security/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${userId}`
        },
        body: JSON.stringify({ security_id: securityId }),
      });
      
      if (!response.ok) throw new Error('Failed to remove security from watchlist');
      
      // Mark that we need to refetch
      setNeedsRefetch(true);
      
      // Refresh watchlists after removing
      await fetchWatchlists(userId);
      return true;
    } catch (err) {
      console.error('Error removing from watchlist:', err);
      setError('Failed to remove security from watchlist');
      return false;
    }
  }, [fetchWatchlists]);
  
  // Create new watchlist
  const createWatchlist = useCallback(async (userId, name, description = '') => {
    try {
      const response = await fetch('http://localhost:8000/watchlists/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${userId}`
        },
        body: JSON.stringify({
          name,
          description,
          securities: []
        }),
      });
      
      if (!response.ok) throw new Error('Failed to create watchlist');
      
      // Mark that we need to refetch
      setNeedsRefetch(true);
      
      // Refresh watchlists after creating
      await fetchWatchlists(userId);
      return true;
    } catch (err) {
      console.error('Error creating watchlist:', err);
      setError('Failed to create watchlist');
      return false;
    }
  }, [fetchWatchlists]);
  
  // Delete watchlist
  const deleteWatchlist = useCallback(async (userId, watchlistId) => {
    try {
      const response = await fetch(`http://localhost:8000/watchlists/${watchlistId}/`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${userId}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to delete watchlist');
      
      // Mark that we need to refetch
      setNeedsRefetch(true);
      
      // Refresh watchlists after deleting
      await fetchWatchlists(userId);
      return true;
    } catch (err) {
      console.error('Error deleting watchlist:', err);
      setError('Failed to delete watchlist');
      return false;
    }
  }, [fetchWatchlists]);
  
  // Update WebSocket subscriptions based on watchlist securities - FIXED VERSION
  useEffect(() => {
    if (!isWebSocketConnected || watchlists.length === 0 || securities.length === 0) return;
    
    // Get all unique securities from watchlists
    const allWatchlistSecurityIds = new Set();
    watchlists.forEach(watchlist => {
      watchlist.securities.forEach(securityId => {
        allWatchlistSecurityIds.add(securityId);
      });
    });
    
    // Find securities to subscribe to (new ones)
    const securityIdsToSubscribe = [...allWatchlistSecurityIds].filter(
      id => !subscribedSecurityIdsRef.current.has(id)
    );
    
    // Find securities to unsubscribe from (removed ones)
    const securityIdsToUnsubscribe = [...subscribedSecurityIdsRef.current].filter(
      id => !allWatchlistSecurityIds.has(id)
    );
    
    // Convert security IDs to tickers
    const tickersToSubscribe = securityIdsToSubscribe
      .map(id => getTickerById(id))
      .filter(ticker => ticker !== null);
    
    const tickersToUnsubscribe = securityIdsToUnsubscribe
      .map(id => getTickerById(id))
      .filter(ticker => ticker !== null);
    
    // Subscribe to new securities
    if (tickersToSubscribe.length > 0) {
      subscribeToTickers(tickersToSubscribe);
    }
    
    // Unsubscribe from removed securities
    if (tickersToUnsubscribe.length > 0) {
      unsubscribeFromTickers(tickersToUnsubscribe);
    }
    
    // Update the ref of subscribed security IDs
    subscribedSecurityIdsRef.current = allWatchlistSecurityIds;
    
  }, [watchlists, securities, isWebSocketConnected, subscribeToTickers, unsubscribeFromTickers, getTickerById]);
  
  // Create value object
  const value = {
    watchlists,
    loading,
    error,
    fetchWatchlists,
    addToWatchlist,
    removeFromWatchlist,
    createWatchlist,
    deleteWatchlist
  };
  
  return (
    <WatchlistsContext.Provider value={value}>
      {children}
    </WatchlistsContext.Provider>
  );
}

// Custom hook to use the watchlists context
export function useWatchlists() {
  const context = useContext(WatchlistsContext);
  if (context === null) {
    throw new Error('useWatchlists must be used within a WatchlistsProvider');
  }
  return context;
} 