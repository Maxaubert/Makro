// Barcode flows against the local stack and the fixture product file. Headless Chromium has no
// camera and no BarcodeDetector, so the scanner test installs fakes (a canvas stream and a
// detector that reads window.__code). That proves the screens and the camera shut-off, not real decoding.
import { expect, test, type Page } from '@playwright/test';
import { inviteUser, readOtp } from './local';

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

async function signInAndOnboard(page: Page) {
  const email = `barcode-${Date.now()}@example.test`;
  await inviteUser(email);
  await page.goto('/');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await page.getByLabel(/6-digit code/).fill(await readOtp(email));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('checkbox', { name: /Store my weight/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Male', exact: true }).click();
  await page.getByLabel('Age').fill('30');
  await page.getByLabel('Height').fill('182');
  await page.getByLabel('Weight').fill('81,5');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start logging' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

async function typeCode(page: Page, code: string) {
  await page.goto('/#/code');
  await page.getByLabel('Barcode').fill(code);
  await page.getByRole('button', { name: 'Find product' }).click();
}

const FAKE_CAMERA = `
    const w = window;
    w.__code = '';
    w.__live = 0;
    w.BarcodeDetector = class {
      static async getSupportedFormats() {
        return ['ean_13', 'ean_8', 'upc_a'];
      }
      async detect() {
        return w.__code ? [{ rawValue: w.__code }] : [];
      }
    };
    const md = {
      async getUserMedia() {
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = 240;
        const g = c.getContext('2d');
        setInterval(() => {
          g.fillStyle = '#444';
          g.fillRect(0, 0, 320, 240);
        }, 50);
        const stream = c.captureStream(15);
        stream.getTracks().forEach((t) => {
          w.__live = w.__live + 1;
          const stop = t.stop.bind(t);
          t.stop = () => {
            if (t.readyState === 'live') w.__live = w.__live - 1;
            stop();
          };
        });
        return stream;
      },
    };
    Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true });
`;

const live = (page: Page) => page.evaluate('window.__live') as Promise<number>;

test('typed codes: product, found without nutrition, not found', async ({ page }) => {
  await signInAndOnboard(page);

  await typeCode(page, '7038010012345');
  await expect(page.getByTestId('portion-name')).toHaveText('Skyr Naturell');

  await typeCode(page, '7039010019999');
  await expect(page.getByTestId('no-data-name')).toHaveText('Skyr Mango');
  await expect(page.getByText('No nutrition data')).toBeVisible();
  await shot(page, 'B_NoData');
  await page.getByRole('link', { name: 'Enter numbers from the label' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Skyr Mango');
  await expect(page.getByLabel(/Brand/)).toHaveValue('Q');
  await expect(page.getByLabel(/Barcode/)).toHaveValue('7039010019999');

  await typeCode(page, '7041234567895');
  await expect(page.getByRole('heading', { name: 'Not in the database' })).toBeVisible();
  await shot(page, 'B_NotFound');
  await page.getByRole('link', { name: 'Add custom food' }).click();
  await expect(page.getByLabel(/Barcode/)).toHaveValue('7041234567895');
  await page.getByLabel('Name', { exact: true }).fill('Mystery bar');
  await page.getByRole('button', { name: 'Save and choose portion' }).click();
  await expect(page.getByTestId('portion-name')).toHaveText('Mystery bar');

  // The same code again now opens the saved food instead of asking again.
  await typeCode(page, '7041234567895');
  await expect(page.getByTestId('portion-name')).toHaveText('Mystery bar');
});

test('camera scan with a fake detector, and the camera stops when leaving', async ({ page }) => {
  await page.addInitScript(FAKE_CAMERA);
  await signInAndOnboard(page);
  await page.goto('/#/scan');
  await expect(page.getByText('Point at the barcode')).toBeVisible();
  await expect.poll(() => live(page)).toBe(1);
  await shot(page, 'B_Scan');

  // Leaving the screen turns the camera off.
  await page.getByRole('link', { name: 'Close scanner' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect.poll(() => live(page)).toBe(0);

  // A code that reads twice leads to the product, and the camera is off then too.
  await page.goto('/#/scan');
  await expect.poll(() => live(page)).toBe(1);
  await page.evaluate("window.__code = '7038010012345'");
  await expect(page.getByTestId('portion-name')).toHaveText('Skyr Naturell');
  await expect.poll(() => live(page)).toBe(0);
});
