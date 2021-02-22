export interface LiveVotingEntry {
  entry_id: number;
  entry_votes: number;
  song_id: number;
}

export type LiveVoting = Record<number, LiveVotingEntry[]>;
