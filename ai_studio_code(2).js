'use client';
import { Film, Search, User } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Navbar() {
  return (
    <nav className="fixed w-full z-50 top-0 transition-all duration-300 bg-gradient-to-b from-slate-950/90 to-transparent backdrop-blur-sm p-4">
      <div className="flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-teal-400 font-bold text-2xl tracking-tighter cursor-pointer">
          <Film className="w-8 h-8" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500">
            StreamFlow
          </span>
        </div>
        <div className="flex gap-4">
          <NavIcon icon={Search} />
          <NavIcon icon={User} />
        </div>
      </div>
    </nav>
  );
}

function NavIcon({ icon: Icon }) {
  return (
    <motion.button
      whileHover={{ scale: 1.1, color: '#2dd4bf' }}
      whileTap={{ scale: 0.9 }}
      className="p-2 rounded-full bg-slate-800/50 hover:bg-slate-700/50 text-white transition-colors"
    >
      <Icon size={20} />
    </motion.button>
  );
}