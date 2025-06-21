import esbuild from 'esbuild';

async function build() {
    try {
        // Build for the extension backend
        await esbuild.build({
            entryPoints: ['src/extension.ts'],
            bundle: true,
            outfile: 'dist/extension.js',
            platform: 'node',
            target: 'node16',
            format: 'cjs',
            external: ['vscode'],
            sourcemap: true,
            keepNames: true,
            minify: false, 
        });

        // Build for the webview frontend
        await esbuild.build({
            entryPoints: ['src/webview/js/app.js'],
            bundle: true,
            outfile: 'dist/webview/js/app.js',
            platform: 'browser',
            target: 'es2020',
            format: 'esm',
            sourcemap: true,
            minify: false,
        });

        console.log('✅ Build successful!');
    } catch (e) {
        console.error('❌ Build failed:', e);
        process.exit(1);
    }
}

build();