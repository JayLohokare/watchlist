import { useState, useRef, useEffect, useCallback } from 'react';
import './SecuritiesList.css';
import './priceFlash.css';
import { useSecurities } from './store/SecuritiesStore';
import { usePriceAnimation } from './hooks/usePriceAnimation';

export function SecuritiesList({ watchlists, onAddToWatchlist }) {
  const { securities } = useSecurities();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWatchlists, setSelectedWatchlists] = useState({});
  const [message, setMessage] = useState(null);
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'ascending'
  });
  
  // Use the price animation hook
  const { getPriceClassName } = usePriceAnimation(securities);
  
  // Store previous securities for comparison
  const prevSecuritiesRef = useRef({});
  
  // Memoize the security map update to prevent unnecessary re-renders
  const updatePrevSecuritiesRef = useCallback(() => {
    const securityMap = {};
    securities.forEach(security => {
      securityMap[security.id] = { ...security };
    });
    prevSecuritiesRef.current = securityMap;
  }, [securities]);
  
  // Check for price changes and trigger flash animation
  useEffect(() => {
    const newFlashingState = {};
    let hasChanges = false;
    
    securities.forEach(security => {
      const prevSecurity = prevSecuritiesRef.current[security.id];
      if (prevSecurity && prevSecurity.last_price !== security.last_price) {
        // Store both the fact that it's flashing and the direction
        newFlashingState[security.id] = {
          flashing: true,
          direction: security.last_price > prevSecurity.last_price ? 'up' : 'down'
        };
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      setFlashingPrices(newFlashingState);
      
      // Remove flash after animation completes
      const timer = setTimeout(() => {
        setFlashingPrices({});
      }, 600);
      
      // Update previous securities reference
      updatePrevSecuritiesRef();
      
      return () => clearTimeout(timer);
    } else {
      // Only update the reference if it's the first render or if needed
      if (Object.keys(prevSecuritiesRef.current).length === 0) {
        updatePrevSecuritiesRef();
      }
    }
  }, [securities, updatePrevSecuritiesRef]);

  // Filter securities based on search term
  const filteredSecurities = securities.filter(security => 
    security.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    security.ticker.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sort securities based on current sort configuration
  const sortedSecurities = [...filteredSecurities].sort((a, b) => {
    if (sortConfig.key === null) return 0;
    
    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];
    
    // Handle special case for price (which might be null)
    if (sortConfig.key === 'last_price') {
      aValue = aValue || 0;
      bValue = bValue || 0;
    }
    
    if (aValue < bValue) {
      return sortConfig.direction === 'ascending' ? -1 : 1;
    }
    if (aValue > bValue) {
      return sortConfig.direction === 'ascending' ? 1 : -1;
    }
    return 0;
  });

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
  };

  const handleAddToWatchlist = async (securityId) => {
    const watchlistId = selectedWatchlists[securityId];
    
    if (!watchlistId) {
      setMessage({ type: 'error', text: 'Please select a watchlist first' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    
    const success = await onAddToWatchlist(securityId, watchlistId);
    
    if (success) {
      setMessage({ type: 'success', text: 'Added to watchlist successfully' });
      // Reset the selected watchlist for this security
      setSelectedWatchlists(prev => ({
        ...prev,
        [securityId]: ''
      }));
    } else {
      setMessage({ type: 'error', text: 'Failed to add to watchlist' });
    }
    
    setTimeout(() => setMessage(null), 3000);
  };

  const handleWatchlistSelect = (securityId, watchlistId) => {
    setSelectedWatchlists(prev => ({
      ...prev,
      [securityId]: watchlistId
    }));
  };

  // Add this state
  const [flashingPrices, setFlashingPrices] = useState({});

  return (
    <div className="securities-list">
      <div className="search-container">
        <input
          type="text"
          placeholder="Search by name or ticker..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>
      
      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}
      
      {filteredSecurities.length === 0 ? (
        <p className="no-results">No securities found</p>
      ) : (
        <table className="securities-table">
          <thead>
            <tr>
              <th onClick={() => requestSort('ticker')} className="sortable-header">
                Ticker{getSortIndicator('ticker')}
              </th>
              <th onClick={() => requestSort('name')} className="sortable-header">
                Name{getSortIndicator('name')}
              </th>
              <th onClick={() => requestSort('last_price')} className="sortable-header">
                Price{getSortIndicator('last_price')}
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedSecurities.map(security => (
              <tr key={security.id}>
                <td>{security.ticker}</td>
                <td>{security.name}</td>
                <td className={getPriceClassName(security.id)}>
                  ${security.last_price ? security.last_price.toFixed(2) : 'N/A'}
                </td>
                <td>
                  {watchlists.length > 0 ? (
                    <div className="action-container">
                      <select 
                        value={selectedWatchlists[security.id] || ''}
                        onChange={(e) => handleWatchlistSelect(security.id, e.target.value)}
                      >
                        <option value="">Select watchlist</option>
                        {watchlists.map(watchlist => (
                          <option key={watchlist.id} value={watchlist.id}>
                            {watchlist.name}
                          </option>
                        ))}
                      </select>
                      <button 
                        onClick={() => handleAddToWatchlist(security.id)}
                        className="add-button"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <p>Create a watchlist first</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
} 