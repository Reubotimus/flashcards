import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
dotenv.config();

import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './db/schema';

const db = drizzle(process.env.DATABASE_URL as string, { schema });


const app = express();
const port = process.env.PORT ?? 3000;

app.get('/', async (req: Request, res: Response) => {
    // test the database connection by running a query
    const result = await db.query.users.findMany();
    console.log(result);
    res.send(result);
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
