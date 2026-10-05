// `npm run dev` starts the whole studio: the API and the page in front of it.
// The runner lives in frontend/dev.mjs so `explainroo studio` starts exactly
// the same thing.
import { startStudio } from '../frontend/dev.mjs';

await startStudio({ port: Number(process.env.PORT || 5173) });
