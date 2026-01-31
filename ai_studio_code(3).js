'use client';
import { motion } from 'framer-motion';
import Image from 'next/image';

const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

export default function MovieCard({ movie, onClick }) {
  return (
    <motion.div
      layoutId={`movie-${movie.id}`}
      whileHover={{ scale: 1.05, y: -5 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => onClick(movie)}
      className="relative min-w-[160px] h-[240px] md:min-w-[200px] md:h-[300px] rounded-xl overflow-hidden cursor-pointer group shadow-lg shadow-black/50"
    >
      <Image
        src={movie.poster_path ? `${IMAGE_BASE}${movie.poster_path}` : '/placeholder.png'}
        alt={movie.title || movie.name}
        fill
        className="object-cover transition-opacity duration-300 group-hover:opacity-80"
      />
      
      {/* Glow Effect on Hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-teal-900/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
        <p className="text-white font-semibold text-sm line-clamp-2">
          {movie.title || movie.name}
        </p>
      </div>
      
      {/* Border Glow */}
      <div className="absolute inset-0 border-2 border-transparent group-hover:border-teal-400/50 rounded-xl transition-colors duration-300 pointer-events-none" />
    </motion.div>
  );
}