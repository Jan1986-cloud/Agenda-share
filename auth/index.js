import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// This function will initialize all authentication providers
export async function init(app) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const providersDir = path.join(__dirname, 'providers');

    // Scan the providers directory
    const providerFiles = fs.readdirSync(providersDir).filter(file => file.endsWith('.js'));

    for (const file of providerFiles) {
        try {
            const providerPath = path.join(providersDir, file);
            // Convert the file path to a file URL to make it compatible with dynamic import on Windows
            const providerUrl = pathToFileURL(providerPath).href;
            const providerModule = await import(providerUrl);
            const register = providerModule.default; // We expect a default export

            // Each provider module must have a default export which is a 'register' function
            if (register && typeof register === 'function') {
                console.log(`[Auth] Initializing provider: ${file}`);
                register(app);
            } else {
                console.warn(`[Auth] Warning: ${file} is not a valid provider module. Missing default export function.`);
            }
        } catch (error) {
            console.error(`[Auth] Error loading provider ${file}:`, error);
        }
    }
}
