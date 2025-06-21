import esbuild from 'esbuild';

async function build() {
    try {
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
        console.log('✅ Build successful!');
    } catch (e) {
        console.error('❌ Build failed:', e);
        process.exit(1);
    }
}

build();