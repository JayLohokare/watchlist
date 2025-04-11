import './App.css';
import { LoginForm } from './LoginForm';
import { UserContext } from './UserContext';
import { useState, useCallback, useMemo, useEffect, useContext } from 'react';
import { User } from "./User.jsx";
import { SecuritiesList } from './SecuritiesList';
import { WatchlistPanel } from './WatchlistPanel';
import { StoreProvider } from './store/StoreProvider';
import { useSecurities } from './store/SecuritiesStore';
import { useWatchlists } from './store/WatchlistsStore';
import webSocketService from './services/WebSocketService';

// Create a container component that uses the store hooks
function AppContent() {
  const { user, logout } = useContext(UserContext);
  const { 
    securities, 
    loading: securitiesLoading, 
    error: securitiesError,
    lastUpdated,
    fetchSecurities,
    connectWebSocket
  } = useSecurities();
  
  const {
    watchlists,
    loading: watchlistsLoading,
    error: watchlistsError,
    fetchWatchlists,
    addToWatchlist,
    removeFromWatchlist,
    createWatchlist,
    deleteWatchlist
  } = useWatchlists();
  
  const loading = securitiesLoading || watchlistsLoading;
  const error = securitiesError || watchlistsError;
  
  // Fetch data and connect WebSocket when user logs in
  useEffect(() => {
    if (user) {
      const fetchData = async () => {
        try {
          // Track if securities have been loaded
          const securityDataLoaded = securities.length > 0;
          
          // Only fetch securities if they haven't been loaded yet
          const fetchPromises = [];
          if (!securityDataLoaded) {
            fetchPromises.push(fetchSecurities(user.id));
          }
          
          // Always fetch watchlists initially
          fetchPromises.push(fetchWatchlists(user.id));
          
          await Promise.all(fetchPromises);
          
          // Connect to WebSocket after fetching data
          const cleanup = await connectWebSocket(user.id);
          
          // Store the cleanup function for later use
          const cleanupFn = cleanup || (() => {});
          
          return cleanupFn;
        } catch (err) {
          console.error('Error fetching data:', err);
          return () => {};
        }
      };
      
      let cleanupFn;
      fetchData().then(fn => {
        cleanupFn = fn;
      });
      
      return () => {
        if (cleanupFn) cleanupFn();
      };
    }
  }, [user, fetchSecurities, fetchWatchlists, connectWebSocket, securities.length]);
  
  // Handle adding to watchlist
  const handleAddToWatchlist = async (securityId, watchlistId) => {
    return await addToWatchlist(user.id, securityId, watchlistId);
  };
  
  // Handle removing from watchlist
  const handleRemoveFromWatchlist = async (securityId, watchlistId) => {
    return await removeFromWatchlist(user.id, securityId, watchlistId);
  };
  
  // Handle creating watchlist
  const handleCreateWatchlist = async (name, description) => {
    return await createWatchlist(user.id, name, description);
  };
  
  // Handle deleting watchlist
  const handleDeleteWatchlist = async (watchlistId) => {
    return await deleteWatchlist(user.id, watchlistId);
  };
  
  return (
    <>
      <LoginForm />
      
      {user && (
        <div className="content-container">
          {loading && <div className="loading">Loading data...</div>}
          {error && <div className="error-message">{error}</div>}
          
          <div className="watchlist-container">
            <div className="securities-panel">
              <h2>Available Securities</h2>
              <SecuritiesList 
                watchlists={watchlists}
                onAddToWatchlist={handleAddToWatchlist}
              />
            </div>
            
            <div className="watchlists-panel">
              <h2>My Watchlists</h2>
              <WatchlistPanel 
                watchlists={watchlists} 
                securities={securities}
                onRemoveFromWatchlist={handleRemoveFromWatchlist}
                onCreateWatchlist={handleCreateWatchlist}
                onDeleteWatchlist={handleDeleteWatchlist}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function App() {
  const [user, setUser] = useState(null);
  
  const login = useCallback((u) => setUser(u), []);
  const logout = useCallback(() => {
    webSocketService.disconnect();
    setUser(null);
  }, []);
  
  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  
  return (
    <UserContext.Provider value={value}>
      <StoreProvider>
        <div className="app">
          <header>
            <h1>Stock Watchlist</h1>
            <User />
          </header>
          <AppContent />
        </div>
      </StoreProvider>
    </UserContext.Provider>
  );
}

export default App;