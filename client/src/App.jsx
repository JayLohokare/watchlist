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
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchSecurities(), fetchWatchlists()]);
      setLastUpdated(new Date());
    } catch (err) {
      setError('Failed to load data. Please try again.');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSecurities = async () => {
    try {
      const response = await fetch('http://localhost:8000/securities/', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${user.id}` // Using user ID as a simple token
        }
      });
      if (!response.ok) throw new Error('Failed to fetch securities');
      const data = await response.json();
      setSecurities(data);
      return data;
    } catch (err) {
      console.error('Error fetching securities:', err);
      throw err;
    }
  };

  const fetchWatchlists = async () => {
    try {
      const response = await fetch('http://localhost:8000/watchlists/', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${user.id}` // Using user ID as a simple token
        }
      });
      if (!response.ok) throw new Error('Failed to fetch watchlists');
      const data = await response.json();
      setWatchlists(data);
      return data;
    } catch (err) {
      console.error('Error fetching watchlists:', err);
      throw err;
    }
  };

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

  const addToWatchlist = async (securityId, watchlistId) => {
    try {
      const response = await fetch(`http://localhost:8000/watchlists/${watchlistId}/add_security/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${user.id}` // Using user ID as a simple token
        },
        body: JSON.stringify({ security_id: securityId }),
      });
      
      if (!response.ok) throw new Error('Failed to add security to watchlist');
      
      // Refresh watchlists after adding
      fetchWatchlists();
      return true;
    } catch (err) {
      console.error('Error adding to watchlist:', err);
      return false;
    }
  };

  const removeFromWatchlist = async (securityId, watchlistId) => {
    try {
      const response = await fetch(`http://localhost:8000/watchlists/${watchlistId}/remove_security/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${user.id}` // Using user ID as a simple token
        },
        body: JSON.stringify({ security_id: securityId }),
      });
      
      if (!response.ok) throw new Error('Failed to remove security from watchlist');
      
      // Refresh watchlists after removing
      fetchWatchlists();
      return true;
    } catch (err) {
      console.error('Error removing from watchlist:', err);
      return false;
    }
  };

  const createWatchlist = async (name, description = '') => {
    try {
      const response = await fetch('http://localhost:8000/watchlists/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${user.id}` // Using user ID as a simple token
        },
        body: JSON.stringify({
          name,
          description,
          securities: []
        }),
      });
      
      if (!response.ok) throw new Error('Failed to create watchlist');
      
      // Refresh watchlists after creating
      fetchWatchlists();
      return true;
    } catch (err) {
      console.error('Error creating watchlist:', err);
      return false;
    }
  };

  const deleteWatchlist = async (watchlistId) => {
    try {
      console.log(`Sending DELETE request to: http://localhost:8000/watchlists/${watchlistId}/`);
      const response = await fetch(`http://localhost:8000/watchlists/${watchlistId}/`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${user.id}` // Using user ID as a simple token
        }
      });
      
      if (!response.ok) {
        console.error('Delete response not OK:', response.status, response.statusText);
        throw new Error('Failed to delete watchlist');
      }
      
      // Refresh watchlists after deleting
      fetchWatchlists();
      return true;
    } catch (err) {
      console.error('Error deleting watchlist:', err);
      return false;
    }
  };

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
            
            {/* <div className="data-controls">
              <button className="refresh-button" onClick={fetchData} disabled={loading}>
                Refresh Data
              </button>
              {lastUpdated && (
                <span className="last-updated">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div> */}
            
            <div className="watchlist-container">
              <div className="securities-panel">
                <h2>Available Securities</h2>
                <SecuritiesList 
                  securities={securities} 
                  watchlists={watchlists}
                  onAddToWatchlist={addToWatchlist}
                />
              </div>
              
              <div className="watchlists-panel">
                <h2>My Watchlists</h2>
                <WatchlistPanel 
                  watchlists={watchlists} 
                  securities={securities}
                  onRemoveFromWatchlist={removeFromWatchlist}
                  onCreateWatchlist={createWatchlist}
                  onDeleteWatchlist={deleteWatchlist}
                  webSocketService={webSocketService}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </UserContext.Provider>
  );
}

export default App;