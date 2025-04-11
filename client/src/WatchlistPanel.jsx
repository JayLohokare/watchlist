import { useState, useRef, useEffect } from 'react';
import './WatchlistPanel.css';
import './priceFlash.css';

export function WatchlistPanel({ watchlists, securities, onRemoveFromWatchlist, onCreateWatchlist, onDeleteWatchlist, webSocketService }) {
  const [activeWatchlist, setActiveWatchlist] = useState(null);
  const [newWatchlistName, setNewWatchlistName] = useState('');
  const [newWatchlistDesc, setNewWatchlistDesc] = useState('');
  const [message, setMessage] = useState(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [flashingPrices, setFlashingPrices] = useState({});
  const [subscribedTickers, setSubscribedTickers] = useState(new Set());
  
  // Store previous securities for comparison
  const prevSecuritiesRef = useRef({});
  
  // Check for price changes and trigger flash animation
  useEffect(() => {
    const newFlashingState = {};
    
    securities.forEach(security => {
      const prevSecurity = prevSecuritiesRef.current[security.id];
      if (prevSecurity && prevSecurity.last_price !== security.last_price) {
        newFlashingState[security.id] = true;
      }
    });
    
    if (Object.keys(newFlashingState).length > 0) {
      setFlashingPrices(newFlashingState);
      
      // Remove flash after animation completes
      const timer = setTimeout(() => {
        setFlashingPrices({});
      }, 600);
      
      return () => clearTimeout(timer);
    }
    
    // Update previous securities reference
    const securityMap = {};
    securities.forEach(security => {
      securityMap[security.id] = { ...security };
    });
    prevSecuritiesRef.current = securityMap;
  }, [securities]);

  useEffect(() => {
    if (watchlists.length > 0 && securities.length > 0) {
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
      
      // Convert to arrays for easier comparison
      const newTickers = [...allWatchlistSecurities];
      const currentTickers = [...subscribedTickers];
      
      // Find tickers to subscribe to (in new list but not in current subscriptions)
      const tickersToSubscribe = newTickers.filter(ticker => !subscribedTickers.has(ticker));
      
      // Find tickers to unsubscribe from (in current subscriptions but not in new list)
      const tickersToUnsubscribe = currentTickers.filter(ticker => !allWatchlistSecurities.has(ticker));
      
      // Update subscriptions
      if (tickersToSubscribe.length > 0 && webSocketService) {
        console.log('Subscribing to tickers:', tickersToSubscribe);
        webSocketService.subscribe(tickersToSubscribe);
      }
      
      if (tickersToUnsubscribe.length > 0 && webSocketService) {
        console.log('Unsubscribing from tickers:', tickersToUnsubscribe);
        webSocketService.unsubscribe(tickersToUnsubscribe);
      }
      
      // Update the state with the new set of subscribed tickers
      setSubscribedTickers(allWatchlistSecurities);
    } else if (subscribedTickers.size > 0 && webSocketService) {
      // If there are no watchlists but we have subscriptions, unsubscribe from all
      webSocketService.unsubscribe([...subscribedTickers]);
      setSubscribedTickers(new Set());
    }
  }, [watchlists, securities, subscribedTickers, webSocketService]);

  const handleCreateWatchlist = async (e) => {
    e.preventDefault();
    
    if (!newWatchlistName.trim()) {
      setMessage({ type: 'error', text: 'Watchlist name is required' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    
    const success = await onCreateWatchlist(newWatchlistName, newWatchlistDesc);
    
    if (success) {
      setMessage({ type: 'success', text: 'Watchlist created successfully' });
      setNewWatchlistName('');
      setNewWatchlistDesc('');
      setIsFormVisible(false);
    } else {
      setMessage({ type: 'error', text: 'Failed to create watchlist' });
    }
    
    setTimeout(() => setMessage(null), 3000);
  };

  const handleRemoveFromWatchlist = async (securityId, watchlistId) => {
    const success = await onRemoveFromWatchlist(securityId, watchlistId);
    
    if (success) {
      setMessage({ type: 'success', text: 'Removed from watchlist successfully' });
    } else {
      setMessage({ type: 'error', text: 'Failed to remove from watchlist' });
    }
    
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDeleteWatchlist = async (watchlistId) => {
    if (confirmDelete === watchlistId) {
      const success = await onDeleteWatchlist(watchlistId);
      
      if (success) {
        setMessage({ type: 'success', text: 'Watchlist deleted successfully' });
        setActiveWatchlist(null);
      } else {
        setMessage({ type: 'error', text: 'Failed to delete watchlist' });
      }
      
      setConfirmDelete(null);
      setTimeout(() => setMessage(null), 3000);
    } else {
      setConfirmDelete(watchlistId);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  const toggleWatchlist = (watchlistId) => {
    setActiveWatchlist(activeWatchlist === watchlistId ? null : watchlistId);
  };

  // Find security details by ID
  const getSecurityDetails = (securityId) => {
    return securities.find(s => s.id === securityId) || null;
  };

  return (
    <div className="watchlist-panel">
      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}
      
      <div className="watchlist-actions">
        <button 
          className="create-watchlist-btn"
          onClick={() => setIsFormVisible(!isFormVisible)}
        >
          {isFormVisible ? 'Cancel' : 'Create New Watchlist'}
        </button>
      </div>
      
      {isFormVisible && (
        <form className="watchlist-form" onSubmit={handleCreateWatchlist}>
          <div className="form-group">
            <label htmlFor="watchlist-name">Watchlist Name:</label>
            <input
              id="watchlist-name"
              type="text"
              value={newWatchlistName}
              onChange={(e) => setNewWatchlistName(e.target.value)}
              placeholder="Enter watchlist name"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="watchlist-desc">Description (optional):</label>
            <textarea
              id="watchlist-desc"
              value={newWatchlistDesc}
              onChange={(e) => setNewWatchlistDesc(e.target.value)}
              placeholder="Enter description"
            />
          </div>
          <button type="submit" className="submit-btn">Create Watchlist</button>
        </form>
      )}
      
      {watchlists.length === 0 ? (
        <p className="no-watchlists">You don't have any watchlists yet. Create one to get started!</p>
      ) : (
        <div className="watchlists-accordion">
          {watchlists.map(watchlist => (
            <div key={watchlist.id} className="watchlist-item">
              <div 
                className="watchlist-header" 
                onClick={() => toggleWatchlist(watchlist.id)}
              >
                <h3>{watchlist.name}</h3>
                <div className="watchlist-actions">
                  <span className="toggle-icon">
                    {activeWatchlist === watchlist.id ? '▼' : '▶'}
                  </span>
                  <button 
                    className="delete-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteWatchlist(watchlist.id);
                    }}
                  >
                    {confirmDelete === watchlist.id ? 'Confirm Delete' : 'Delete'}
                  </button>
                </div>
              </div>
              
              {activeWatchlist === watchlist.id && (
                <div className="watchlist-content">
                  {watchlist.description && (
                    <p className="watchlist-description">{watchlist.description}</p>
                  )}
                  
                  {watchlist.securities.length === 0 ? (
                    <p className="empty-watchlist">This watchlist is empty. Add securities to get started!</p>
                  ) : (
                    <table className="watchlist-securities-table">
                      <thead>
                        <tr>
                          <th>Ticker</th>
                          <th>Name</th>
                          <th>Price</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {watchlist.securities.map(securityId => {
                          const security = getSecurityDetails(securityId);
                          if (!security) return null;
                          
                          // Apply flash animation class based on flashingPrices state
                          const priceClassName = flashingPrices[securityId] 
                            ? security.last_price > (prevSecuritiesRef.current[securityId]?.last_price || 0)
                              ? 'price-up'
                              : 'price-down'
                            : '';
                          
                          return (
                            <tr key={securityId}>
                              <td>{security.ticker}</td>
                              <td>{security.name}</td>
                              <td className={priceClassName}>
                                {security.last_price ? `$${security.last_price.toFixed(2)}` : 'N/A'}
                              </td>
                              <td>
                                <button 
                                  className="remove-button"
                                  onClick={() => handleRemoveFromWatchlist(securityId, watchlist.id)}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 