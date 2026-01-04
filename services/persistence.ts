import { UserProfile, ChessGame, Drill, DrillSchedule, TimeControl } from '../types';

const STORAGE_KEYS = {
  USER: 'coachreps_user',
  RAW_GAMES: 'coachreps_raw_games',
  DRILLS: 'coachreps_drills',
  SCHEDULES: 'coachreps_schedules',
  PREFS_TC: 'coachreps_prefs_tc'
};

const safeParse = <T>(key: string, fallback: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    console.warn(`[Persistence] Failed to parse ${key}`, e);
    // If corrupt, clear it to prevent persistent crashes
    try { localStorage.removeItem(key); } catch (err) {}
    return fallback;
  }
};

export const persistence = {
  saveUser: (user: UserProfile) => {
    try { localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user)); } catch (e) {}
  },
  loadUser: (): UserProfile | null => {
    return safeParse<UserProfile | null>(STORAGE_KEYS.USER, null);
  },

  saveGames: (games: ChessGame[]) => {
    try { localStorage.setItem(STORAGE_KEYS.RAW_GAMES, JSON.stringify(games)); } catch (e) {}
  },
  loadGames: (): ChessGame[] => {
    return safeParse<ChessGame[]>(STORAGE_KEYS.RAW_GAMES, []);
  },

  saveDrills: (drills: Drill[]) => {
    try { localStorage.setItem(STORAGE_KEYS.DRILLS, JSON.stringify(drills)); } catch (e) {}
  },
  loadDrills: (): Drill[] => {
    return safeParse<Drill[]>(STORAGE_KEYS.DRILLS, []);
  },

  saveSchedules: (schedules: Record<string, DrillSchedule>) => {
    try { localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules)); } catch (e) {}
  },
  loadSchedules: (): Record<string, DrillSchedule> => {
    return safeParse<Record<string, DrillSchedule>>(STORAGE_KEYS.SCHEDULES, {});
  },

  saveTimeControls: (tcs: TimeControl[]) => {
    try { localStorage.setItem(STORAGE_KEYS.PREFS_TC, JSON.stringify(tcs)); } catch (e) {}
  },
  loadTimeControls: (): TimeControl[] => {
    return safeParse<TimeControl[]>(STORAGE_KEYS.PREFS_TC, ['rapid', 'blitz', 'classical']);
  },

  clearAll: () => {
    try { localStorage.clear(); } catch(e) {}
  }
};