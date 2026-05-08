import { build, createServer } from 'vite';
import { rm, mkdir } from 'node:fs/promises';

const isDev = process.env.NODE_ENV === 'development';
const outDir = 'dist';

function demoDevAssetsPlugin() {
	const rewrites = new Map([
		['/dist/panel-stack.esm.js', '/src/panel-stack.js'],
		['/dist/panel-stack.min.css', '/src/panel-stack.css'],
		['/dist/panel-stack.css', '/src/panel-stack.css'],
	]);

	return {
		name: 'panel-stack-demo-dev-assets',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const url = new URL(req.url ?? '/', 'http://panel-stack.local');

				if (url.pathname === '/') {
					res.statusCode = 302;
					res.setHeader('Location', '/demo/');
					res.end();
					return;
				}

				const rewrite = rewrites.get(url.pathname);
				if (rewrite) {
					url.pathname = rewrite;
					req.url = `${url.pathname}${url.search}`;
				}

				next();
			});
		},
	};
}

function sharedBuild(overrides = {}) {
	return {
		configFile: false,
		logLevel: 'info',
		css: { transformer: 'lightningcss' },
		build: {
			outDir,
			emptyOutDir: false,
			sourcemap: true,
			target: 'es2022',
			reportCompressedSize: true,
			watch: null,
			...overrides.build,
		},
		...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'build')),
	};
}

function esmConfig({ emitCss = false } = {}) {
	return sharedBuild({
		build: {
			lib: {
				entry: 'src/panel-stack.js',
				fileName: () => 'panel-stack.esm.js',
				formats: ['es'],
				...(emitCss ? { cssFileName: 'panel-stack' } : {}),
			},
			minify: false,
			cssMinify: emitCss ? false : undefined,
			rolldownOptions: {
				output: { exports: 'named' },
			},
		},
	});
}

function umdMinConfig({ emitCss = false } = {}) {
	return sharedBuild({
		build: {
			lib: {
				entry: 'src/panel-stack.js',
				name: 'PanelStack',
				fileName: () => 'panel-stack.min.js',
				formats: ['umd'],
				...(emitCss ? { cssFileName: 'panel-stack.min' } : {}),
			},
			minify: 'terser',
			terserOptions: {
				mangle: { keep_classnames: true, keep_fnames: false },
			},
			cssMinify: emitCss ? 'lightningcss' : undefined,
			rolldownOptions: {
				output: { exports: 'named' },
			},
		},
	});
}

async function main() {
	if (isDev) {
		const server = await createServer({
			configFile: false,
			logLevel: 'info',
			root: '.',
			plugins: [demoDevAssetsPlugin()],
			server: { port: 3000, open: '/demo/', strictPort: false },
		});
		await server.listen();
		server.printUrls();
	} else {
		await rm(outDir, { recursive: true, force: true });
		await mkdir(outDir, { recursive: true });

		const configs = [esmConfig({ emitCss: true }), umdMinConfig({ emitCss: true })];
		for (const cfg of configs) {
			await build(cfg);
		}
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
