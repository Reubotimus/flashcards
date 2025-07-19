export enum State { New = "New", Learning = "Learning", Review = "Review", Relearning = "Relearning" }

export enum Rating { Again = "Again", Hard = "Hard", Good = "Good", Easy = "Easy" }

export interface Deck {
    id: string;               // UUID v4
    userId: string;
    name: string;
    description?: string;
    createdAt: string;        // ISO date
    updatedAt: string;
}

export type CreateDeckDTO = Omit<Deck, "id" | "createdAt" | "updatedAt" | "userId">;

export type UpdateDeckDTO = Partial<Omit<CreateDeckDTO, never>>;

export interface FsrsSnapshot {
    due: string;              // Next review date
    stability: number;
    difficulty: number;
    elapsedDays: number;
    scheduledDays: number;
    learningSteps: number;
    reps: number;
    lapses: number;
    state: State;
    lastReview?: string;
}

export interface Card {
    id: string;               // UUID v4
    deckId: string;
    userId: string;
    data: Record<string, unknown>;  // Unstructured JSON supplied by the caller
    fsrs: FsrsSnapshot;             // Current scheduling state
    createdAt: string;
    updatedAt: string;
}

export interface CreateCardDTO {
    data: Record<string, unknown>;
    fsrs?: Partial<FsrsSnapshot>; // optional override at creation
}

export type UpdateCardDTO = Omit<Card, "id" | "deckId" | "userId" | "createdAt" | "updatedAt">;
export type PatchCardDTO = Partial<Pick<Card, "data">>;

export interface ReviewDTO {
    rating: Rating;
    reviewDate?: string;       // Defaults to now on server
}

export interface ReviewResult {
    card: Card;                // Updated snapshot after scheduling
    log: ReviewLog;
}

export interface ReviewLog {
    id: string;
    cardId: string;
    rating: Rating;
    state: State;              // State before the review
    due: string;               // Due before the review
    stability: number;         // Pre‑review
    difficulty: number;        // Pre‑review
    elapsedDays: number;       // Since last review
    lastElapsedDays: number;   // Between last two reviews
    scheduledDays: number;     // Interval to next review
    learningSteps: number;     // Learning steps after review
    review: string;            // Timestamp of the review itself
}

export interface ErrorResponse {
    error: string;
    message: string;
} 