'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Check, Star } from 'lucide-react';
import Image from 'next/image';
import { useWatchlist } from '@/context/WatchlistContext';

const BACKDROP_BASE = 'https://image.tmdb.org/t/p/original';

export default function Modal({ movie, onClose }) {
  const { toggleWatchlist, isInWatchlist } = useWatchlist();
  const inList = movie ? isInWatchlist(movie.id) : false;

  if (!movie) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />
        
        <motion.div
          layoutId={`movie-${movie.id}`}
          className="relative w-full max-w-2xl bg-slate-900 rounded-2xl overflow-hidden shadow-2xl shadow-teal-500/20 border border-slate-800"
        >
          {/* Close Button */}
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 z-10 p-2 bg-black/50 rounded-full text-white hover:bg-teal-500 hover:text-black transition-colors"
          >
            <X size={20} />
          </button>

          {/* Banner Image */}
          <div className="relative h-[300px] w-full">
            <Image
              src={`${BACKDROP_BASE}${movie.backdrop_path || movie.poster_path}`}
              alt={movie.title || movie.name}
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
          </div>

          {/* Content */}
          <div className="p-8 -mt-20 relative">
            <motion.h2 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 mb-2"
            >
              {movie.title || movie.name}
            </motion.h2>

            <div className="flex items-center gap-4 mb-6 text-sm text-slate-300">
              <span className="flex items-center gap-1 text-yellow-400">
                <Star size={16} fill="currentColor" /> {movie.vote_average.toFixed(1)}
              </span>
              <span>{movie.release_date || movie.first_air_date}</span>
            </div>

            <p className="text-slate-300 leading-relaxed mb-8">
              {movie.overview}
            </p>

            <div className="flex gap-4">
               {/* Satisfying Button 1: Watchlist */}
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 0 15px rgba(45, 212, 191, 0.5)" }}
                whileTap={{ scale: 0.95 }}
                onClick={() => toggleWatchlist(movie)}
                className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition-all ${
                  inList 
                  ? 'bg-transparent border-2 border-teal-400 text-teal-400' 
                  : 'bg-teal-500 text-slate-900 hover:bg-teal-400'
                }`}
              >
                {inList ? <Check size={20} /> : <Plus size={20} />}
                {inList ? 'Added to Watchlist' : 'Add to Watchlist'}
              </motion.button>
              
               {/* Satisfying Button 2: More Info (Mock) */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-3 rounded-full font-semibold bg-slate-800 text-white hover:bg-blue-600 transition-colors"
              >
                More Details
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}