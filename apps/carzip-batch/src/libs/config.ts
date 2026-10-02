/**************************************
 *          BATCH CONSTANTS           *
 **************************************/

/** names of the scheduled jobs (also used as log context) */
export const BATCH_ROLLBACK = 'BATCH_ROLLBACK';
export const BATCH_TOP_CARS = 'BATCH_TOP_CARS';
export const BATCH_TOP_AGENTS = 'BATCH_TOP_AGENTS';
export const BATCH_TEST_DRIVE_EXPIRE = 'BATCH_TEST_DRIVE_EXPIRE';
export const BATCH_TEST_DRIVE_REMIND = 'BATCH_TEST_DRIVE_REMIND';
export const BATCH_TEST_DRIVE_FOLLOW_UP = 'BATCH_TEST_DRIVE_FOLLOW_UP';
export const BATCH_UPLOAD_CLEANUP = 'BATCH_UPLOAD_CLEANUP';

/** jobs run on Korea time, whatever timezone the server is in (cloud servers are usually UTC) */
export const BATCH_TIMEZONE = 'Asia/Seoul';
