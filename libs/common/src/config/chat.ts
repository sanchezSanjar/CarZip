/** live chat settings shared by the API (saves and sends messages) and the batch server (cleans old ones up) */

/** how many recent messages a newcomer receives, and how many are always kept */
export const CHAT_HISTORY = 15;

/** messages older than this are deleted every night (the newest CHAT_HISTORY always stay) */
export const CHAT_KEEP_DAYS = 30;
