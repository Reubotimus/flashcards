import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { config } from 'dotenv';

config({ path: '.env' });

const db = drizzle(process.env.DATABASE_URL!);

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