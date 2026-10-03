/**
 * PM2: keeps the three CarZip processes running on the server and restarts them after a crash or reboot.
 *   pm2 start deploy/ecosystem.config.cjs     (from /var/www/carzip/CarZip)
 *   pm2 save && pm2 startup                   (start again after a server reboot)
 * Paths assume both repos are cloned into /var/www/carzip (see deploy/DEPLOY.md).
 */
const ROOT = '/var/www/carzip';

module.exports = {
	apps: [
		{
			name: 'carzip-api', // GraphQL API, uploads and live chat on port 3007
			cwd: `${ROOT}/CarZip`, // uploads/ lives here, the batch server sees the same folder
			script: 'dist/apps/carzip-api/main.js',
			env: { NODE_ENV: 'production' },
			max_memory_restart: '600M',
		},
		{
			name: 'carzip-batch', // nightly jobs (rankings, cleanups, reminders)
			cwd: `${ROOT}/CarZip`,
			script: 'dist/apps/carzip-batch/main.js',
			env: { NODE_ENV: 'production' },
			max_memory_restart: '300M',
		},
		{
			name: 'carzip-web', // the website (Next.js) on port 3000
			cwd: `${ROOT}/CarZip-next`,
			script: 'node_modules/next/dist/bin/next',
			args: 'start -p 3000',
			env: { NODE_ENV: 'production' },
			max_memory_restart: '600M',
		},
	],
};
