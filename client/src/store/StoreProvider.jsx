import { SecuritiesProvider } from './SecuritiesStore';
import { WatchlistsProvider } from './WatchlistsStore';

export function StoreProvider({ children }) {
  return (
    <SecuritiesProvider>
      <WatchlistsProvider>
        {children}
      </WatchlistsProvider>
    </SecuritiesProvider>
  );
} 