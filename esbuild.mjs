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
      // Keep original class and function names
      keepNames: true,
      // Minification can sometimes cause issues with stack traces and debugging
      minify: false, 
    });
    console.log('✅ Build successful!');
  } catch (e) {
    console.error('❌ Build failed:', e);
    process.exit(1);
  }
}

async function watch() {
    const context = await esbuild.context({
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
    await context.watch();
    console.log('👀 Watching for changes...');
}

const isWatchMode = process.argv.includes('--watch');

if (isWatchMode) {
    watch();
} else {
    build();
} 