'use client';
import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MovieCard from './MovieCard';

export default function Row({ title, movies, onMovieClick }) {
  const rowRef = useRef(null);

  const slide = (offset) => {
    rowRef.current.scrollLeft += offset;
  };

  return (
    <div className="mb-8 px-4 md:px-8 space-y-4">
      <h2 className="text-xl md:text-2xl font-bold text-white/90 border-l-4 border-teal-500 pl-3">
        {title}
      </h2>
      
      <div className="relative group">
        <button 
          onClick={() => slide(-500)}
          className="absolute left-0 top-0 bottom-0 z-10 bg-gradient-to-r from-slate-950/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity hover:text-teal-400"
        >
          <ChevronLeft size={40} />
        </button>

        <div 
          ref={rowRef}
          className="flex items-center gap-4 overflow-x-scroll scrollbar-hide scroll-smooth py-4 pl-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} onClick={onMovieClick} />
          ))}
        </div>

        <button 
          onClick={() => slide(500)}
          className="absolute right-0 top-0 bottom-0 z-10 bg-gradient-to-l from-slate-950/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity hover:text-teal-400"
        >
          <ChevronRight size={40} />
        </button>
      </div>
    </div>
  );
}