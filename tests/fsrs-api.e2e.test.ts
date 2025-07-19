// tests/fsrs-api.e2e.test.ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import { randomUUID } from "crypto";
import { Rating, State, FsrsSnapshot, ReviewResult } from "../src/contracts"; // re‑export the interfaces above
import app from '../src/app';
import { db } from '../src/app';
import { users } from '../src/db/schema';

const apiKey = process.env.API_KEY!;
const request = supertest.agent(app).set("X-API-Key", apiKey);
const userId = randomUUID();                   // create an isolated test tenant

describe("FSRS API – happy path", () => {
    let deckId: string;
    let cardId: string;
    let originalSnapshot: FsrsSnapshot;

    beforeAll(async () => {
        await db.insert(users).values({ id: userId, email: 'test@example.com' });
    });

    it("creates a deck", async () => {
        const res = await request
            .post(`/users/${userId}/decks`)
            .send({ name: "Japanese N5", description: "Basic vocabulary" })
            .expect(201);

        deckId = res.body.id;
        expect(res.body).toMatchObject({ name: "Japanese N5", userId });
    });

    it("adds a card", async () => {
        const cardRes = await request
            .post(`/users/${userId}/decks/${deckId}/cards`)
            .send({
                data: { front: "猫", back: "cat" }
            })
            .expect(201);

        cardId = cardRes.body.id;
        originalSnapshot = cardRes.body.fsrs;
        expect(cardRes.body.data.front).toBe("猫");
    });

    it("reviews the card with rating = Good", async () => {
        const reviewRes = await request
            .post(`/users/${userId}/decks/${deckId}/cards/${cardId}/review`)
            .send({ rating: Rating.Good })
            .expect(200);

        const result: ReviewResult = reviewRes.body;

        expect(result.card.fsrs.state).not.toBe(State.New);
        expect(new Date(result.card.fsrs.due).getTime())
            .toBeGreaterThan(new Date(originalSnapshot.due).getTime());

        // Log sanity check
        expect(result.log.cardId).toBe(cardId);
        expect(result.log.rating).toBe(Rating.Good);
    });

    it("lists cards and sees the updated snapshot", async () => {
        const listRes = await request
            .get(`/users/${userId}/decks/${deckId}/cards`)
            .expect(200);

        expect(listRes.body.items).toHaveLength(1);
        expect(listRes.body.items[0].id).toBe(cardId);
    });

    it("deletes the card", async () => {
        await request
            .delete(`/users/${userId}/decks/${deckId}/cards/${cardId}`)
            .expect(204);
    });

    it("deletes the deck", async () => {
        await request
            .delete(`/users/${userId}/decks/${deckId}`)
            .expect(204);
    });
});

describe("FSRS API – authentication guard", () => {
    it("rejects calls without an API key", async () => {
        await supertest(app)
            .get(`/users/${randomUUID()}/decks`)
            .expect(401);
    });
}); 