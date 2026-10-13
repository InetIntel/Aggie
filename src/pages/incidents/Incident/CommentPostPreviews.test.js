import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Linkify from 'linkify-react';
import { getReportByUrl } from '../../../api/reports';
import CommentPostPreviews, { commentPostUrls } from './CommentPostPreviews';

jest.mock('../../../api/reports', () => ({ getReportByUrl: jest.fn() }));
jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../../../components/DateTime', () => () => null);

const url = 'https://kolektiva.social/@iranluttes/117434410894758337';
let container, client;
beforeEach(() => {
  getReportByUrl.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } }, logger: { log: console.log, warn: console.warn, error: () => {} } });
});
afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(container); }); client.clear(); container.remove(); });
async function render(text) {
  await act(async () => {
    ReactDOM.render(<QueryClientProvider client={client}><p><Linkify>{text}</Linkify></p><CommentPostPreviews text={text} /></QueryClientProvider>, container);
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

test('extracts complete HTTP(S) links, excludes email and unsafe protocols, and deduplicates', () => {
  expect(commentPostUrls(`Before (${url}).\n${url} https://x.com/user/status/123?a=1&b=2 user@example.com javascript:alert(1)`)).toEqual([url, 'https://x.com/user/status/123?a=1&b=2']);
  expect(commentPostUrls('No links <script>alert(1)</script>')).toEqual([]);
  expect(commentPostUrls(Array.from({ length: 20 }, (_, i) => `https://example.com/${i}`).join(' '))).toHaveLength(10);
});

test('matching database report delegates text and media to SocialMediaPost', async () => {
  getReportByUrl.mockResolvedValue({ url, author: 'Local author', _media: ['mastodon'], content: 'Stored Mastodon post', metadata: { rawAPIResponse: {}, attachments: [{ type: 'image', thumbnailUrl: '/media/social/thumb/image.jpg' }] } });
  await render(`Context\n${url}\n${url}`);
  expect(getReportByUrl).toHaveBeenCalledTimes(1);
  expect(getReportByUrl).toHaveBeenCalledWith(url);
  expect(container.querySelector('div.post-text').textContent.trim()).toBe('Stored Mastodon post');
  expect(container.querySelector('img').getAttribute('src')).toBe('/media/social/thumb/image.jpg');
  expect(container.querySelector('p').textContent).toBe(`Context\n${url}\n${url}`);
});

test.each(['missing', 'error'])('keeps the clickable link on %s', async (state) => {
  if (state === 'error') getReportByUrl.mockRejectedValue(new Error('Forbidden'));
  else getReportByUrl.mockResolvedValue(null);
  await render(url);
  expect(container.querySelector('a').href).toBe(url);
  expect(container.querySelector('div.post-text')).toBeNull();
});

test('cached misses are retried and Twitter posts render real text and remote media', async () => {
  const postUrl = 'https://x.com/clashreport/status/2110032049184657797';
  client.setQueryData(['comment-post', postUrl], null);
  getReportByUrl.mockResolvedValue({ url: 'https://twitter.com/temp/status/2110032049184657797', author: 'clashreport', _media: ['twitter'], content: 'Real post rendering path', metadata: { rawAPIResponse: {}, mediaUrl: 'https://example.com/post-thumbnail.jpg' } });
  await render(postUrl);
  expect(getReportByUrl).toHaveBeenCalledWith(postUrl);
  expect(container.querySelector('div.post-text').textContent.trim()).toBe('Real post rendering path');
  expect(container.querySelector('img').getAttribute('src')).toBe('https://example.com/post-thumbnail.jpg');
});

test('pending lookups preserve links and updated comments remove old previews', async () => {
  getReportByUrl.mockImplementation(() => new Promise(() => {}));
  await render(url);
  expect(container.querySelector('a').href).toBe(url);
  await render('Edited comment <img src=x onerror=alert(1)>');
  expect(container.querySelector('a, article, img')).toBeNull();
  expect(container.textContent).toBe('Edited comment <img src=x onerror=alert(1)>');
});
