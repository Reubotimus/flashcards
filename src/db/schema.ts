/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
    pgTable,
    uuid,
    text,
    jsonb,
    timestamp,
    boolean,
    numeric,
    integer,
    primaryKey,
    index,
    pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

//
// ────────────────────────────────────────
//  ENUMS
// ────────────────────────────────────────
//

export const stateEnum = pgEnum("state", ["New", "Learning", "Review", "Relearning"]);
export const ratingEnum = pgEnum("rating", ["Again", "Hard", "Good", "Easy"]);

//
// ────────────────────────────────────────
//  TABLE: users  (minimal – external Ids are acceptable)
// ────────────────────────────────────────
//

export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    // optional descriptive fields
    email: text("email").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

//
// ────────────────────────────────────────
//  TABLE: api_keys  (one‑way hashed keys)
// ────────────────────────────────────────
//

export const apiKeys = pgTable("api_keys", {
    id: uuid("id").primaryKey().defaultRandom(),
    hash: text("hash").notNull(),                 // bcrypt/argon2 etc.
    label: text("label"),
    active: boolean("active").notNull().default(true),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
}, (t) => ({
    idxHash: index("idx_api_keys_hash").on(t.hash),
}));

//
// ────────────────────────────────────────
//  TABLE: decks
// ────────────────────────────────────────
//

export const decks = pgTable("decks", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
    idxUserName: index("idx_decks_user_name").on(t.userId, t.name),
}));

//
// ────────────────────────────────────────
//  TABLE: cards
// ────────────────────────────────────────
//

export const cards = pgTable("cards", {
    id: uuid("id").primaryKey().defaultRandom(),
    deckId: uuid("deck_id").notNull().references(() => decks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

    // unstructured payload (front, back, hints, media, etc.)
    data: jsonb("data").notNull(),

    // FSRS snapshot
    due: timestamp("due", { withTimezone: true }).notNull(),
    stability: numeric("stability").notNull(),
    difficulty: numeric("difficulty").notNull(),
    elapsedDays: integer("elapsed_days").notNull(),
    scheduledDays: integer("scheduled_days").notNull(),
    learningSteps: integer("learning_steps").notNull(),
    reps: integer("reps").notNull(),
    lapses: integer("lapses").notNull(),
    state: stateEnum("state").notNull(),
    lastReview: timestamp("last_review", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
    idxDue: index("idx_cards_due").on(t.userId, t.due),
    idxDeckState: index("idx_cards_deck_state").on(t.deckId, t.state),
}));

//
// ────────────────────────────────────────
//  TABLE: review_logs  (immutable append‑only)
// ────────────────────────────────────────
//

export const reviewLogs = pgTable("review_logs", {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    rating: ratingEnum("rating").notNull(),
    // state & snapshot BEFORE this review:
    state: stateEnum("state").notNull(),
    due: timestamp("due", { withTimezone: true }).notNull(),
    stability: numeric("stability").notNull(),
    difficulty: numeric("difficulty").notNull(),
    elapsedDays: integer("elapsed_days").notNull(),
    lastElapsedDays: integer("last_elapsed_days").notNull(),
    scheduledDays: integer("scheduled_days").notNull(),
    learningSteps: integer("learning_steps").notNull(),
    review: timestamp("review", { withTimezone: true }).notNull(),
}, (t) => ({
    idxCardDate: index("idx_review_card_date").on(t.cardId, t.review),
    idxUserDate: index("idx_review_user_date").on(t.userId, t.review),
}));

//
// ────────────────────────────────────────
//  RELATION HELPERS (optional, aids type‑safe joins)
// ────────────────────────────────────────
//

export const usersRelations = relations(users, ({ many }) => ({
    decks: many(decks),
    cards: many(cards),
    apiKeys: many(apiKeys),
    reviewLogs: many(reviewLogs),
}));

export const decksRelations = relations(decks, ({ one, many }) => ({
    owner: one(users, { fields: [decks.userId], references: [users.id] }),
    cards: many(cards),
}));

export const cardsRelations = relations(cards, ({ one, many }) => ({
    deck: one(decks, { fields: [cards.deckId], references: [decks.id] }),
    owner: one(users, { fields: [cards.userId], references: [users.id] }),
    logs: many(reviewLogs),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
    owner: one(users, { fields: [apiKeys.userId], references: [users.id] }),
}));

export const logsRelations = relations(reviewLogs, ({ one }) => ({
    card: one(cards, { fields: [reviewLogs.cardId], references: [cards.id] }),
    owner: one(users, { fields: [reviewLogs.userId], references: [users.id] }),
})); 