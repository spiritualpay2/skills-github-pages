const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const BASE_URL = process.env.NEXT_PUBLIC_TMDB_BASE_URL;

const fetchTMDB = async (endpoint) => {
  const res = await fetch(`${BASE_URL}${endpoint}?api_key=${API_KEY}&language=en-US`);
  if (!res.ok) throw new Error('Failed to fetch data');
  return res.json();
};

export const getTrending = async () => fetchTMDB('/trending/all/day');
export const getTopRated = async () => fetchTMDB('/movie/top_rated');
export const getActionMovies = async () => fetchTMDB('/discover/movie?with_genres=28');
export const getComedyMovies = async () => fetchTMDB('/discover/movie?with_genres=35');