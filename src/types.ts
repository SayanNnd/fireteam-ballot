export type RoomStatus = 'lobby' | 'voting' | 'revealed';

export interface Room {
  id: string;
  code: string;
  status: RoomStatus;
  picked_raid_id: string | null;
  host_player_id: string | null;
  created_at: string;
}

export interface Player {
  id: string;
  room_id: string;
  name: string;
  is_host: boolean;
  has_locked: boolean;
  veto_used: boolean;
  joined_at: string;
}

export interface Vote {
  id: string;
  room_id: string;
  player_id: string;
  raid_id: string;
  score: number;
  created_at: string;
}

export interface Veto {
  id: string;
  room_id: string;
  player_id: string;
  raid_id: string;
  created_at: string;
}

export interface HistoryItem {
  id: string;
  room_id: string;
  raid_id: string;
  picked_at: string;
}

export type { Raid } from './data/raids';
