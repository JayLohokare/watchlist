// src/hooks/usePriceAnimation.js
import { useState, useRef, useEffect, useCallback } from 'react';

export function usePriceAnimation(securities) {
  const [flashingPrices, setFlashingPrices] = useState({});
  const prevSecuritiesRef = useRef({});
  const timeoutsRef = useRef({});
  
  // Memoize the security map update
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
        newFlashingState[security.id] = {
          direction: security.last_price > prevSecurity.last_price ? 'up' : 'down'
        };
        hasChanges = true;
        console.log(`Price change detected for ${security.ticker}: ${prevSecurity.last_price} -> ${security.last_price}`);
      }
    });
    
    if (hasChanges) {
      // Merge with existing flashing prices instead of replacing
      setFlashingPrices(prev => {
        const merged = { ...prev, ...newFlashingState };
        return merged;
      });
      
      // Clear any existing timeouts for these securities
      Object.keys(newFlashingState).forEach(securityId => {
        if (timeoutsRef.current[securityId]) {
          clearTimeout(timeoutsRef.current[securityId]);
        }
        
        // Set individual timeouts for each security
        timeoutsRef.current[securityId] = setTimeout(() => {
          setFlashingPrices(prev => {
            const updated = { ...prev };
            delete updated[securityId];
            return updated;
          });
          delete timeoutsRef.current[securityId];
        }, 600);
      });
      
      // Update previous securities reference
      updatePrevSecuritiesRef();
      
      return () => {
        // Clear all timeouts on unmount
        Object.values(timeoutsRef.current).forEach(timeout => clearTimeout(timeout));
      };
    } else {
      // Only update the reference if it's the first render or if needed
      if (Object.keys(prevSecuritiesRef.current).length === 0) {
        updatePrevSecuritiesRef();
      }
    }
  }, [securities, updatePrevSecuritiesRef]);
  
  // Add this function to return the appropriate CSS class
  const getPriceClassName = useCallback((securityId) => {
    if (flashingPrices[securityId]) {
      return flashingPrices[securityId].direction === 'up' ? 'price-up' : 'price-down';
    }
    return '';
  }, [flashingPrices]);
  
  return { flashingPrices, getPriceClassName };
}