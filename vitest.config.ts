import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      // 報告放在 node_modules 底下，不會在專案根目錄產生未追蹤的檔案（不修改 .gitignore）
      reportsDirectory: 'node_modules/.cache/vitest-coverage',
      include: [
        'src/units.ts',
        'src/geometry/**/*.ts',
        'src/services/**/*.ts',
        'src/settings/**/*.ts',
        'src/imposition/**/*.ts',
        'src/export/**/*.ts',
        'src/editor/pathHistory.ts',
        'src/editor/guardMessage.ts',
        'src/utils/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        'src/geometry/testUtils.ts',
        'src/geometry/worker.ts',
        'src/imposition/measureSvg.ts',
        'src/utils/imageProcessing.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
