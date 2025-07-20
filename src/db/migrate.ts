import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config();
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);

const main = async () => {
    try {
        await migrate(db, { migrationsFolder: 'migrations' });
        console.log('Migration completed');
    } catch (error) {
        console.error('Error during migration:', error);
        process.exit(1);
    }
};

main(); 