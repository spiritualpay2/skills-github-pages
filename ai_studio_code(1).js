'use client';
import { createContext, useContext, useState, useEffect } from 'react';

const WatchlistContext = createContext();

export const WatchlistProvider = ({ children }) => {
  const [watchlist, setWatchlist] = useState([]);

  // Load from local storage on mount
  useEffect(() => {
    const stored = localStorage.getItem('myWatchlist');
    if (stored) setWatchlist(JSON.parse(stored));
  }, []);

  const toggleWatchlist = (movie) => {
    let updatedList;
    if (watchlist.find((item) => item.id === movie.id)) {
      updatedList = watchlist.filter((item) => item.id !== movie.id);
    } else {
      updatedList = [...watchlist, movie];
    }
    setWatchlist(updatedList);
    localStorage.setItem('myWatchlist', JSON.stringify(updatedList));
  };

  const isInWatchlist = (id) => !!watchlist.find((item) => item.id === id);

  return (
    <WatchlistContext.Provider value={{ watchlist, toggleWatchlist, isInWatchlist }}>
      {children}
    </WatchlistContext.Provider>
  );
};

export const useWatchlist = () => useContext(WatchlistContext);