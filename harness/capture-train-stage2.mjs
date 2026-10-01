// Retain identical framing and checks for an honest Stage 1 / Stage 2 comparison.
process.env.TRAIN_STAGE = '2';
await import('./capture-train-stage1.mjs');
