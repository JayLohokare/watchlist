import './App.css';
import { LoginForm } from './LoginForm';
import { UserContext } from './UserContext';
import { useState, useCallback, useMemo, useEffect, useRef, useContext } from 'react';
import { User } from "./User.jsx";
import { SecuritiesList } from './SecuritiesList';
import { WatchlistPanel } from './WatchlistPanel';
import webSocketService from './services/WebSocketService';

function App() {
  const [user, setUser] = useState(null);
  const [securities, setSecurities] = useState([]);
  const [watchlists, setWatchlists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const login = useCallback((u) => setUser(u), []);
  const logout = useCallback(() => {
    webSocketService.disconnect();
    setUser(null);
  }, []);
  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);

  // Function to fetch securities and watchlists
  const fetchData = useCallback(async () => {
    if (!user) {
      console.log('No user, skipping data fetch');
      return;
    }
    
    console.log('Fetching data for user:', user.id);
    setLoading(true);
    setError(null);
    
    try {
      // Log the token to verify it exists
      console.log('Using token for authentication:', user.token);
      
      // Fetch securities
      console.log('Fetching securities...');
      const securitiesResponse = await fetch('http://localhost:8000/securities/', {
        headers: {
          'Authorization': `Token ${user.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      // Log the response status to debug
      console.log('Securities response status:', securitiesResponse.status);
      
      if (!securitiesResponse.ok) {
        throw new Error(`Failed to fetch securities: ${securitiesResponse.status}`);
      }
      
      const securitiesData = await securitiesResponse.json();
      console.log('Securities data received:', securitiesData);
      setSecurities(securitiesData);
      
      // Fetch watchlists
      console.log('Fetching watchlists...');
      const watchlistsResponse = await fetch('http://localhost:8000/watchlists/', {
        headers: {
          'Authorization': `Token ${user.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!watchlistsResponse.ok) {
        throw new Error('Failed to fetch watchlists');
      }
      
      const watchlistsData = await watchlistsResponse.json();
      console.log('Watchlists data received:', watchlistsData);
      setWatchlists(watchlistsData);
      
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch securities and watchlists when user logs in
  useEffect(() => {
    if (user) {
      fetchData();
      
      // Connect to WebSocket when user logs in
      webSocketService.connect(user.id);
      
      return () => {
        // Disconnect from WebSocket when component unmounts or user logs out
        webSocketService.disconnect();
      };
    }
  }, [user, fetchData]);

  // Subscribe to securities in watchlists
  useEffect(() => {
    if (user && watchlists.length > 0) {
      // Get all unique securities from watchlists
      const allWatchlistSecurities = new Set();
      watchlists.forEach(watchlist => {
        watchlist.securities.forEach(securityId => {
          const security = securities.find(s => s.id === securityId);
          if (security) {
            allWatchlistSecurities.add(security.ticker);
          }
        });
      });
      
      // Subscribe to all securities in watchlists
      if (allWatchlistSecurities.size > 0) {
        webSocketService.subscribe([...allWatchlistSecurities]);
      }
      
      // Add this console log to debug
      console.log('Subscribed to securities:', [...allWatchlistSecurities]);
    }
  }, [user, watchlists, securities]);

  // Setup WebSocket handlers for price updates
  useEffect(() => {
    if (user && securities.length > 0) {
      // Create a map of ticker to security ID for quick lookup
      const tickerToIdMap = {};
      securities.forEach(security => {
        tickerToIdMap[security.ticker] = security.id;
        
        // Add message handler for each security
        webSocketService.addMessageHandler(security.ticker, (ticker, price) => {
          setSecurities(prevSecurities => {
            return prevSecurities.map(s => {
              if (s.ticker === ticker) {
                return { ...s, last_price: parseFloat(price) };
              }
              return s;
            });
          });
          setLastUpdated(new Date());
        });
      });
      
      return () => {
        // Clean up handlers when component unmounts or securities change
        securities.forEach(security => {
          webSocketService.removeMessageHandler(security.ticker);
        });
      };
    }
  }, [user, securities]);

  // Add a function to handle adding securities to watchlists
  const handleAddToWatchlist = useCallback(async (securityId, watchlistId) => {
    if (!user) return false;
    
    try {
      const response = await fetch(`http://localhost:8000/watchlists/${watchlistId}/add_security/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${user.token}`
        },
        body: JSON.stringify({ security_id: securityId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to add security to watchlist');
      }
      
      // Refresh watchlists after adding a security
      fetchData();
      return true;
    } catch (err) {
      console.error('Error adding security to watchlist:', err);
      return false;
    }
  }, [user, fetchData]);

  // Add a function to handle removing securities from watchlists
  const handleRemoveFromWatchlist = useCallback(async (securityId, watchlistId) => {
    if (!user) return false;
    
    try {
      const response = await fetch(`http://localhost:8000/watchlists/${watchlistId}/remove_security/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${user.token}`
        },
        body: JSON.stringify({ security_id: securityId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to remove security from watchlist');
      }
      
      // Refresh watchlists after removing a security
      fetchData();
      return true;
    } catch (err) {
      console.error('Error removing security from watchlist:', err);
      return false;
    }
  }, [user, fetchData]);

  // Add a function to handle creating new watchlists
  const handleCreateWatchlist = useCallback(async (name, description) => {
    if (!user) return false;
    
    try {
      const response = await fetch('http://localhost:8000/watchlists/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${user.token}`
        },
        body: JSON.stringify({ name, description })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create watchlist');
      }
      
      // Refresh watchlists after creating a new one
      fetchData();
      return true;
    } catch (err) {
      console.error('Error creating watchlist:', err);
      return false;
    }
  }, [user, fetchData]);

  // Add a function to handle deleting watchlists
  const handleDeleteWatchlist = useCallback(async (watchlistId) => {
    if (!user) return false;
    
    try {
      const response = await fetch(`http://localhost:8000/watchlists/${watchlistId}/`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Token ${user.token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete watchlist');
      }
      
      // Refresh watchlists after deleting one
      fetchData();
      return true;
    } catch (err) {
      console.error('Error deleting watchlist:', err);
      return false;
    }
  }, [user, fetchData]);

  return (
    <UserContext.Provider value={value}>
      <div className="app">
        <header>
          <h1>Stock Watchlist</h1>
          <User />
        </header>
        <LoginForm />
        
        {user && (
          <div className="content-container">
            {loading && <div className="loading">Loading data...</div>}
            {error && <div className="error-message">{error}</div>}
            
            {!loading && !error && (
              <>
                <div className="refresh-container">
                  <button onClick={fetchData} className="refresh-btn">
                    Refresh Data
                  </button>
                  {lastUpdated && (
                    <span className="last-updated">
                      Last updated: {lastUpdated.toLocaleTimeString()}
                    </span>
                  )}
                </div>
                
                <div className="watchlist-container">
                  <div className="securities-panel">
                    <h2>Available Securities</h2>
                    <SecuritiesList 
                      securities={securities} 
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
                      webSocketService={webSocketService}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </UserContext.Provider>
  );
}

export default App;