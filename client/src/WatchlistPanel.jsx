import { useState, useRef, useEffect, useCallback } from 'react';
import './WatchlistPanel.css';
import './priceFlash.css';
import { useSecurities } from './store/SecuritiesStore';
import { usePriceAnimation } from './hooks/usePriceAnimation';

export function WatchlistPanel({ watchlists, securities, onRemoveFromWatchlist, onCreateWatchlist, onDeleteWatchlist }) {
  // Replace single activeWatchlist with a Set to track multiple expanded watchlists
  const [expandedWatchlists, setExpandedWatchlists] = useState(new Set());
  const [newWatchlistName, setNewWatchlistName] = useState('');
  const [newWatchlistDesc, setNewWatchlistDesc] = useState('');
  const [message, setMessage] = useState(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [watchlistToDelete, setWatchlistToDelete] = useState(null);
  
  // Use the price animation hook
  const { getPriceClassName } = usePriceAnimation(securities);
  
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

  const handleDeleteWatchlist = async () => {
    if (watchlistToDelete) {
      const success = await onDeleteWatchlist(watchlistToDelete.id);
      
      if (success) {
        setMessage({ type: 'success', text: 'Watchlist deleted successfully' });
        // Remove from expanded set if it was expanded
        setExpandedWatchlists(prev => {
          const newSet = new Set(prev);
          newSet.delete(watchlistToDelete.id);
          return newSet;
        });
      } else {
        setMessage({ type: 'error', text: 'Failed to delete watchlist' });
      }
      
      setWatchlistToDelete(null);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // Modified to toggle a watchlist's expanded state
  const toggleWatchlist = (watchlistId) => {
    setExpandedWatchlists(prev => {
      const newSet = new Set(prev);
      if (newSet.has(watchlistId)) {
        newSet.delete(watchlistId);
      } else {
        newSet.add(watchlistId);
      }
      return newSet;
    });
  };

  // Find security details by ID
  const getSecurityDetails = (securityId) => {
    return securities.find(s => s.id === securityId) || null;
  };

  useEffect(() => {
    // console.log('Securities updated in WatchlistPanel:', securities);
  }, [securities]);

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
      
      {/* Delete Confirmation Modal */}
      {watchlistToDelete && (
        <div className="delete-modal-overlay">
          <div className="delete-modal">
            <h3>Delete Watchlist</h3>
            <p>Are you sure you want to delete the watchlist "{watchlistToDelete.name}"?</p>
            <p className="warning-text">This action cannot be undone.</p>
            <div className="modal-actions">
              <button 
                className="cancel-btn"
                onClick={() => setWatchlistToDelete(null)}
              >
                Cancel
              </button>
              <button 
                className="confirm-delete-btn"
                onClick={handleDeleteWatchlist}
              >
                Delete Watchlist
              </button>
            </div>
          </div>
        </div>
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
                    {expandedWatchlists.has(watchlist.id) ? '▼' : '▶'}
                  </span>
                </div>
              </div>
              
              {expandedWatchlists.has(watchlist.id) && (
                <div className="watchlist-content">
                  {watchlist.description && (
                    <p className="watchlist-description">{watchlist.description}</p>
                  )}
                  
                  <div className="watchlist-management">
                    <button 
                      className="delete-watchlist-btn"
                      onClick={() => setWatchlistToDelete(watchlist)}
                    >
                      <span className="delete-icon">🗑️</span> Delete Watchlist
                    </button>
                  </div>
                  
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
                          
                          return (
                            <tr key={securityId}>
                              <td>{security.ticker}</td>
                              <td>{security.name}</td>
                              <td className={getPriceClassName(securityId)}>
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