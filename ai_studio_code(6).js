'use client';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Info } from 'lucide-react';

const BACKDROP_BASE = 'https://image.tmdb.org/t/p/original';

export default function Hero({ movie, onMoreInfo }) {
  if (!movie) return null;

  return (
    <div className="relative h-[80vh] w-full">
      <div className="absolute inset-0">
        <Image
          src={`${BACKDROP_BASE}${movie.backdrop_path}`}
          alt={movie.title}
          fill
          className="object-cover"
          priority
        />
        {/* Gradients for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/30 via-transparent to-slate-950" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 to-transparent" />
      </div>

      <div className="absolute bottom-0 left-0 p-8 md:p-16 max-w-2xl space-y-6">
        <motion.h1 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-4xl md:text-6xl font-extrabold text-white leading-tight"
        >
          {movie.title || movie.name}
        </motion.h1>
        
        <motion.p 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-lg text-slate-300 line-clamp-3"
        >
          {movie.overview}
        </motion.p>

        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="flex gap-4"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onMoreInfo(movie)}
            className="flex items-center gap-2 px-8 py-3 bg-teal-500 text-slate-900 rounded-full font-bold shadow-lg shadow-teal-500/30 hover:bg-teal-400 transition-colors"
          >
            <Info size={24} />
            More Info
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}