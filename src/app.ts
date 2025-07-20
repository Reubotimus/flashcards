import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import * as T from './types';
import { fsrs, FSRS, Card as FsrsCard, Rating as FsrsRating, State as FsrsState, createEmptyCard } from 'ts-fsrs';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and } from 'drizzle-orm';
import * as schema from './db/schema';
import { neon } from "@neondatabase/serverless";
import { ApiError, handleErrors } from "./error";

dotenv.config();

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });


const app = express();
app.use(express.json());

//
// ──────────────────────────────────────────  HELPERS ─────
//

const dbToDeck = (deck: typeof schema.decks.$inferSelect): T.Deck => {
    if (!deck.createdAt || !deck.updatedAt) {
        throw new Error("Deck creation or update time is null");
    }
    return {
        ...deck,
        description: deck.description ?? undefined,
        createdAt: deck.createdAt.toISOString(),
        updatedAt: deck.updatedAt.toISOString(),
    }
}

const dbToCard = (card: typeof schema.cards.$inferSelect): T.Card => {
    if (!card.createdAt || !card.updatedAt) {
        throw new Error("Card creation or update time is null");
    }
    const {
        due, stability, difficulty, elapsedDays, scheduledDays, reps, lapses, state, lastReview,
        ...rest
    } = card;
    return {
        ...rest,
        createdAt: card.createdAt.toISOString(),
        updatedAt: card.updatedAt.toISOString(),
        data: card.data as Record<string, unknown>,
        fsrs: {
            due: due.toISOString(),
            stability: parseFloat(stability),
            difficulty: parseFloat(difficulty),
            elapsedDays,
            scheduledDays,
            reps,
            lapses,
            state: state as T.State,
            lastReview: lastReview?.toISOString(),
            // `learningSteps` is on the pre-review log, not the card snapshot
            // This is a slight mismatch between ts-fsrs and our schema.
            // For now, we'll synthesize it.
            learningSteps: 0,
        }
    };
};

const dbToFsrsCard = (dbCard: typeof schema.cards.$inferSelect): FsrsCard => {
    return {
        due: dbCard.due,
        stability: parseFloat(dbCard.stability),
        difficulty: parseFloat(dbCard.difficulty),
        elapsed_days: dbCard.elapsedDays,
        scheduled_days: dbCard.scheduledDays,
        reps: dbCard.reps,
        lapses: dbCard.lapses,
        state: FsrsState[dbCard.state as keyof typeof FsrsState],
        last_review: dbCard.lastReview ?? undefined,
        learning_steps: dbCard.learningSteps
    };
};

const dbToReviewLog = (log: typeof schema.reviewLogs.$inferSelect): T.ReviewLog => {
    return {
        ...log,
        rating: log.rating as T.Rating,
        state: log.state as T.State,
        stability: parseFloat(log.stability),
        difficulty: parseFloat(log.difficulty),
        due: log.due.toISOString(),
        review: log.review.toISOString(),
    }
}


const fsrsToDb = (fsrsCard: FsrsCard): Omit<typeof schema.cards.$inferInsert, 'id' | 'deckId' | 'userId' | 'data'> => {
    return {
        due: fsrsCard.due,
        stability: fsrsCard.stability.toString(),
        difficulty: fsrsCard.difficulty.toString(),
        elapsedDays: fsrsCard.elapsed_days,
        scheduledDays: fsrsCard.scheduled_days,
        learningSteps: fsrsCard.learning_steps,
        reps: fsrsCard.reps,
        lapses: fsrsCard.lapses,
        state: FsrsState[fsrsCard.state] as T.State,
        lastReview: fsrsCard.last_review,
    }
}


//
// ──────────────────────────────────────── ASYNC WRAPPER ─────
//

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;

const asyncHandler = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
    return Promise
        .resolve(fn(req, res, next))
        .catch(next);
};


// Middleware for API Key Authentication
const apiKeyAuth = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.get('X-API-Key');
    if (!apiKey) {
        throw new ApiError(401, 'Unauthorized', 'Missing API key');
    }
    // In a real app, we'd use a secure constant-time comparison after hashing the key.
    // We'd also fetch the key from the database and check if it's active.
    // For this example, we'll use a simple comparison.
    const expectedApiKey = process.env.API_KEY;
    if (apiKey !== expectedApiKey) {
        throw new ApiError(401, 'Unauthorized', 'Invalid API key');
    }
    next();
});

app.use(apiKeyAuth);


// --- Decks ---

// Get all decks for a user
app.get('/users/:userId/decks', asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const decks = await db.select().from(schema.decks).where(eq(schema.decks.userId, userId));
    res.json({ items: decks.map(dbToDeck) });
}));

// Create a new deck
app.post('/users/:userId/decks', asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const createDeckDto: T.CreateDeckDTO = req.body;

    await db.insert(schema.users).values({
        id: userId,
    }).onConflictDoNothing({ target: schema.users.id });

    const [newDeck] = await db.insert(schema.decks).values({
        userId,
        ...createDeckDto,
    }).returning();

    res.status(201).json(dbToDeck(newDeck));
}));

// Get one deck
app.get('/users/:userId/decks/:deckId', asyncHandler(async (req: Request, res: Response) => {
    const { userId, deckId } = req.params;

    const [deck] = await db.select().from(schema.decks).where(
        and(
            eq(schema.decks.id, deckId),
            eq(schema.decks.userId, userId)
        )
    );

    if (!deck) {
        throw new ApiError(404, 'DeckNotFound', `Deck with id ${deckId} not found`);
    }

    res.json(dbToDeck(deck));
}));

// Update metadata
app.put('/users/:userId/decks/:deckId', asyncHandler(async (req: Request, res: Response) => {
    const { userId, deckId } = req.params;
    const updateDeckDto: T.UpdateDeckDTO = req.body;

    const [updatedDeck] = await db.update(schema.decks).set({
        ...updateDeckDto,
        updatedAt: new Date(),
    }).where(
        and(
            eq(schema.decks.id, deckId),
            eq(schema.decks.userId, userId)
        )
    ).returning();

    if (!updatedDeck) {
        throw new ApiError(404, 'DeckNotFound', `Deck with id ${deckId} not found`);
    }

    res.json(dbToDeck(updatedDeck));
}));

// Delete deck (cascade)
app.delete('/users/:userId/decks/:deckId', asyncHandler(async (req: Request, res: Response) => {
    const { userId, deckId } = req.params;
    const [deletedDeck] = await db.delete(schema.decks).where(
        and(
            eq(schema.decks.id, deckId),
            eq(schema.decks.userId, userId)
        )
    ).returning();

    if (!deletedDeck) {
        throw new ApiError(404, 'DeckNotFound', `Deck with id ${deckId} not found`);
    }

    res.status(204).send();
}));


// --- Cards ---

// List cards in a deck
app.get('/users/:userId/decks/:deckId/cards', asyncHandler(async (req: Request, res: Response) => {
    const { deckId, userId } = req.params;
    const cards = await db.select().from(schema.cards).where(
        and(
            eq(schema.cards.deckId, deckId),
            eq(schema.cards.userId, userId)
        )
    );
    res.json({ items: cards.map(dbToCard) });
}));

// Add a card
app.post('/users/:userId/decks/:deckId/cards', asyncHandler(async (req: Request, res: Response) => {
    const { userId, deckId } = req.params;
    const createCardDto: T.CreateCardDTO = req.body;

    const newFsrsCard = createEmptyCard(new Date());

    const [newCard] = await db.insert(schema.cards).values({
        id: uuidv4(),
        deckId,
        userId,
        data: createCardDto.data,
        ...fsrsToDb(newFsrsCard)
    }).returning();

    res.status(201).json(dbToCard(newCard));
}));

// Get one card
app.get('/users/:userId/decks/:deckId/cards/:cardId', asyncHandler(async (req: Request, res: Response) => {
    const { userId, deckId, cardId } = req.params;

    const [card] = await db.select().from(schema.cards).where(
        and(
            eq(schema.cards.id, cardId),
            eq(schema.cards.deckId, deckId),
            eq(schema.cards.userId, userId)
        )
    );

    if (!card) {
        throw new ApiError(404, 'CardNotFound', `Card with id ${cardId} not found`);
    }

    res.json(dbToCard(card));
}));

// Replace card
app.put('/users/:userId/decks/:deckId/cards/:cardId', asyncHandler(async (req: Request, res: Response) => {
    const { userId, deckId, cardId } = req.params;
    const updateCardDto: T.UpdateCardDTO = req.body;

    const [updatedCard] = await db.update(schema.cards).set({
        data: updateCardDto.data,
        updatedAt: new Date(),
    }).where(
        and(
            eq(schema.cards.id, cardId),
            eq(schema.cards.deckId, deckId),
            eq(schema.cards.userId, userId)
        )
    ).returning();

    if (!updatedCard) {
        throw new ApiError(404, 'CardNotFound', `Card with id ${cardId} not found`);
    }

    res.json(dbToCard(updatedCard));
}));

// Patch card data
app.patch('/users/:userId/decks/:deckId/cards/:cardId', asyncHandler(async (req: Request, res: Response) => {
    const { userId, deckId, cardId } = req.params;
    const patchCardDto: T.PatchCardDTO = req.body;

    const [card] = await db.select().from(schema.cards).where(
        and(
            eq(schema.cards.id, cardId),
            eq(schema.cards.deckId, deckId),
            eq(schema.cards.userId, userId)
        )
    );

    if (!card) {
        throw new ApiError(404, 'CardNotFound', `Card with id ${cardId} not found`);
    }

    const patchedCardResult = await db.update(schema.cards).set({
        data: patchCardDto.data,
        updatedAt: new Date(),
    }).where(
        and(
            eq(schema.cards.id, cardId),
            eq(schema.cards.deckId, deckId),
            eq(schema.cards.userId, userId)
        )
    ).returning();

    if (!patchedCardResult[0]) {
        throw new ApiError(500, 'UpdateFailed', `Failed to update card with id ${cardId}`);
    }


    res.json(dbToCard(patchedCardResult[0]));
}));

// Delete card
app.delete('/users/:userId/decks/:deckId/cards/:cardId', asyncHandler(async (req: Request, res: Response) => {
    const { userId, deckId, cardId } = req.params;
    const [deletedCard] = await db.delete(schema.cards).where(
        and(
            eq(schema.cards.id, cardId),
            eq(schema.cards.deckId, deckId),
            eq(schema.cards.userId, userId)
        )
    ).returning();

    if (!deletedCard) {
        throw new ApiError(404, 'CardNotFound', `Card with id ${cardId} not found`);
    }

    res.status(204).send();
}));

// --- Review ---

// Apply an FSRS rating
app.post('/users/:userId/decks/:deckId/cards/:cardId/review', asyncHandler(async (req: Request, res: Response) => {
    const { userId, deckId, cardId } = req.params;
    const reviewDto: T.ReviewDTO = req.body;
    const now = reviewDto.reviewDate ? new Date(reviewDto.reviewDate) : new Date();
    const rating = FsrsRating[reviewDto.rating as keyof typeof FsrsRating];

    const [cardFromDb] = await db.select().from(schema.cards).where(
        and(
            eq(schema.cards.id, cardId),
            eq(schema.cards.deckId, deckId),
            eq(schema.cards.userId, userId)
        )
    );

    if (!cardFromDb) {
        throw new ApiError(404, 'CardNotFound', `Card with id ${cardId} not found`);
    }

    const f = fsrs();
    const fsrsCard = dbToFsrsCard(cardFromDb);
    const schedulingResult = f.repeat(fsrsCard, now);

    let updatedFsrsCard: FsrsCard;
    switch (reviewDto.rating) {
        case T.Rating.Again:
            updatedFsrsCard = schedulingResult[FsrsRating.Again].card;
            break;
        case T.Rating.Hard:
            updatedFsrsCard = schedulingResult[FsrsRating.Hard].card;
            break;
        case T.Rating.Good:
            updatedFsrsCard = schedulingResult[FsrsRating.Good].card;
            break;
        case T.Rating.Easy:
            updatedFsrsCard = schedulingResult[FsrsRating.Easy].card;
            break;
        default:
            throw new ApiError(400, 'InvalidRating', 'Invalid rating value');
    }


    const [updatedCard] = await db.update(schema.cards).set({
        ...fsrsToDb(updatedFsrsCard),
        updatedAt: now,
    }).where(eq(schema.cards.id, cardId)).returning();

    const [reviewLog] = await db.insert(schema.reviewLogs).values({
        cardId,
        userId,
        rating: reviewDto.rating,
        state: cardFromDb.state,
        due: cardFromDb.due,
        stability: cardFromDb.stability,
        difficulty: cardFromDb.difficulty,
        elapsedDays: cardFromDb.elapsedDays,
        lastElapsedDays: 0, // This needs to be calculated based on previous review
        scheduledDays: updatedFsrsCard.scheduled_days,
        learningSteps: 0, // This needs to be calculated based on previous review
        review: now,
    }).returning();


    const reviewResult: T.ReviewResult = {
        card: dbToCard(updatedCard),
        log: dbToReviewLog(reviewLog),
    };

    res.json(reviewResult);
}));


//
// ──────────────────────────────────────── ERROR HANDLER ─────
//
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    handleErrors(err, res);
});


export default app; 