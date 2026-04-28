import { app } from "$lib/server/app";
import type { RequestHandler } from "./$types";

export const fallback: RequestHandler = ({ request }) => app.handle(request);
