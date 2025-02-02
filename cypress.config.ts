import { install } from './src';
import { defineConfig } from 'cypress';
import { promisify } from 'util';
import { access, constants, unlink } from 'fs';
import { tmpdir } from 'os';

export default defineConfig({
  video: false,
  fixturesFolder: false,
  screenshotOnRunFailure: false,
  e2e: {
    baseUrl: 'http://localhost:8080',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    setupNodeEvents(
      on: Cypress.PluginEvents,
      _: Cypress.PluginConfigOptions
    ): void {
      install(on);

      on('task', {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        async 'fs:exists'(path: string): Promise<boolean> {
          try {
            await promisify(access)(path, constants.F_OK);

            return true;
          } catch {
            return false;
          }
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        async 'fs:remove'(path: string): Promise<null> {
          try {
            await promisify(unlink)(path);
          } catch {
            // noop
          }

          return null;
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'fs:tmpdir'(): string {
          return tmpdir();
        }
      });
    }
  }
});
